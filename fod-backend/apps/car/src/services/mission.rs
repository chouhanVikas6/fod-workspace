use proto_defination::common::PaginationMeta;
use proto_defination::mission::mission_service_server::MissionService;
use proto_defination::mission::{
    ActiveMissionResponse, ArchiveChunk, ColdStoreMissionRequest, ColdStoreMissionResponse,
    DropMissionHotDataRequest, DropMissionHotDataResponse, ExportMissionArchiveRequest,
    GetActiveMissionRequest, GetStorageOverviewRequest, ImportMissionArchiveResponse,
    ListMissionTemplatesRequest, ListMissionTemplatesResponse, ListMissionsRequest,
    ListMissionsResponse, ListMissionsWithStatsRequest, MissionDetail, MissionStatsResponse,
    MissionStorageEntry, MissionTemplateEntity, MissionWithStats, NodeDiskInfo,
    RestoreColdMissionRequest, RestoreColdMissionResponse, RetrieveMissionRequest,
    RetrieveMissionResponse, StorageOverviewResponse, StoragePolicyConfig,
    SyncMissionTemplatesRequest, SyncMissionTemplatesResponse, UpdateMissionRequest,
    UpsertMissionTemplateResponse,
};
use proto_defination::replication::{change, Change};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::broadcast;
use tonic::{Request, Response, Status, Streaming};
use zoid_db::models::{MissionScanStatus as DbScanStatus, MissionStatus as DbMissionStatus};
use zoid_db::Db;
use zoid_storage::{dir_size_bytes, disk_usage_for_path, FrameStorage};

pub struct MissionServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
    change_tx: broadcast::Sender<Change>,
}

impl MissionServiceImpl {
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
impl MissionService for MissionServiceImpl {
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
            if m.storage_tier == "COLD_STORED" {
                continue;
            }
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
        request: Request<UpdateMissionRequest>,
    ) -> Result<Response<MissionDetail>, Status> {
        let req = request.into_inner();
        let db_status = req
            .status
            .and_then(|s| proto_defination::common::MissionStatus::try_from(s).ok())
            .map(DbMissionStatus::from);
        let db_scan = req
            .scan_status
            .and_then(|s| proto_defination::common::MissionScanStatus::try_from(s).ok())
            .map(DbScanStatus::from);

        let updated = self
            .db
            .update_mission(
                req.mission_id,
                db_status,
                db_scan,
                req.timer,
                req.speed,
                req.pass,
            )
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let _ = self
            .db
            .append_change(1, &req.mission_id.to_string())
            .await;

        Ok(Response::new(updated.to_proto()))
    }

    async fn list_mission_templates(
        &self,
        _request: Request<ListMissionTemplatesRequest>,
    ) -> Result<Response<ListMissionTemplatesResponse>, Status> {
        let rows = self
            .db
            .get_all_mission_templates()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        let templates = rows.into_iter().map(|r| r.to_proto()).collect();
        Ok(Response::new(ListMissionTemplatesResponse { templates }))
    }

    async fn upsert_mission_template(
        &self,
        request: Request<MissionTemplateEntity>,
    ) -> Result<Response<UpsertMissionTemplateResponse>, Status> {
        let tmpl = request.into_inner();
        if tmpl.id.trim().is_empty() {
            return Err(Status::invalid_argument("Template id cannot be empty"));
        }
        let row = self
            .db
            .upsert_replicated_mission_template(&tmpl)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let proto_tmpl = row.to_proto();
        let seq = self.db.append_change(6, &row.id).await.unwrap_or(0);
        let _ = self.change_tx.send(Change {
            seq,
            entity: Some(change::Entity::MissionTemplate(proto_tmpl.clone())),
            frame_jpeg: Vec::new(),
            cleared_images: Vec::new(),
        });

        Ok(Response::new(UpsertMissionTemplateResponse {
            success: true,
            template: Some(proto_tmpl),
            error: String::new(),
        }))
    }

    async fn sync_mission_templates(
        &self,
        request: Request<SyncMissionTemplatesRequest>,
    ) -> Result<Response<SyncMissionTemplatesResponse>, Status> {
        let since_ms = request.into_inner().since_ms;
        let rows = if since_ms <= 0 {
            self.db.get_all_mission_templates().await
        } else {
            let since_dt = chrono::DateTime::from_timestamp_millis(since_ms)
                .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
            self.db.get_mission_templates_since(since_dt).await
        }
        .map_err(|e| Status::internal(e.to_string()))?;

        let templates = rows.into_iter().map(|r| r.to_proto()).collect();
        Ok(Response::new(SyncMissionTemplatesResponse { templates }))
    }

    async fn cold_store_mission(
        &self,
        _request: Request<ColdStoreMissionRequest>,
    ) -> Result<Response<ColdStoreMissionResponse>, Status> {
        Err(Status::permission_denied(
            "Cold storage backups are managed on the ATC server",
        ))
    }

    async fn restore_cold_mission(
        &self,
        _request: Request<RestoreColdMissionRequest>,
    ) -> Result<Response<RestoreColdMissionResponse>, Status> {
        Err(Status::permission_denied(
            "Cold storage restores are managed on the ATC server",
        ))
    }

