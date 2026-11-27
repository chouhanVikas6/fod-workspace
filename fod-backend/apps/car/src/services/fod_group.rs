use proto_defination::common::{FodGroupStatus, PaginationMeta};
use proto_defination::fod_group::fod_group_service_server::FodGroupService;
use proto_defination::fod_group::{
    FodGroupEntity, FodGroupListResponse, GroupCountRequest, GroupCountResponse,
    ListGroupsRequest, ResolutionResult, ResolveGroupsRequest, ResolveGroupsResponse,
    StreamGroupsRequest,
};
use proto_defination::replication::{change, Change, CommandOutcome};
use std::collections::HashMap;
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use uuid::Uuid;
use zoid_db::models::{FodGroupRow, FodRow};
use zoid_db::Db;
use zoid_storage::FrameStorage;

pub struct FodGroupServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
    group_tx: broadcast::Sender<FodGroupEntity>,
    change_tx: broadcast::Sender<Change>,
    node_id: String,
}

impl FodGroupServiceImpl {
    pub fn new(
        db: Db,
        storage: Arc<FrameStorage>,
        group_tx: broadcast::Sender<FodGroupEntity>,
        change_tx: broadcast::Sender<Change>,
        node_id: String,
    ) -> Self {
        Self {
            db,
            storage,
            group_tx,
            change_tx,
            node_id,
        }
    }

    async fn build_fod_proto_with_frame(&self, row: &FodRow) -> proto_defination::fod::FodEntity {
        let mut entity = row.to_proto();
        if !entity.frame_missing && !entity.image_sha256.is_empty() {
            if let Ok(bytes) = self.storage.read_frame(&entity.image_sha256, false).await {
                entity.frame_jpeg = bytes;
            }
        }
        entity
    }

    async fn attach_primary_fod(&self, mut group: FodGroupEntity) -> FodGroupEntity {
        let mut fod_row = if let Some(ref bid) = group.biggest_fod {
            if let Ok(uuid) = Uuid::parse_str(bid) {
                self.db.get_fod(uuid).await.ok().flatten()
            } else {
                None
            }
        } else {
            None
        };
        if fod_row.is_none() {
            fod_row = self
                .db
                .get_biggest_fod_for_group(group.mission_id, group.group_id)
                .await
                .ok()
                .flatten();
        }
        if let Some(row) = fod_row {
            if group.biggest_fod.is_none() {
                group.biggest_fod = Some(row.id.to_string());
                group.biggest_fod_size = Some(row.size);
            }
            group.primary_fod = Some(self.build_fod_proto_with_frame(&row).await);
        }
        group
    }

    async fn enrich_groups_batch(&self, rows: Vec<FodGroupRow>) -> Vec<FodGroupEntity> {
        let ids: Vec<Uuid> = rows
            .iter()
            .filter_map(|g| g.biggest_fod)
            .collect();
        let fetched = self.db.get_fods_by_ids(&ids).await.unwrap_or_default();
        let by_id: HashMap<Uuid, FodRow> = fetched.into_iter().map(|f| (f.id, f)).collect();

        let mut out = Vec::with_capacity(rows.len());
        for g in rows {
            let mut entity = g.to_proto();
            let row_opt = g
                .biggest_fod
                .and_then(|id| by_id.get(&id).cloned());
            let row_opt = match row_opt {
                Some(r) => Some(r),
                None => self
                    .db
                    .get_biggest_fod_for_group(g.mission_id, g.group_id)
                    .await
                    .ok()
                    .flatten(),
            };
            if let Some(row) = row_opt {
                if entity.biggest_fod.is_none() {
                    entity.biggest_fod = Some(row.id.to_string());
                    entity.biggest_fod_size = Some(row.size);
                }
                entity.primary_fod = Some(self.build_fod_proto_with_frame(&row).await);
            }
            out.push(entity);
        }
        out
    }
}

#[tonic::async_trait]
impl FodGroupService for FodGroupServiceImpl {
    async fn list_groups(
        &self,
        request: Request<ListGroupsRequest>,
    ) -> Result<Response<FodGroupListResponse>, Status> {
        let req = request.into_inner();
        let pagination = req.pagination.unwrap_or(proto_defination::common::PaginationRequest {
            page: 1,
            limit: 50,
        });
        let page = pagination.page.max(1) as i64;
        let limit = pagination.limit.clamp(1, 50) as i64;
        let offset = (page - 1) * limit;
        let updated_since = req
            .updated_since_ms
            .filter(|&ms| ms > 0)
            .and_then(chrono::DateTime::from_timestamp_millis);

        let (groups, total_items) = self
            .db
            .list_fod_groups_since(req.mission_id, limit, offset, updated_since)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let total_pages = if limit > 0 {
            ((total_items + limit - 1) / limit) as i32
        } else {
            1
        };

        let entities = self.enrich_groups_batch(groups).await;

        Ok(Response::new(FodGroupListResponse {
            groups: entities,
            pagination: Some(PaginationMeta {
                current_page: page as i32,
                page_size: limit as i32,
                total_items,
                total_pages,
            }),
        }))
    }

