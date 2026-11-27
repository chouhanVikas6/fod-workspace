use futures::StreamExt;
use proto_defination::common::PaginationMeta;
use proto_defination::fod::fod_service_client::FodServiceClient;
use proto_defination::fod::{GetBiggestFodRequest, GetFodsByGroupRequest};
use proto_defination::fod_group::fod_group_service_client::FodGroupServiceClient;
use proto_defination::fod_group::ListGroupsRequest;
use proto_defination::mission::mission_service_client::MissionServiceClient;
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
use proto_defination::replication::StorageDirective;
use std::collections::HashMap;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;
use tonic::{Request, Response, Status, Streaming};
use zoid_db::models::{FleetStoragePolicy, MissionStatus as DbMissionStatus};
use zoid_db::Db;
use zoid_storage::{dir_size_bytes, disk_usage_for_path, FrameStorage};

pub struct AtcMissionServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
    archives_dir: PathBuf,
    car_url: String,
    node_id: String,
    template_tx: mpsc::Sender<MissionTemplateEntity>,
    storage_directive_tx: mpsc::Sender<StorageDirective>,
}

impl AtcMissionServiceImpl {
    pub fn new(
        db: Db,
        storage: Arc<FrameStorage>,
        archives_dir: PathBuf,
        car_url: String,
        node_id: String,
        template_tx: mpsc::Sender<MissionTemplateEntity>,
        storage_directive_tx: mpsc::Sender<StorageDirective>,
    ) -> Self {
        Self {
            db,
            storage,
            archives_dir,
            car_url,
            node_id,
            template_tx,
            storage_directive_tx,
        }
    }

    fn archive_path_for_mission(&self, mission_id: i64, existing: Option<&str>) -> PathBuf {
        if let Some(p) = existing.filter(|s| !s.trim().is_empty()) {
            PathBuf::from(p)
        } else {
            self.archives_dir
                .join(format!("mission-{mission_id}.zoidpack"))
        }
    }

    /// Best-effort pull of any missing groups, FODs, and JPEG frames from Car before freezing.
    async fn ensure_complete_mission_from_car(&self, mission_id: i64) {
        let Ok(ep) = tonic::transport::Endpoint::from_shared(self.car_url.clone()) else {
            return;
        };
        let Ok(ch) = ep
            .connect_timeout(Duration::from_millis(1200))
            .timeout(Duration::from_secs(10))
            .connect()
            .await
        else {
            return;
        };

        let mut fg_client = FodGroupServiceClient::new(ch.clone());
        let mut fod_client = FodServiceClient::new(ch.clone())
            .max_decoding_message_size(32 * 1024 * 1024);

        let mut page = 1;
        let mut group_ids = Vec::new();
        loop {
            let Ok(resp) = fg_client
                .list_groups(Request::new(ListGroupsRequest {
                    mission_id,
                    pagination: Some(proto_defination::common::PaginationRequest {
                        page,
                        limit: 200,
                    }),
                    updated_since_ms: None,
                }))
                .await
            else {
                break;
            };
            let inner = resp.into_inner();
            let total_pages = inner.pagination.map(|p| p.total_pages).unwrap_or(1);
            for g in &inner.groups {
                let _ = self.db.insert_replicated_group_if_absent(g, false).await;
                group_ids.push(g.group_id);
            }
            if page >= total_pages || inner.groups.is_empty() || page >= 100 {
                break;
            }
            page += 1;
        }

        if let Ok(resp) = fod_client
            .get_biggest_fod_per_group(Request::new(GetBiggestFodRequest { mission_id }))
            .await
        {
            for f in resp.into_inner().fods {
                if !f.frame_jpeg.is_empty() {
                    let _ = self.storage.save_frame(&f.frame_jpeg).await;
                }
                let _ = self.db.upsert_replicated_fod(&f).await;
            }
        }

        for gid in group_ids {
            if let Ok(resp) = fod_client
                .get_fods_by_group(Request::new(GetFodsByGroupRequest {
                    mission_id,
                    group_id: gid,
                    excluded_ids: Vec::new(),
                }))
                .await
            {
                for f in resp.into_inner().fods {
                    if !f.frame_jpeg.is_empty() {
                        let _ = self.storage.save_frame(&f.frame_jpeg).await;
                    }
                    let _ = self.db.upsert_replicated_fod(&f).await;
                }
            }
        }
    }

