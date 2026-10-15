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
use zoid_db::models::FodGroupStatus as DbGroupStatus;
use zoid_db::Db;
use zoid_replication::{decide, CommandRequest, GroupState};

pub struct FodGroupServiceImpl {
    db: Db,
    group_tx: broadcast::Sender<FodGroupEntity>,
}

impl FodGroupServiceImpl {
    pub fn new(db: Db, group_tx: broadcast::Sender<FodGroupEntity>) -> Self {
        Self { db, group_tx }
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

            // Fetch current group
            let group_opt = self
                .db
                .get_fod_group(res.mission_id, res.group_id)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;

            let current_group = match group_opt {
                Some(g) => g,
                None => {
                    results.push(ResolutionResult {
                        command_id: res.command_id,
                        outcome: "NOT_FOUND".to_string(),
                        group: None,
                        pending: false,
                    });
                    continue;
                }
            };

            let desired_proto = FodGroupStatus::try_from(res.desired_status)
                .unwrap_or(FodGroupStatus::GroupStatusUnspecified);
            let desired_db = DbGroupStatus::from(desired_proto);

            let group_state = GroupState {
                status: FodGroupStatus::from(current_group.status.clone()),
                version: current_group.version,
            };
            let cmd_req = CommandRequest {
                desired_status: desired_proto,
                base_version: res.base_version,
            };

            let outcome = decide(&group_state, &cmd_req);

            let (final_group, outcome_str) = match outcome {
                CommandOutcome::Applied => {
                    let updated = self
                        .db
                        .update_fod_group_status(
                            res.mission_id,
                            res.group_id,
                            desired_db,
                            current_group.version,
                        )
                        .await
                        .map_err(|e| Status::internal(e.to_string()))?;

                    if let Some(g) = updated {
                        let proto_g = g.to_proto();
                        let _ = self
                            .db
                            .append_change(2, &format!("{}:{}", res.mission_id, res.group_id))
                            .await;
                        let _ = self
                            .db
                            .record_applied_command(cmd_uuid, CommandOutcome::Applied as i16, g.version)
                            .await;
                        let _ = self.group_tx.send(proto_g.clone());
                        (Some(proto_g), "APPLIED".to_string())
                    } else {
                        (Some(current_group.to_proto()), "REJECTED_STALE".to_string())
                    }
                }
                CommandOutcome::NoOp => (Some(current_group.to_proto()), "NO_OP".to_string()),
                CommandOutcome::RejectedCleared => {
                    (Some(current_group.to_proto()), "REJECTED_CLEARED".to_string())
                }
                CommandOutcome::RejectedStale => {
                    (Some(current_group.to_proto()), "REJECTED_STALE".to_string())
                }
                CommandOutcome::RejectedInvalid => {
                    (Some(current_group.to_proto()), "REJECTED_INVALID".to_string())
                }
                _ => (Some(current_group.to_proto()), "REJECTED_INVALID".to_string()),
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
