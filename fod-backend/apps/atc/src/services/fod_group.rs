use proto_defination::common::{FodGroupStatus as ProtoGroupStatus, PaginationMeta};
use proto_defination::fod_group::fod_group_service_server::FodGroupService;
use proto_defination::fod_group::{
    FodGroupEntity, FodGroupListResponse, GroupCountRequest, GroupCountResponse,
    ListGroupsRequest, ResolutionResult, ResolveGroupsRequest, ResolveGroupsResponse,
    StreamGroupsRequest,
};
use proto_defination::replication::Command;
use std::pin::Pin;
use tokio::sync::{broadcast, mpsc};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use zoid_db::models::FodGroupStatus as DbGroupStatus;
use zoid_db::Db;

pub struct AtcFodGroupServiceImpl {
    db: Db,
    cmd_tx: mpsc::Sender<Command>,
    group_tx: broadcast::Sender<FodGroupEntity>,
}

impl AtcFodGroupServiceImpl {
    pub fn new(
        db: Db,
        cmd_tx: mpsc::Sender<Command>,
        group_tx: broadcast::Sender<FodGroupEntity>,
    ) -> Self {
        Self {
            db,
            cmd_tx,
            group_tx,
        }
    }
}

#[tonic::async_trait]
impl FodGroupService for AtcFodGroupServiceImpl {
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

            let desired_proto = ProtoGroupStatus::try_from(res.desired_status)
                .unwrap_or(ProtoGroupStatus::GroupStatusUnspecified);
            let desired_db = DbGroupStatus::from(desired_proto);

            // Optimistically update status in ATC replica DB so all connected clients see it
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

            let proto_g = if let Some(g) = updated {
                let proto = g.to_proto();
                let _ = self.group_tx.send(proto.clone());
                proto
            } else {
                current_group.to_proto()
            };

            let cmd = Command {
                command_id: res.command_id.clone(),
                mission_id: res.mission_id,
                group_id: res.group_id,
                desired_status: res.desired_status,
                base_version: res.base_version,
                operator_id: "atc-operator".to_string(),
                origin_node: "atc-replica".to_string(),
                issued_at_ms: chrono::Utc::now().timestamp_millis(),
                cleared: None,
            };

            let _ = self.cmd_tx.send(cmd).await;

            results.push(ResolutionResult {
                command_id: res.command_id,
                outcome: "APPLIED".to_string(),
                group: Some(proto_g),
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
