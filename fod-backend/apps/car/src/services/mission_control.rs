use proto_defination::common::{MissionScanStatus, MissionStatus};
use proto_defination::mission_control::mission_control_service_server::MissionControlService;
use proto_defination::mission_control::{
    ActiveMissionStateResponse, GetScanStatusRequest, JoinMissionRequest, MissionControlResponse,
    MissionEvent, MissionSubscriptionRequest, RestartMissionRequest, ScanStatusResponse,
    StartMissionRequest, TerminateMissionRequest, TerminateResponse, ToggleScanRequest,
};
use std::pin::Pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicI32, AtomicI64, Ordering};
use tokio::sync::broadcast;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::BroadcastStream;
use tonic::{Request, Response, Status};
use zoid_db::Db;

#[derive(Clone)]
pub struct MissionControlServiceImpl {
    db: Db,
    active_mission_id: Arc<AtomicI64>,
    scan_status: Arc<AtomicI32>,
    event_tx: broadcast::Sender<MissionEvent>,
    /// Tracks active timer flushing: Some((mission_id, last_flushed_ms, last_replicated_ms)).
    timer_anchor: Arc<tokio::sync::Mutex<Option<(i64, i64, i64)>>>,
}

impl MissionControlServiceImpl {
    pub fn new(db: Db) -> Self {
        let (event_tx, _) = broadcast::channel(100);
        Self {
            db,
            active_mission_id: Arc::new(AtomicI64::new(0)),
            scan_status: Arc::new(AtomicI32::new(MissionScanStatus::Play as i32)),
            event_tx,
            timer_anchor: Arc::new(tokio::sync::Mutex::new(None)),
        }
    }