    async fn get_group_count(
        &self,
        request: Request<GroupCountRequest>,
    ) -> Result<Response<GroupCountResponse>, Status> {
        let req = request.into_inner();
        let count = self
            .db
            .get_group_count(req.mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(GroupCountResponse {
            mission_id: req.mission_id,
            count,
        }))
    }

    async fn resolve_groups(
        &self,
        request: Request<ResolveGroupsRequest>,
    ) -> Result<Response<ResolveGroupsResponse>, Status> {
        let req = request.into_inner();
        let mut results = Vec::with_capacity(req.resolutions.len());

        for res in req.resolutions {
            if self.db.is_mission_cold_stored(res.mission_id).await.unwrap_or(false) {
                return Err(Status::failed_precondition(format!(
                    "Mission {} is cold-stored (frozen); restore it before modifying FOD groups",
                    res.mission_id
                )));
            }
            let cmd_uuid = Uuid::parse_str(&res.command_id).unwrap_or_else(|_| Uuid::new_v4());

            // Check if already applied
            if let Ok(Some(applied)) = self.db.get_applied_command(cmd_uuid).await {
                if let Ok(Some(group)) = self.db.get_fod_group(res.mission_id, res.group_id).await {
                    results.push(ResolutionResult {
                        command_id: res.command_id,
                        outcome: format!("{:?}", CommandOutcome::try_from(applied.outcome as i32).unwrap_or(CommandOutcome::OutcomeUnspecified)),
                        group: Some(group.to_proto()),
                        pending: false,
                    });
                    continue;
                }
            }

            let desired_proto = FodGroupStatus::try_from(res.desired_status)
                .unwrap_or(FodGroupStatus::GroupStatusUnspecified);
            let decided_at = if res.decided_at_ms > 0 {
                res.decided_at_ms
            } else {
                chrono::Utc::now().timestamp_millis()
            };
            let actor = if !res.origin_node.is_empty() {
                res.origin_node.clone()
            } else {
                "car-operator".to_string()
            };

            let mutation = self.db.mutate_fod_group(res.mission_id, res.group_id, |current| {
                let local = current.versioned();
                let base_vv = if !res.base_version_vector.is_empty() {
                    Some(zoid_replication::vv_from_map(&res.base_version_vector))
                } else if res.base_version > 0 && local.vv.is_empty() {
                    let mut b = std::collections::BTreeMap::new();
                    b.insert("legacy".to_string(), res.base_version);
                    Some(b)
                } else {
                    None
                };
                let (outcome, next_v) = zoid_replication::apply_local_decision(
                    &local,
                    desired_proto,
                    base_vv.as_ref(),
                    decided_at,
                    &actor,
                    &self.node_id,
                );
                let write = next_v.map(|st| zoid_db::models::GroupWrite {
                    state: st,
                    dirty: false,
                });
                (write, outcome)
            }).await.map_err(|e| Status::internal(e.to_string()))?;

            let (outcome_str, final_group) = match mutation {
                None => ("NOT_FOUND".to_string(), None),
                Some((before, after, outcome)) => {
                    let outcome_str = format!("{:?}", outcome);
                    let final_proto = match after {
                        Some(ug) => {
                            let proto_ug = ug.to_proto();
                            let from_st = format!("{:?}", before.status).to_uppercase();
                            let to_st = format!("{:?}", ug.status).to_uppercase();
                            let _ = self
                                .db
                                .record_group_action(
                                    res.mission_id,
                                    res.group_id,
                                    &from_st,
                                    &to_st,
                                    &actor,
                                    decided_at,
                                    &res.command_id,
                                )
                                .await;
                            let new_seq = self
                                .db
                                .append_change(2, &format!("{}:{}", res.mission_id, res.group_id))
                                .await
                                .unwrap_or(0);
                            let _ = self
                                .db
                                .record_applied_command(cmd_uuid, CommandOutcome::Applied as i16, ug.version)
                                .await;
                            let enriched = self.attach_primary_fod(proto_ug.clone()).await;
                            let _ = self.group_tx.send(enriched.clone());
                            if new_seq > 0 {
                                let _ = self.change_tx.send(Change {
                                    seq: new_seq,
                                    entity: Some(change::Entity::Group(enriched)),
                                    frame_jpeg: Vec::new(),
                                    cleared_images: Vec::new(),
                                });
                            }
                            proto_ug
                        }
                        None => before.to_proto(),
                    };
                    (outcome_str, Some(final_proto))
                }
            };

            results.push(ResolutionResult {
                command_id: res.command_id,
                outcome: outcome_str,
                group: final_group,
                pending: false,
            });
        }

        Ok(Response::new(ResolveGroupsResponse { results }))
    }

    type StreamGroupsStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<FodGroupEntity, Status>> + Send + 'static>>;

    async fn stream_groups(
        &self,
        request: Request<StreamGroupsRequest>,
    ) -> Result<Response<Self::StreamGroupsStream>, Status> {
        let req = request.into_inner();
        let target_mission_id = req.mission_id;
        let rx = self.group_tx.subscribe();

        let stream = BroadcastStream::new(rx).filter_map(move |res| match res {
            Ok(group) => {
                if target_mission_id == 0 || group.mission_id == target_mission_id {
                    Some(Ok(group))
                } else {
                    None
                }
            }
            Err(_) => None,
        });

        Ok(Response::new(Box::pin(stream)))
    }
}