    async fn send_car_drop_direct(
        &self,
        mission_id: i64,
        target_tier: &str,
        storage_epoch: i64,
    ) -> Option<DropMissionHotDataResponse> {
        let ep = tonic::transport::Endpoint::from_shared(self.car_url.clone()).ok()?;
        let ch = ep
            .connect_timeout(Duration::from_millis(1200))
            .timeout(Duration::from_secs(10))
            .connect()
            .await
            .ok()?;
        let mut client = MissionServiceClient::new(ch);
        client
            .drop_mission_hot_data(Request::new(DropMissionHotDataRequest {
                mission_id,
                target_tier: target_tier.to_string(),
                storage_epoch,
            }))
            .await
            .ok()
            .map(|r| r.into_inner())
    }

    pub async fn cold_store_mission_internal(
        &self,
        mission_id: i64,
        drop_car: bool,
    ) -> Result<ColdStoreMissionResponse, Status> {
        let mission = self
            .db
            .get_mission(mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("Mission {} not found", mission_id)))?;

        if mission.status == DbMissionStatus::Active {
            return Err(Status::failed_precondition(
                "Cannot cold-store an ACTIVE mission — terminate it first",
            ));
        }

        if mission.storage_tier == "COLD_STORED" {
            return Ok(ColdStoreMissionResponse {
                success: true,
                message: format!("Mission {} is already cold-stored", mission_id),
                archive_size_bytes: mission.archive_size_bytes.unwrap_or(0),
                archive_sha256: mission.archive_sha256.clone().unwrap_or_default(),
                mission: Some(mission.to_proto()),
                bytes_freed: 0,
            });
        }

        let dirty_count = self
            .db
            .count_dirty_groups_for_mission(mission_id)
            .await
            .unwrap_or(0);
        if dirty_count > 0 {
            return Err(Status::failed_precondition(format!(
                "Mission {} has {} unsynced operator decision(s) — wait for Car sync before cold-storing",
                mission_id, dirty_count
            )));
        }

        self.ensure_complete_mission_from_car(mission_id).await;

        let bundle = self
            .db
            .build_mission_archive_bundle(&self.storage, mission_id, &self.node_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let archive_path = self.archive_path_for_mission(mission_id, None);
        let (archive_size, archive_sha) =
            zoid_storage::archive::write_archive_file(&archive_path, bundle)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;

        let new_epoch = mission.storage_epoch.max(1) + 1;
        let now = chrono::Utc::now();
        let archive_path_str = archive_path.to_string_lossy().to_string();

        let (updated_mission, safe_shas) = self
            .db
            .purge_mission_hot_data(
                mission_id,
                "COLD_STORED",
                new_epoch,
                Some(&archive_path_str),
                Some(archive_size as i64),
                Some(&archive_sha),
                Some(now),
            )
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let (bytes_freed, frames_removed) = self.storage.delete_frames(&safe_shas).await;
        tracing::info!(
            "ATC cold-stored mission {} -> {} ({} bytes archive, freed {} bytes / {} frames)",
            mission_id,
            archive_path_str,
            archive_size,
            bytes_freed,
            frames_removed
        );

        let policy = self
            .db
            .get_storage_policy("fleet")
            .await
            .unwrap_or_default();
        if drop_car || policy.auto_drop_car_on_cold_store {
            let _ = self
                .storage_directive_tx
                .send(StorageDirective {
                    mission_id,
                    directive: "DROP_HOT_DATA".to_string(),
                    storage_tier: "COLD_STORED".to_string(),
                    storage_epoch: new_epoch,
                    archive_size_bytes: Some(archive_size as i64),
                    cold_stored_at_ms: Some(now.timestamp_millis()),
                })
                .await;
            let _ = self
                .send_car_drop_direct(mission_id, "COLD_STORED", new_epoch)
                .await;
        }

        Ok(ColdStoreMissionResponse {
            success: true,
            message: format!(
                "Mission {} frozen into cold backup ({} frames purged from hot storage)",
                mission_id, frames_removed
            ),
            mission: Some(updated_mission.to_proto()),
            archive_size_bytes: archive_size as i64,
            archive_sha256: archive_sha,
            bytes_freed: bytes_freed as i64,
        })
    }
}

