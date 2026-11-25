use proto_defination::cleared_fod::cleared_fod_service_server::ClearedFodService;
use proto_defination::cleared_fod::{
    ClearedFodEntity, FindClearedFodRequest, RecordClearedFodRequest,
};
use proto_defination::replication::{change, Change};
use std::sync::Arc;
use tokio::sync::broadcast;
use tonic::{Request, Response, Status};
use uuid::Uuid;
use zoid_db::Db;
use zoid_storage::FrameStorage;

pub struct ClearedFodServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
    change_tx: broadcast::Sender<Change>,
}

impl ClearedFodServiceImpl {
    pub fn new(
        db: Db,
        storage: Arc<FrameStorage>,
        change_tx: broadcast::Sender<Change>,
    ) -> Self {
        Self {
            db,
            storage,
            change_tx,
        }
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

    async fn record_cleared_fod(
        &self,
        request: Request<RecordClearedFodRequest>,
    ) -> Result<Response<ClearedFodEntity>, Status> {
        let req = request.into_inner();
        let _ = self.db.ensure_mission_exists(req.mission_id).await;

        let status = proto_defination::common::ClearedFodStatus::try_from(req.status)
            .map(zoid_db::models::ClearedFodStatus::from)
            .unwrap_or(zoid_db::models::ClearedFodStatus::Found);
        let (lat, lon, sd) = req
            .location
            .map(|l| (l.lat, l.lon, l.sd))
            .unwrap_or((0.0, 0.0, 0.0));
        let created_at = if req.created_at > 0 {
            chrono::DateTime::from_timestamp_millis(req.created_at)
                .unwrap_or_else(chrono::Utc::now)
        } else {
            chrono::Utc::now()
        };

        let row = zoid_db::models::ClearedFodRow {
            id: Uuid::parse_str(&req.id).unwrap_or_else(|_| Uuid::new_v4()),
            mission_id: req.mission_id,
            group_id: req.group_id,
            status,
            before_image_sha256: req.before_image_sha256,
            after_image_sha256: req.after_image_sha256,
            lat,
            lon,
            sd,
            created_at,
            created_by: req.created_by,
        };

        self.db
            .insert_cleared_fod(&row)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let proto_entity = row.to_proto();
        let seq = self
            .db
            .append_change(4, &format!("{}:{}", row.mission_id, row.group_id))
            .await
            .unwrap_or(0);

        let mut cleared_images = Vec::new();
        for sha in row
            .before_image_sha256
            .iter()
            .chain(row.after_image_sha256.iter())
        {
            if !sha.is_empty() {
                if let Ok(bytes) = self.storage.read_frame(sha, false).await {
                    cleared_images.push(bytes);
                }
            }
        }

        let _ = self.change_tx.send(Change {
            seq,
            entity: Some(change::Entity::Cleared(proto_entity.clone())),
            frame_jpeg: Vec::new(),
            cleared_images,
        });

        Ok(Response::new(proto_entity))
    }
}
