use proto_defination::cleared_fod::cleared_fod_service_server::ClearedFodService;
use proto_defination::cleared_fod::{ClearedFodEntity, FindClearedFodRequest};
use tonic::{Request, Response, Status};
use zoid_db::Db;

pub struct ClearedFodServiceImpl {
    db: Db,
}

impl ClearedFodServiceImpl {
    pub fn new(db: Db) -> Self {
        Self { db }
    }
}

#[tonic::async_trait]
impl ClearedFodService for ClearedFodServiceImpl {
    async fn find_cleared_fod(
        &self,
        request: Request<FindClearedFodRequest>,
    ) -> Result<Response<ClearedFodEntity>, Status> {
        let req = request.into_inner();
        let cleared = self
            .db
            .get_cleared_fod(req.mission_id, req.group_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| {
                Status::not_found(format!(
                    "Cleared FOD record for mission {} group {} not found",
                    req.mission_id, req.group_id
                ))
            })?;

        Ok(Response::new(cleared.to_proto()))
    }
}
