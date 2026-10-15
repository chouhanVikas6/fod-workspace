use proto_defination::common::PaginationMeta;
use proto_defination::mission::mission_service_server::MissionService;
use proto_defination::mission::{
    ActiveMissionResponse, GetActiveMissionRequest, ListMissionsRequest, ListMissionsResponse,
    ListMissionsWithStatsRequest, MissionDetail, MissionStatsResponse, MissionWithStats,
    RetrieveMissionRequest, RetrieveMissionResponse, UpdateMissionRequest,
};
use tonic::{Request, Response, Status};
use zoid_db::Db;

pub struct AtcMissionServiceImpl {
    db: Db,
}

impl AtcMissionServiceImpl {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[tonic::async_trait]
impl MissionService for AtcMissionServiceImpl {
    async fn list_missions(
        &self,
        request: Request<ListMissionsRequest>,
    ) -> Result<Response<ListMissionsResponse>, Status> {
        let req = request.into_inner();
        let pagination = req.pagination.unwrap_or(proto_defination::common::PaginationRequest {
            page: 1,
            limit: 20,
        });
        let page = pagination.page.max(1) as i64;
        let limit = pagination.limit.clamp(1, 100) as i64;
        let offset = (page - 1) * limit;

        let (missions, total_items) = self
            .db
            .list_missions(limit, offset)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let total_pages = if limit > 0 {
            ((total_items + limit - 1) / limit) as i32
        } else {
            1
        };

        let entities: Vec<MissionDetail> = missions.into_iter().map(|m| m.to_proto()).collect();

        Ok(Response::new(ListMissionsResponse {
            missions: entities,
            pagination: Some(PaginationMeta {
                current_page: page as i32,
                page_size: limit as i32,
                total_items,
                total_pages,
            }),
        }))
    }

    async fn list_missions_with_stats(
        &self,
        _request: Request<ListMissionsWithStatsRequest>,
    ) -> Result<Response<MissionStatsResponse>, Status> {
        let (missions, _) = self
            .db
            .list_missions(50, 0)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let mut stats = Vec::with_capacity(missions.len());
        for m in missions {
            let (total_fod_groups, total_fods) = self
                .db
                .get_mission_stats(m.id)
                .await
                .unwrap_or((0, 0));

            stats.push(MissionWithStats {
                mission: Some(m.to_proto()),
                total_fod_groups,
                total_fods,
                cleared_count: 0,
            });
        }

        Ok(Response::new(MissionStatsResponse { stats }))
    }

    async fn get_active_mission(
        &self,
        _request: Request<GetActiveMissionRequest>,
    ) -> Result<Response<ActiveMissionResponse>, Status> {
        let active = self
            .db
            .get_active_mission()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(ActiveMissionResponse {
            active_mission: active.map(|m| m.to_proto()),
        }))
    }

    async fn retrieve_mission_data(
        &self,
        request: Request<RetrieveMissionRequest>,
    ) -> Result<Response<RetrieveMissionResponse>, Status> {
        let mission_id = request.into_inner().mission_id;
        let mission = self
            .db
            .get_mission(mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("Mission {} not found", mission_id)))?;

        let (total_fod_groups, total_fods) = self
            .db
            .get_mission_stats(mission_id)
            .await
            .unwrap_or((0, 0));

        Ok(Response::new(RetrieveMissionResponse {
            mission: Some(mission.to_proto()),
            total_fod_groups,
            total_fods,
        }))
    }

    async fn update_mission(
        &self,
        _request: Request<UpdateMissionRequest>,
    ) -> Result<Response<MissionDetail>, Status> {
        Err(Status::permission_denied("Missions are controlled authoritatively on the Car daemon"))
    }
}
