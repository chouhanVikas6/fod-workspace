use proto_defination::common::{MissionScanStatus, MissionStatus};
use proto_defination::mission_control::mission_control_service_server::MissionControlService;
use proto_defination::mission_control::{
    ActiveMissionStateResponse, GetScanStatusRequest, JoinMissionRequest, MissionControlResponse,
    MissionEvent, MissionSubscriptionRequest, RestartMissionRequest, ScanStatusResponse,
    StartMissionRequest, TerminateMissionRequest, TerminateResponse, ToggleScanRequest,
};
use std::pin::Pin;
use std::sync::atomic::{AtomicI32, AtomicI64, Ordering};
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tonic::{Request, Response, Status};
use zoid_db::Db;

pub struct MissionControlServiceImpl {
    db: Db,
    active_mission_id: Arc<AtomicI64>,
    scan_status: Arc<AtomicI32>,
    event_tx: broadcast::Sender<MissionEvent>,
}

impl MissionControlServiceImpl {
    pub fn new(db: Db) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            db,
            active_mission_id: Arc::new(AtomicI64::new(0)),
            scan_status: Arc::new(AtomicI32::new(MissionScanStatus::Play as i32)),
            event_tx,
        }
    }

    pub fn restore_active_mission(&self, mission_id: i64, scan_status: zoid_db::models::MissionScanStatus) {
        self.active_mission_id.store(mission_id, Ordering::SeqCst);
        let scan = match scan_status {
            zoid_db::models::MissionScanStatus::Play => MissionScanStatus::Play as i32,
            zoid_db::models::MissionScanStatus::Pause => MissionScanStatus::Pause as i32,
        };
        self.scan_status.store(scan, Ordering::SeqCst);
    }
}