fn policy_to_proto(p: &FleetStoragePolicy) -> StoragePolicyConfig {
    StoragePolicyConfig {
        auto_cold_store_enabled: p.auto_cold_store_enabled,
        atc_keep_hot_missions: p.atc_keep_hot_missions,
        atc_max_disk_percent: p.atc_max_disk_percent,
        auto_drop_car_on_cold_store: p.auto_drop_car_on_cold_store,
        auto_drop_car_when_backed_up: p.auto_drop_car_when_backed_up,
        car_keep_hot_missions: p.car_keep_hot_missions,
        car_max_disk_percent: p.car_max_disk_percent,
    }
}

fn policy_from_proto(p: &StoragePolicyConfig) -> FleetStoragePolicy {
    FleetStoragePolicy {
        auto_cold_store_enabled: p.auto_cold_store_enabled,
        atc_keep_hot_missions: p.atc_keep_hot_missions.max(1),
        atc_max_disk_percent: p.atc_max_disk_percent.clamp(30, 99),
        auto_drop_car_on_cold_store: p.auto_drop_car_on_cold_store,
        auto_drop_car_when_backed_up: p.auto_drop_car_when_backed_up,
        car_keep_hot_missions: p.car_keep_hot_missions.max(1),
        car_max_disk_percent: p.car_max_disk_percent.clamp(30, 99),
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
        _request: Request<UpdateMissionRequest>,
    ) -> Result<Response<MissionDetail>, Status> {
        Err(Status::permission_denied(
            "Missions are controlled authoritatively on the Car daemon",
        ))
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
        let _ = self.template_tx.send(proto_tmpl.clone()).await;

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
        request: Request<ColdStoreMissionRequest>,
    ) -> Result<Response<ColdStoreMissionResponse>, Status> {
        let req = request.into_inner();
        let res = self
            .cold_store_mission_internal(req.mission_id, req.force_drop_car)
            .await?;
        Ok(Response::new(res))
    }

    async fn restore_cold_mission(
        &self,
        request: Request<RestoreColdMissionRequest>,
    ) -> Result<Response<RestoreColdMissionResponse>, Status> {
        let mission_id = request.into_inner().mission_id;
        let mission = self
            .db
            .get_mission(mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("Mission {} not found", mission_id)))?;

        let archive_path =
            self.archive_path_for_mission(mission_id, mission.archive_path.as_deref());
        if !archive_path.exists() {
            return Err(Status::not_found(format!(
                "Cold archive file missing for mission {} at {}",
                mission_id,
                archive_path.display()
            )));
        }

        let bundle = zoid_storage::archive::read_archive_file(&archive_path)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let new_epoch = mission.storage_epoch.max(1) + 1;
        let (restored_mission, groups, fods, frames) = self
            .db
            .restore_mission_archive_bundle(&self.storage, &bundle, new_epoch)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        let _ = self
            .storage_directive_tx
            .send(StorageDirective {
                mission_id,
                directive: "RESTORE_AVAILABLE".to_string(),
                storage_tier: "HOT".to_string(),
                storage_epoch: new_epoch,
                archive_size_bytes: mission.archive_size_bytes,
                cold_stored_at_ms: None,
            })
            .await;

        tracing::info!(
            "ATC restored cold-stored mission {} -> HOT (epoch={}, groups={}, fods={}, frames={})",
            mission_id,
            new_epoch,
            groups,
            fods,
            frames
        );

        Ok(Response::new(RestoreColdMissionResponse {
            success: true,
            message: format!(
                "Mission {} restored to ATC active storage and distributed to fleet",
                mission_id
            ),
            mission: Some(restored_mission.to_proto()),
            restored_groups: groups as i64,
            restored_fods: fods as i64,
            restored_frames: frames as i64,
        }))
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
                "Cannot drop an ACTIVE mission from Car",
            ));
        }

        let next_epoch = req.storage_epoch.max(mission.storage_epoch + 1);
        let _ = self
            .storage_directive_tx
            .send(StorageDirective {
                mission_id: req.mission_id,
                directive: "DROP_HOT_DATA".to_string(),
                storage_tier: "CAR_DROPPED".to_string(),
                storage_epoch: next_epoch,
                archive_size_bytes: mission.archive_size_bytes,
                cold_stored_at_ms: None,
            })
            .await;

        if let Some(res) = self
            .send_car_drop_direct(req.mission_id, "CAR_DROPPED", next_epoch)
            .await
        {
            Ok(Response::new(res))
        } else {
            Ok(Response::new(DropMissionHotDataResponse {
                success: true,
                message: format!(
                    "Queued drop directive for mission {} — Car will free storage when online",
                    req.mission_id
                ),
                bytes_freed: 0,
                frames_removed: 0,
            }))
        }
    }

    type ExportMissionArchiveStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<ArchiveChunk, Status>> + Send + 'static>>;

    async fn export_mission_archive(
        &self,
        request: Request<ExportMissionArchiveRequest>,
    ) -> Result<Response<Self::ExportMissionArchiveStream>, Status> {
        let mission_id = request.into_inner().mission_id;
        let mission = self
            .db
            .get_mission(mission_id)
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .ok_or_else(|| Status::not_found(format!("Mission {} not found", mission_id)))?;

        let filename = match mission.display_id {
            Some(did) => format!("mission-{}-d{}.zoidpack", mission_id, did),
            None => format!("mission-{}.zoidpack", mission_id),
        };

        let existing_path =
            self.archive_path_for_mission(mission_id, mission.archive_path.as_deref());
        let bytes = if mission.storage_tier == "COLD_STORED" && existing_path.exists() {
            tokio::fs::read(&existing_path)
                .await
                .map_err(|e| Status::internal(e.to_string()))?
        } else {
            let bundle = self
                .db
                .build_mission_archive_bundle(&self.storage, mission_id, &self.node_id)
                .await
                .map_err(|e| Status::internal(e.to_string()))?;
            tokio::task::spawn_blocking(move || {
                zoid_storage::archive::encode_archive_bytes(&bundle)
            })
            .await
            .map_err(|e| Status::internal(e.to_string()))?
            .map_err(|e| Status::internal(e.to_string()))?
        };

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
        request: Request<Streaming<ArchiveChunk>>,
    ) -> Result<Response<ImportMissionArchiveResponse>, Status> {
        let mut stream = request.into_inner();
        let mut raw_bytes = Vec::new();
        let mut import_to_fleet = true;

        while let Some(chunk) = stream.next().await {
            let c = chunk?;
            import_to_fleet = c.import_to_fleet;
            raw_bytes.extend_from_slice(&c.data);
        }

        if raw_bytes.is_empty() {
            return Err(Status::invalid_argument("Empty archive payload"));
        }

        let bundle = tokio::task::spawn_blocking(move || {
            zoid_storage::archive::decode_archive_bytes(&raw_bytes)
        })
        .await
        .map_err(|e| Status::internal(e.to_string()))?
        .map_err(|e| Status::invalid_argument(format!("Invalid .zoidpack archive: {e}")))?;

        let mission_id = bundle.manifest.mission_id;
        let existing_epoch = self
            .db
            .get_mission(mission_id)
            .await
            .ok()
            .flatten()
            .map(|m| m.storage_epoch)
            .unwrap_or(1);
        let new_epoch = existing_epoch + 1;

        let (restored_mission, groups, fods, frames) = self
            .db
            .restore_mission_archive_bundle(&self.storage, &bundle, new_epoch)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        if import_to_fleet {
            let _ = self
                .storage_directive_tx
                .send(StorageDirective {
                    mission_id,
                    directive: "RESTORE_AVAILABLE".to_string(),
                    storage_tier: "HOT".to_string(),
                    storage_epoch: new_epoch,
                    archive_size_bytes: None,
                    cold_stored_at_ms: None,
                })
                .await;
        }

        Ok(Response::new(ImportMissionArchiveResponse {
            success: true,
            message: format!(
                "Imported mission {} ({} groups, {} FODs, {} frames)",
                mission_id, groups, fods, frames
            ),
            mission: Some(restored_mission.to_proto()),
            restored_groups: groups as i64,
            restored_fods: fods as i64,
            restored_frames: frames as i64,
        }))
    }

    async fn get_storage_overview(
        &self,
        _request: Request<GetStorageOverviewRequest>,
    ) -> Result<Response<StorageOverviewResponse>, Status> {
        let (total_bytes, used_bytes, free_bytes, usage_percent) =
            disk_usage_for_path(self.storage.base_dir()).await;
        let frames_bytes = dir_size_bytes(self.storage.base_dir()).await;
        let archives_bytes = dir_size_bytes(&self.archives_dir).await;

        let atc_missions = self
            .db
            .list_all_missions_unpaginated()
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        // Query Car storage overview best-effort (1.5s timeout)
        let mut car_disk = NodeDiskInfo {
            node_id: "car-primary".to_string(),
            online: false,
            total_bytes: 0,
            used_bytes: 0,
            free_bytes: 0,
            usage_percent: 0.0,
            frames_bytes: 0,
            archives_bytes: 0,
            hot_mission_count: 0,
            cold_mission_count: 0,
        };
        let mut car_map: HashMap<i64, (bool, String, i64)> = HashMap::new();
        if let Ok(ep) = tonic::transport::Endpoint::from_shared(self.car_url.clone()) {
            if let Ok(ch) = ep
                .connect_timeout(Duration::from_millis(1200))
                .timeout(Duration::from_secs(2))
                .connect()
                .await
            {
                let mut car_client = MissionServiceClient::new(ch);
                if let Ok(resp) = car_client
                    .get_storage_overview(Request::new(GetStorageOverviewRequest {}))
                    .await
                {
                    let inner = resp.into_inner();
                    if let Some(cd) = inner.car_disk {
                        car_disk = cd;
                    }
                    for cm in inner.missions {
                        if let Some(m) = cm.mission {
                            car_map.insert(m.id, (cm.present_hot_on_car, cm.car_storage_tier, cm.hot_bytes));
                        }
                    }
                }
            }
        }

        let mut atc_hot_count = 0i64;
        let mut atc_cold_count = 0i64;
        let mut entries = Vec::with_capacity(atc_missions.len());
        for m in atc_missions {
            let (groups, fods, cleared, dirty, hot_bytes) = self
                .db
                .get_mission_storage_summary(m.id)
                .await
                .unwrap_or((0, 0, 0, 0, 0));

            let is_cold = m.storage_tier == "COLD_STORED";
            if is_cold {
                atc_cold_count += 1;
            } else {
                atc_hot_count += 1;
            }

            let (present_hot_on_car, car_tier) = car_map
                .get(&m.id)
                .map(|(hot, tier, _)| (*hot, tier.clone()))
                .unwrap_or_else(|| {
                    if !car_disk.online {
                        (false, "UNKNOWN".to_string())
                    } else {
                        (false, "CAR_DROPPED".to_string())
                    }
                });

            let mut detail = m.to_proto();
            detail.storage_bytes = Some(hot_bytes);

            entries.push(MissionStorageEntry {
                mission: Some(detail),
                total_fod_groups: groups,
                total_fods: fods,
                cleared_count: cleared,
                dirty_group_count: dirty,
                hot_bytes,
                archive_bytes: m.archive_size_bytes.unwrap_or(0),
                present_hot_on_atc: !is_cold,
                present_cold_on_atc: is_cold,
                present_hot_on_car,
                car_storage_tier: car_tier,
            });
        }

        let atc_disk = NodeDiskInfo {
            node_id: self.node_id.clone(),
            online: true,
            total_bytes,
            used_bytes,
            free_bytes,
            usage_percent,
            frames_bytes,
            archives_bytes,
            hot_mission_count: atc_hot_count,
            cold_mission_count: atc_cold_count,
        };

        let policy = self
            .db
            .get_storage_policy("fleet")
            .await
            .unwrap_or_default();

        Ok(Response::new(StorageOverviewResponse {
            atc_disk: Some(atc_disk),
            car_disk: Some(car_disk),
            missions: entries,
            policy: Some(policy_to_proto(&policy)),
        }))
    }

    async fn update_storage_policy(
        &self,
        request: Request<StoragePolicyConfig>,
    ) -> Result<Response<StoragePolicyConfig>, Status> {
        let req = request.into_inner();
        let policy = policy_from_proto(&req);
        self.db
            .save_storage_policy("fleet", &policy)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;
        Ok(Response::new(policy_to_proto(&policy)))
    }
}

