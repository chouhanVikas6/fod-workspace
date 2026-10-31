use proto_defination::common::{FodGroupStatus, PaginationMeta};
use proto_defination::fod_group::fod_group_service_server::FodGroupService;
use proto_defination::fod_group::{
    FodGroupEntity, FodGroupListResponse, GroupCountRequest, GroupCountResponse,
    ListGroupsRequest, ResolutionResult, ResolveGroupsRequest, ResolveGroupsResponse,
    StreamGroupsRequest,
};
use proto_defination::replication::CommandOutcome;
use std::pin::Pin;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use uuid::Uuid;
use zoid_db::Db;

pub struct FodGroupServiceImpl {
    db: Db,
    group_tx: broadcast::Sender<FodGroupEntity>,
    node_id: String,
}

impl FodGroupServiceImpl {
    pub fn new(db: Db, group_tx: broadcast::Sender<FodGroupEntity>, node_id: String) -> Self {
        Self { db, group_tx, node_id }
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
        let limit = pagination.limit.clamp(1, 200) as i64;
        let offset = (page - 1) * limit;

        let (groups, total_items) = self
            .db
            .list_fod_groups(req.mission_id, limit, offset)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let total_pages = if limit > 0 {
            ((total_items + limit - 1) / limit) as i32
        } else {
            1
        };

        let entities: Vec<FodGroupEntity> = groups.into_iter().map(|g| g.to_proto()).collect();

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
            let base_vv = if res.base_version_vector.is_empty() {
                if res.base_version > 0 {
                    let mut b = std::collections::BTreeMap::new();
                    b.insert("legacy".to_string(), res.base_version);
                    Some(b)
                } else {
                    None
                }
            } else {
                Some(zoid_replication::vv_from_map(&res.base_version_vector))
            };
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
                            let _ = self
                                .db
                                .append_change(2, &format!("{}:{}", res.mission_id, res.group_id))
                                .await;
                            let _ = self
                                .db
                                .record_applied_command(cmd_uuid, CommandOutcome::Applied as i16, ug.version)
                                .await;
                            let _ = self.group_tx.send(proto_ug.clone());
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