    async fn drop_mission_hot_data(
        &self,
        request: Request<DropMissionHotDataRequest>,
    ) -> Result<Response<DropMissionHotDataResponse>, Status> {
        let req = request.into_inner();
        let mission = self
            .db
            .get_mission(req.mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("Mission {} not found", req.mission_id)))?;

        if mission.status == DbMissionStatus::Active {
            return Err(Status::failed_precondition(
                "Cannot drop hot data for an ACTIVE mission",
            ));
        }

        let target_tier = if req.target_tier.is_empty() {
            "CAR_DROPPED"
        } else {
            req.target_tier.as_str()
        };
        let next_epoch = req.storage_epoch.max(mission.storage_epoch + 1);

        let (updated, safe_shas) = self
            .db
            .purge_mission_hot_data(
                req.mission_id,
                target_tier,
                next_epoch,
                None,
                None,
                None,
                None,
            )
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let (freed, removed) = self.storage.delete_frames(&safe_shas).await;
        let seq = self
            .db
            .append_change(1, &req.mission_id.to_string())
            .await
            .unwrap_or(0);
        let _ = self.change_tx.send(Change {
            seq,
            entity: Some(change::Entity::Mission(updated.to_proto())),
            frame_jpeg: Vec::new(),
            cleared_images: Vec::new(),
        });

        Ok(Response::new(DropMissionHotDataResponse {
            success: true,
            message: format!("Dropped mission {} hot data on Car", req.mission_id),
            bytes_freed: freed as i64,
            frames_removed: removed as i64,
        }))
    }

    type ExportMissionArchiveStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<ArchiveChunk, Status>> + Send + 'static>>;

    async fn export_mission_archive(
        &self,
        request: Request<ExportMissionArchiveRequest>,
    ) -> Result<Response<Self::ExportMissionArchiveStream>, Status> {
        let mission_id = request.into_inner().mission_id;
        let bundle = self
            .db
            .build_mission_archive_bundle(&self.storage, mission_id, "car-primary")
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        let filename = match bundle.manifest.display_id {
            Some(did) => format!("mission-{}-d{}.zoidpack", mission_id, did),
            None => format!("mission-{}.zoidpack", mission_id),
        };
        let bytes = tokio::task::spawn_blocking(move || {
            zoid_storage::archive::encode_archive_bytes(&bundle)
        })
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .map_err(|e| Status::internal(e.to_string()))?;

        let total_size = bytes.len() as i64;
        let chunks: Vec<Result<ArchiveChunk, Status>> = bytes
            .chunks(256 * 1024)
            .map(|slice| {
                Ok(ArchiveChunk {
                    data: slice.to_vec(),
                    filename: filename.clone(),
                    total_size,
                    import_to_fleet: false,
                })
            })
            .collect();

        Ok(Response::new(Box::pin(tokio_stream::iter(chunks))))
    }

    async fn import_mission_archive(
        &self,
        _request: Request<Streaming<ArchiveChunk>>,
    ) -> Result<Response<ImportMissionArchiveResponse>, Status> {
        Err(Status::permission_denied(
            "Archive imports are managed on the ATC server",
        ))
    }

    async fn get_storage_overview(
        &self,
        _request: Request<GetStorageOverviewRequest>,
    ) -> Result<Response<StorageOverviewResponse>, Status> {
        let (total_bytes, used_bytes, free_bytes, usage_percent) =
            disk_usage_for_path(self.storage.base_dir()).await;
        let frames_bytes = dir_size_bytes(self.storage.base_dir()).await;

        let all_missions = self
            .db
            .list_all_missions_unpaginated()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let mut hot_count = 0i64;
        let mut entries = Vec::with_capacity(all_missions.len());
        for m in all_missions {
            let (groups, fods, cleared, dirty, hot_bytes) = self
                .db
                .get_mission_storage_summary(m.id)
                .await
                .unwrap_or((0, 0, 0, 0, 0));
            let present_hot =
                m.storage_tier == "HOT" && (groups > 0 || fods > 0 || m.status == DbMissionStatus::Active);
            if present_hot || m.storage_tier == "HOT" {
                hot_count += 1;
            }
            let mut detail = m.to_proto();
            detail.storage_bytes = Some(hot_bytes);
            entries.push(MissionStorageEntry {
                mission: Some(detail),
                total_fod_groups: groups,
                total_fods: fods,
                cleared_count: cleared,
                dirty_group_count: dirty,
                hot_bytes,
                archive_bytes: 0,
                present_hot_on_atc: false,
                present_cold_on_atc: false,
                present_hot_on_car: m.storage_tier == "HOT",
                car_storage_tier: m.storage_tier,
            });
        }

        let car_disk = NodeDiskInfo {
            node_id: "car-primary".to_string(),
            online: true,
            total_bytes,
            used_bytes,
            free_bytes,
            usage_percent,
            frames_bytes,
            archives_bytes: 0,
            hot_mission_count: hot_count,
            cold_mission_count: 0,
        };

        Ok(Response::new(StorageOverviewResponse {
            atc_disk: None,
            car_disk: Some(car_disk),
            missions: entries,
            policy: None,
        }))
    }

    async fn update_storage_policy(
        &self,
        _request: Request<StoragePolicyConfig>,
    ) -> Result<Response<StoragePolicyConfig>, Status> {
        Err(Status::permission_denied(
            "Storage policies are managed on the ATC server",
        ))
    }
}