    /// Spawn a background loop that persists accumulated active mission duration
    /// (`missions.timer` in seconds) every 2 seconds while a mission is active.
    pub fn start_timer_loop(&self) {
        let svc = self.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
            loop {
                interval.tick().await;
                if svc.active_mission_id.load(Ordering::SeqCst) > 0 {
                    svc.flush_active_timer(false, None).await;
                }
            }
        });
    }

    async fn set_timer_anchor(&self, mission_id: i64, now_ms: i64) {
        let mut guard = self.timer_anchor.lock().await;
        *guard = Some((mission_id, now_ms, now_ms));
    }

    async fn flush_active_timer(&self, finalizing: bool, expected_id: Option<i64>) {
        let mut guard = self.timer_anchor.lock().await;
        let now = chrono::Utc::now().timestamp_millis();
        let target_id =
            expected_id.unwrap_or_else(|| self.active_mission_id.load(Ordering::SeqCst));

        if target_id <= 0 {
            if finalizing {
                *guard = None;
            }
            return;
        }

        let current_anchor = *guard;
        match current_anchor {
            Some((mid, mut last_ms, mut last_rep_ms)) if mid == target_id => {
                let raw_delta_ms = (now - last_ms).max(0);
                let delta_sec = if finalizing {
                    (raw_delta_ms + 500) / 1000
                } else {
                    raw_delta_ms / 1000
                };
                if delta_sec > 0 {
                    let _ = self.db.increment_mission_timer(mid, delta_sec).await;
                    last_ms += delta_sec * 1000;
                    if !finalizing && now - last_rep_ms >= 10_000 {
                        let _ = self.db.append_change(1, &mid.to_string()).await;
                        last_rep_ms = now;
                    }
                } else if finalizing && raw_delta_ms > 0 {
                    if let Ok(Some(m)) = self.db.get_mission(mid).await {
                        if m.timer == 0 {
                            let _ = self.db.increment_mission_timer(mid, 1).await;
                        }
                    }
                }
                if finalizing {
                    *guard = None;
                } else {
                    *guard = Some((mid, last_ms, last_rep_ms));
                }
            }
            _ => {
                if finalizing {
                    *guard = None;
                } else {
                    *guard = Some((target_id, now, now));
                }
            }
        }
    }

    #[allow(dead_code)]
    pub fn get_active_mission_id(&self) -> i64 {
        self.active_mission_id.load(Ordering::SeqCst)
    }

    pub async fn terminate_active_mission(&self) -> Option<i64> {
        let current = self.active_mission_id.swap(0, Ordering::SeqCst);
        self.scan_status
            .store(MissionScanStatus::Pause as i32, Ordering::SeqCst);
        if current > 0 {
            self.flush_active_timer(true, Some(current)).await;
            let _ = self.db.terminate_mission(current).await;
            let _ = self.db.append_change(1, &current.to_string()).await;
            let now = chrono::Utc::now().timestamp_millis();
            let _ = self.event_tx.send(MissionEvent {
                mission_id: current,
                timestamp: now,
                event: Some(
                    proto_defination::mission_control::mission_event::Event::RawCommand(format!(
                        "terminate_{}",
                        current
                    )),
                ),
                display_id: None,
            });
            let _ = self.event_tx.send(MissionEvent {
                mission_id: current,
                timestamp: now,
                event: Some(
                    proto_defination::mission_control::mission_event::Event::StatusChanged(
                        MissionStatus::Terminated as i32,
                    ),
                ),
                display_id: None,
            });
            let _ = self.event_tx.send(MissionEvent {
                mission_id: current,
                timestamp: now,
                event: Some(
                    proto_defination::mission_control::mission_event::Event::ScanChanged(
                        MissionScanStatus::Pause as i32,
                    ),
                ),
                display_id: None,
            });
            Some(current)
        } else {
            None
        }
    }

    pub fn restore_active_mission(
        &self,
        mission_id: i64,
        scan_status: zoid_db::models::MissionScanStatus,
    ) {
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
            return Err(Status::invalid_argument(
                "Speed must be between 5 and 45 km/h",
            ));
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
        self.scan_status
            .store(MissionScanStatus::Play as i32, Ordering::SeqCst);

        let display_id = match self
            .db
            .create_mission(new_id, Some(speed), Some(pass))
            .await
        {
            Ok(row) => row.display_id,
            Err(e) => {
                tracing::warn!("Failed to persist new mission in db: {e}");
                None
            }
        };
        let _ = self
            .db
            .update_scan_status(new_id, zoid_db::models::MissionScanStatus::Play)
            .await;
        let _ = self.db.append_change(1, &new_id.to_string()).await;

        let now = chrono::Utc::now().timestamp_millis();
        self.set_timer_anchor(new_id, now).await;
        let _ = self.event_tx.send(MissionEvent {
            mission_id: new_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::RawCommand(format!(
                    "start_{}",
                    new_id
                )),
            ),
            display_id,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: new_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::StatusChanged(
                    MissionStatus::Active as i32,
                ),
            ),
            display_id,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: new_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::ScanChanged(
                    MissionScanStatus::Play as i32,
                ),
            ),
            display_id,
        });

        let resp = MissionControlResponse {
            mission_id: new_id,
            status: MissionStatus::Active as i32,
            scan_status: MissionScanStatus::Play as i32,
            timer_seconds: 0,
            created_at: now,
            display_id,
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
        let unflushed_ms = {
            let mut guard = self.timer_anchor.lock().await;
            let now = chrono::Utc::now().timestamp_millis();
            match *guard {
                Some((mid, last_ms, _)) if mid == current => (now - last_ms).max(0),
                _ => {
                    *guard = Some((current, now, now));
                    0
                }
            }
        };
        let (start_time, duration_ms, fod_group_count, display_id) =
            if let Ok(Some(m)) = self.db.get_mission(current).await {
                let start = m.created_at.timestamp_millis();
                let now = chrono::Utc::now().timestamp_millis();
                let dur = if m.timer > 0 || unflushed_ms > 0 {
                    m.timer * 1000 + unflushed_ms
                } else {
                    (now - start).max(0)
                };
                let count = self
                    .db
                    .get_mission_stats(current)
                    .await
                    .map(|(g, _)| g)
                    .unwrap_or(0);
                (start, dur, count, m.display_id)
            } else {
                (chrono::Utc::now().timestamp_millis(), 0, 0, None)
            };

        Ok(Response::new(ActiveMissionStateResponse {
            mission_id: current,
            status: MissionStatus::Active as i32,
            scan_status: scan,
            start_time,
            duration_ms,
            fod_group_count,
            display_id,
        }))
    }

    async fn restart_mission(
        &self,
        request: Request<RestartMissionRequest>,
    ) -> Result<Response<MissionControlResponse>, Status> {
        let mission_id = request.into_inner().mission_id;
        let prev = self.active_mission_id.swap(mission_id, Ordering::SeqCst);
        if prev > 0 && prev != mission_id {
            self.flush_active_timer(true, Some(prev)).await;
        }
        self.scan_status
            .store(MissionScanStatus::Play as i32, Ordering::SeqCst);

        let updated = self
            .db
            .update_mission(
                mission_id,
                Some(zoid_db::models::MissionStatus::Active),
                Some(zoid_db::models::MissionScanStatus::Play),
                None,
                None,
                None,
            )
            .await;
        let (timer_seconds, display_id) = match updated {
            Ok(m) => (m.timer, m.display_id),
            Err(_) => (0, None),
        };
        let _ = self.db.append_change(1, &mission_id.to_string()).await;

        let now = chrono::Utc::now().timestamp_millis();
        self.set_timer_anchor(mission_id, now).await;
        let _ = self.event_tx.send(MissionEvent {
            mission_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::RawCommand(format!(
                    "start_{}",
                    mission_id
                )),
            ),
            display_id,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::ScanChanged(
                    MissionScanStatus::Play as i32,
                ),
            ),
            display_id,
        });

        Ok(Response::new(MissionControlResponse {
            mission_id,
            status: MissionStatus::Active as i32,
            scan_status: MissionScanStatus::Play as i32,
            timer_seconds,
            created_at: now,
            display_id,
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
            display_id: None,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: current,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::CameraCommand(
                    proto_defination::mission_control::CameraCommand {
                        command: cmd_verb.to_string(),
                        cam_ids: cam_list,
                    },
                ),
            ),
            display_id: None,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: current,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::ScanChanged(
                    new_status as i32,
                ),
            ),
            display_id: None,
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
        self.scan_status
            .store(MissionScanStatus::Pause as i32, Ordering::SeqCst);

        let target_id = if req_id > 0 { req_id } else { current };
        if target_id > 0 {
            self.flush_active_timer(true, Some(target_id)).await;
            let _ = self.db.terminate_mission(target_id).await;
            let _ = self.db.append_change(1, &target_id.to_string()).await;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let _ = self.event_tx.send(MissionEvent {
            mission_id: target_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::RawCommand(format!(
                    "terminate_{}",
                    target_id
                )),
            ),
            display_id: None,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: target_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::StatusChanged(
                    MissionStatus::Terminated as i32,
                ),
            ),
            display_id: None,
        });
        let _ = self.event_tx.send(MissionEvent {
            mission_id: target_id,
            timestamp: now,
            event: Some(
                proto_defination::mission_control::mission_event::Event::ScanChanged(
                    MissionScanStatus::Pause as i32,
                ),
            ),
            display_id: None,
        });

        Ok(Response::new(TerminateResponse {
            mission_id: target_id,
            success: true,
            message: "Mission terminated successfully".to_string(),
        }))
    }

    type StreamMissionEventsStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<MissionEvent, Status>> + Send + 'static>>;

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
