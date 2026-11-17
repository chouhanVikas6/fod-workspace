use proto_defination::fod::fod_service_server::FodService;
use proto_defination::fod::{
    FodEntity, GetBiggestFodRequest, GetFodRequest, GetFodsByGroupRequest, GetFodsResponse,
};
use std::sync::Arc;
use tonic::{Request, Response, Status};
use uuid::Uuid;
use zoid_db::Db;
use zoid_storage::FrameStorage;

pub struct FodServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
}

impl FodServiceImpl {
    pub fn new(db: Db, storage: Arc<FrameStorage>) -> Self {
        Self { db, storage }
    }

    async fn attach_frame(&self, mut entity: FodEntity) -> FodEntity {
        if !entity.frame_missing && !entity.image_sha256.is_empty() {
            if let Ok(bytes) = self.storage.read_frame(&entity.image_sha256, false).await {
                entity.frame_jpeg = bytes;
            }
        }
        entity
    }
}

#[tonic::async_trait]
impl FodService for FodServiceImpl {
    async fn get_fods_by_group(
        &self,
        request: Request<GetFodsByGroupRequest>,
    ) -> Result<Response<GetFodsResponse>, Status> {
        let req = request.into_inner();
        let excluded: Vec<Uuid> = req
            .excluded_ids
            .iter()
            .filter_map(|s| Uuid::parse_str(s).ok())
            .collect();

        let rows = self
            .db
            .get_fods_for_group(req.mission_id, req.group_id, &excluded)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let mut fods = Vec::with_capacity(rows.len());
        for row in rows {
            fods.push(self.attach_frame(row.to_proto()).await);
        }

        Ok(Response::new(GetFodsResponse { fods }))
    }

    async fn get_biggest_fod_per_group(
        &self,
        request: Request<GetBiggestFodRequest>,
    ) -> Result<Response<GetFodsResponse>, Status> {
        let req = request.into_inner();
        let rows = self
            .db
            .get_biggest_fods_for_mission(req.mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let mut fods = Vec::with_capacity(rows.len());
        for row in rows {
            fods.push(self.attach_frame(row.to_proto()).await);
        }

        Ok(Response::new(GetFodsResponse { fods }))
    }

    async fn get_fod(&self, request: Request<GetFodRequest>) -> Result<Response<FodEntity>, Status> {
        let id_str = request.into_inner().id;
        let uuid = Uuid::parse_str(&id_str)
            .map_err(|_| Status::invalid_argument("Invalid UUID format"))?;

        let fod = self
            .db
            .get_fod(uuid)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("FOD {} not found", id_str)))?;

        Ok(Response::new(self.attach_frame(fod.to_proto()).await))
    }
}