#[tonic::async_trait]
impl MissionControlService for MissionControlServiceImpl {
    async fn start_mission(
        &self,
        request: Request<StartMissionRequest>,
    ) -> Result<Response<MissionControlResponse>, Status> {
        let req = request.into_inner();
        let speed = req.speed.unwrap_or(20);
        let pass = req.pass.unwrap_or(1);

        if !(5..=45).contains(&speed) {
            return Err(Status::invalid_argument("Speed must be between 5 and 45 km/h"));
        }
        if !(1..=3).contains(&pass) {
            return Err(Status::invalid_argument("Pass must be between 1 and 3"));
        }

        let current = self.active_mission_id.load(Ordering::SeqCst);
        if current > 0 {
            return Err(Status::already_exists(format!(
                "Mission {} is already active",
                current
            )));
        }

        let new_id = chrono::Utc::now().timestamp_millis();
        self.active_mission_id.store(new_id, Ordering::SeqCst);
        self.scan_status.store(MissionScanStatus::Play as i32, Ordering::SeqCst);

        if let Err(e) = self.db.create_mission(new_id, Some(speed), Some(pass)).await {
            tracing::warn!("Failed to persist new mission in db: {e}");
        }
        let _ = self.db.update_scan_status(new_id, zoid_db::models::MissionScanStatus::Play).await;
        let _ = self.db.append_change(1, &new_id.to_string()).await;

        let now = chrono::Utc::now().timestamp_millis();
        let _ = self.event_tx.send(MissionEvent {
            mission_id: new_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::RawCommand(
                format!("start_{}", new_id),
            )),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: new_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::StatusChanged(
                MissionStatus::Active as i32,
            )),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: new_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::ScanChanged(
                MissionScanStatus::Play as i32,
            )),
        });

        let resp = MissionControlResponse {
            mission_id: new_id,
            status: MissionStatus::Active as i32,
            scan_status: MissionScanStatus::Play as i32,
            timer_seconds: 0,
            created_at: now,
        };

        Ok(Response::new(resp))
    }

    async fn join_mission(
        &self,
        request: Request<JoinMissionRequest>,
    ) -> Result<Response<ActiveMissionStateResponse>, Status> {
        let mission_id = request.into_inner().mission_id;
        let mut current = self.active_mission_id.load(Ordering::SeqCst);

        if current == 0 || current != mission_id {
            if let Ok(Some(active)) = self.db.get_active_mission().await {
                if active.id == mission_id || mission_id == 0 {
                    self.restore_active_mission(active.id, active.scan_status);
                    current = active.id;
                }
            } else if let Ok(Some(m)) = self.db.get_mission(mission_id).await {
                if m.status == zoid_db::models::MissionStatus::Active {
                    self.restore_active_mission(m.id, m.scan_status);
                    current = m.id;
                }
            }
        }

        if current == 0 {
            return Err(Status::not_found("No mission is currently active"));
        }
        if current != mission_id {
            return Err(Status::not_found(format!(
                "Requested mission {} does not match active mission {}",
                mission_id, current
            )));
        }

        let scan = self.scan_status.load(Ordering::SeqCst);
        let (start_time, duration_ms, fod_group_count) = if let Ok(Some(m)) = self.db.get_mission(current).await {
            let start = m.created_at.timestamp_millis();
            let now = chrono::Utc::now().timestamp_millis();
            let dur = if m.timer > 0 {
                m.timer * 1000
            } else {
                (now - start).max(0)
            };
            let count = self.db.get_mission_stats(current).await.map(|(g, _)| g).unwrap_or(0);
            (start, dur, count)
        } else {
            (chrono::Utc::now().timestamp_millis(), 0, 0)
        };

        Ok(Response::new(ActiveMissionStateResponse {
            mission_id: current,
            status: MissionStatus::Active as i32,
            scan_status: scan,
            start_time,
            duration_ms,
            fod_group_count,
        }))
    }

    async fn restart_mission(
        &self,
        request: Request<RestartMissionRequest>,
    ) -> Result<Response<MissionControlResponse>, Status> {
        let mission_id = request.into_inner().mission_id;
        self.active_mission_id.store(mission_id, Ordering::SeqCst);
        self.scan_status.store(MissionScanStatus::Play as i32, Ordering::SeqCst);

        let _ = self.db.update_mission(
            mission_id,
            Some(zoid_db::models::MissionStatus::Active),
            Some(zoid_db::models::MissionScanStatus::Play),
            None,
            None,
            None,
        ).await;
        let _ = self.db.append_change(1, &mission_id.to_string()).await;

        let now = chrono::Utc::now().timestamp_millis();
        let _ = self.event_tx.send(MissionEvent {
            mission_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::RawCommand(
                format!("start_{}", mission_id),
            )),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::ScanChanged(
                MissionScanStatus::Play as i32,
            )),
        });

        Ok(Response::new(MissionControlResponse {
            mission_id,
            status: MissionStatus::Active as i32,
            scan_status: MissionScanStatus::Play as i32,
            timer_seconds: 0,
            created_at: now,
        }))
    }

    async fn get_scan_status(
        &self,
        _request: Request<GetScanStatusRequest>,
    ) -> Result<Response<ScanStatusResponse>, Status> {
        let mut current = self.active_mission_id.load(Ordering::SeqCst);
        if current == 0 {
            if let Ok(Some(active)) = self.db.get_active_mission().await {
                self.restore_active_mission(active.id, active.scan_status);
                current = active.id;
            }
        }
        let status = if current > 0 {
            self.scan_status.load(Ordering::SeqCst)
        } else {
            MissionScanStatus::Pause as i32
        };

        Ok(Response::new(ScanStatusResponse {
            scan_status: status,
        }))
    }

    async fn toggle_scan_status(
        &self,
        request: Request<ToggleScanRequest>,
    ) -> Result<Response<ScanStatusResponse>, Status> {
        let req = request.into_inner();
        let resume = req.resume;
        let cam_list = req.cam_list;
        let new_status = if resume {
            MissionScanStatus::Play
        } else {
            MissionScanStatus::Pause
        };

        self.scan_status.store(new_status as i32, Ordering::SeqCst);
        let current = self.active_mission_id.load(Ordering::SeqCst);
        if current > 0 {
            let db_scan = if resume {
                zoid_db::models::MissionScanStatus::Play
            } else {
                zoid_db::models::MissionScanStatus::Pause
            };
            let _ = self.db.update_scan_status(current, db_scan).await;
            let _ = self.db.append_change(1, &current.to_string()).await;
        }

        let cmd_verb = if resume { "resume" } else { "pause" };
        let raw = if cam_list.len() == 1 {
            format!("{}_{}", cmd_verb, cam_list[0])
        } else if cam_list.is_empty() {
            cmd_verb.to_string()
        } else {
            format!("{}_all", cmd_verb)
        };

        let now = chrono::Utc::now().timestamp_millis();
        let _ = self.event_tx.send(MissionEvent {
            mission_id: current,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::RawCommand(raw)),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: current,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::CameraCommand(
                proto_defination::mission_control::CameraCommand {
                    command: cmd_verb.to_string(),
                    cam_ids: cam_list,
                },
            )),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: current,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::ScanChanged(
                new_status as i32,
            )),
        });

        Ok(Response::new(ScanStatusResponse {
            scan_status: new_status as i32,
        }))
    }

    async fn terminate_mission(
        &self,
        request: Request<TerminateMissionRequest>,
    ) -> Result<Response<TerminateResponse>, Status> {
        let req_id = request.into_inner().mission_id;
        let current = self.active_mission_id.swap(0, Ordering::SeqCst);
        self.scan_status.store(MissionScanStatus::Pause as i32, Ordering::SeqCst);

        let target_id = if req_id > 0 { req_id } else { current };
        if target_id > 0 {
            let _ = self.db.terminate_mission(target_id).await;
            let _ = self.db.append_change(1, &target_id.to_string()).await;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let _ = self.event_tx.send(MissionEvent {
            mission_id: target_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::RawCommand(
                format!("terminate_{}", target_id),
            )),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: target_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::StatusChanged(
                MissionStatus::Terminated as i32,
            )),
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: target_id,
            timestamp: now,
            event: Some(proto_defination::mission_control::mission_event::Event::ScanChanged(
                MissionScanStatus::Pause as i32,
            )),
        });

        Ok(Response::new(TerminateResponse {
            mission_id: target_id,
            success: true,
            message: "Mission terminated successfully".to_string(),
        }))
    }

    type StreamMissionEventsStream = Pin<
        Box<dyn tokio_stream::Stream<Item = Result<MissionEvent, Status>> + Send + 'static>,
    >;

    async fn stream_mission_events(
        &self,
        _request: Request<MissionSubscriptionRequest>,
    ) -> Result<Response<Self::StreamMissionEventsStream>, Status> {
        let rx = self.event_tx.subscribe();
        let stream = BroadcastStream::new(rx).filter_map(|res| match res {
            Ok(event) => Some(Ok(event)),
            Err(_) => None,
        });

        Ok(Response::new(Box::pin(stream)))
    }
}