/// Periodically enforces ATC & Car auto-storage policies (every 60s).
pub fn spawn_atc_auto_storage_daemon(svc: Arc<AtcMissionServiceImpl>) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(60));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let Ok(policy) = svc.db.get_storage_policy("fleet").await else {
                continue;
            };
            if !policy.auto_drop_car_when_backed_up && !policy.auto_cold_store_enabled {
                continue;
            }
            let Ok(overview_resp) = svc
                .get_storage_overview(Request::new(GetStorageOverviewRequest {}))
                .await
            else {
                continue;
            };
            let overview = overview_resp.into_inner();

            // 1. Auto-drop backed-up missions from Car when Car thresholds are exceeded
            if policy.auto_drop_car_when_backed_up {
                if let Some(ref car_disk) = overview.car_disk {
                    if car_disk.online {
                        let mut car_hot: Vec<&MissionStorageEntry> = overview
                            .missions
                            .iter()
                            .filter(|e| {
                                e.present_hot_on_car
                                    && e.present_hot_on_atc
                                    && e.dirty_group_count == 0
                                    && e.mission
                                        .as_ref()
                                        .is_some_and(|m| m.status != proto_defination::common::MissionStatus::Active as i32)
                            })
                            .collect();
                        // Sort oldest first
                        car_hot.sort_by_key(|e| {
                            e.mission.as_ref().map(|m| m.created_at).unwrap_or(0)
                        });
                        let over_disk =
                            car_disk.usage_percent >= policy.car_max_disk_percent as f64;
                        let mut excess = (car_disk.hot_mission_count as i64)
                            .saturating_sub(policy.car_keep_hot_missions as i64);

                        for entry in car_hot {
                            if !over_disk && excess <= 0 {
                                break;
                            }
                            if let Some(ref m) = entry.mission {
                                let _ = svc
                                    .drop_mission_hot_data(Request::new(
                                        DropMissionHotDataRequest {
                                            mission_id: m.id,
                                            target_tier: "CAR_DROPPED".to_string(),
                                            storage_epoch: m.storage_epoch + 1,
                                        },
                                    ))
                                    .await;
                                excess -= 1;
                                if over_disk {
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // 2. Auto-cold-store oldest hot missions on ATC when ATC thresholds are exceeded
            if policy.auto_cold_store_enabled {
                if let Some(ref atc_disk) = overview.atc_disk {
                    let mut atc_hot: Vec<&MissionStorageEntry> = overview
                        .missions
                        .iter()
                        .filter(|e| {
                            e.present_hot_on_atc
                                && e.dirty_group_count == 0
                                && e.mission
                                    .as_ref()
                                    .is_some_and(|m| m.status != proto_defination::common::MissionStatus::Active as i32)
                        })
                        .collect();
                    atc_hot.sort_by_key(|e| e.mission.as_ref().map(|m| m.created_at).unwrap_or(0));

                    let over_disk = atc_disk.usage_percent >= policy.atc_max_disk_percent as f64;
                    let mut excess = (atc_disk.hot_mission_count as i64)
                        .saturating_sub(policy.atc_keep_hot_missions as i64);

                    for entry in atc_hot {
                        if !over_disk && excess <= 0 {
                            break;
                        }
                        if let Some(ref m) = entry.mission {
                            if let Err(e) = svc
                                .cold_store_mission_internal(m.id, policy.auto_drop_car_on_cold_store)
                                .await
                            {
                                tracing::warn!(
                                    "Auto-cold-store skipped mission {}: {}",
                                    m.id,
                                    e
                                );
                            }
                            excess -= 1;
                            if over_disk {
                                break;
                            }
                        }
                    }
                }
            }
        }
    });
}
