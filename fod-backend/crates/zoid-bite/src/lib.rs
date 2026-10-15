use proto_defination::bite::{BiteState, CameraBiteEntry, GpsSensorData, PcHealthMetrics};
use std::collections::VecDeque;
use std::sync::Arc;
use tokio::sync::{watch, RwLock};

pub struct BiteAggregator {
    /// Watch sender for latest real-time health broadcast (non-blocking readers)
    state_tx: watch::Sender<BiteState>,
    /// Circular buffer of recent historical states (up to 100 entries)
    history: Arc<RwLock<VecDeque<BiteState>>>,
    max_history: usize,
}

impl BiteAggregator {
    pub fn new() -> Self {
        let initial_state = Self::initial_bite_state();
        let (state_tx, _) = watch::channel(initial_state);

        Self {
            state_tx,
            history: Arc::new(RwLock::new(VecDeque::with_capacity(100))),
            max_history: 100,
        }
    }

    pub fn subscribe(&self) -> watch::Receiver<BiteState> {
        self.state_tx.subscribe()
    }

    pub fn current_state(&self) -> BiteState {
        self.state_tx.borrow().clone()
    }

    pub async fn get_history(&self, limit: usize) -> Vec<BiteState> {
        let guard = self.history.read().await;
        let take_n = if limit == 0 { 50 } else { limit.min(guard.len()) };
        guard.iter().rev().take(take_n).cloned().collect()
    }

    pub async fn update_state<F>(&self, update_fn: F)
    where
        F: FnOnce(&mut BiteState),
    {
        let mut state = self.current_state();
        update_fn(&mut state);
        state.timestamp = chrono::Utc::now().timestamp_millis();

        // Broadcast to all watchers
        let _ = self.state_tx.send(state.clone());

        // Update history ring buffer
        let mut guard = self.history.write().await;
        if guard.len() >= self.max_history {
            guard.pop_front();
        }
        guard.push_back(state);
    }

    pub async fn update_camera(
        &self,
        cam_id: &str,
        intr_fps: f64,
        vg_fps: f64,
        ms_fps: f64,
        connected: bool,
        paused: bool,
    ) {
        self.update_state(|state| {
            let now = chrono::Utc::now().timestamp_millis();
            if let Some(entry) = state.cameras.iter_mut().find(|c| c.cam_id == cam_id) {
                entry.intr_fps = intr_fps;
                entry.vg_fps = vg_fps;
                entry.ms_fps = ms_fps;
                entry.camera_connection = connected;
                entry.pause = paused;
                entry.timestamp = now;
            } else {
                state.cameras.push(CameraBiteEntry {
                    cam_id: cam_id.to_string(),
                    camera_connection: connected,
                    intr_fps,
                    pause: paused,
                    vg_fps,
                    ms_fps,
                    timestamp: now,
                });
            }
        })
        .await;
    }

    pub async fn update_cameras(&self, cam_list: Vec<CameraBiteEntry>) {
        self.update_state(|state| {
            let now = chrono::Utc::now().timestamp_millis();
            for cam in cam_list {
                if let Some(entry) = state.cameras.iter_mut().find(|c| c.cam_id == cam.cam_id) {
                    entry.camera_connection = cam.camera_connection;
                    entry.intr_fps = cam.intr_fps;
                    entry.vg_fps = cam.vg_fps;
                    entry.ms_fps = cam.ms_fps;
                    entry.pause = cam.pause;
                    entry.timestamp = if cam.timestamp > 0 { cam.timestamp } else { now };
                } else {
                    let mut new_entry = cam;
                    if new_entry.timestamp == 0 {
                        new_entry.timestamp = now;
                    }
                    state.cameras.push(new_entry);
                }
            }
        })
        .await;
    }

    pub async fn update_car_data(
        &self,
        primary: Option<GpsSensorData>,
        secondary: Option<GpsSensorData>,
    ) {
        self.update_state(|state| {
            if let Some(p) = primary {
                state.primary_gps = Some(p);
            }
            if let Some(s) = secondary {
                state.secondary_gps = Some(s);
            }
        })
        .await;
    }

    pub async fn update_pc_health(&self, node: String, metrics: PcHealthMetrics) {
        self.update_state(|state| {
            state.pc_nodes.insert(node, metrics);
        })
        .await;
    }

    fn initial_bite_state() -> BiteState {
        let mut cameras = Vec::with_capacity(26);

        // FLIR 00 to 07
        for i in 0..8 {
            cameras.push(CameraBiteEntry {
                cam_id: format!("flir{:02}", i),
                camera_connection: false,
                intr_fps: 0.0,
                pause: true,
                vg_fps: 0.0,
                ms_fps: 0.0,
                timestamp: 0,
            });
        }

        // Lucid 08 to 25
        for i in 8..26 {
            cameras.push(CameraBiteEntry {
                cam_id: format!("lucid{:02}", i),
                camera_connection: false,
                intr_fps: 0.0,
                pause: true,
                vg_fps: 0.0,
                ms_fps: 0.0,
                timestamp: 0,
            });
        }

        BiteState {
            timestamp: chrono::Utc::now().timestamp_millis(),
            primary_gps: Some(GpsSensorData {
                fix: "NO_GPS".to_string(),
                sd: -1.0,
                lat: 0.0,
                lon: 0.0,
                heading: 0.0,
                velocity: 0.0,
            }),
            secondary_gps: Some(GpsSensorData {
                fix: "NO_GPS".to_string(),
                sd: -1.0,
                lat: 0.0,
                lon: 0.0,
                heading: 0.0,
                velocity: 0.0,
            }),
            cameras,
            pc_nodes: std::collections::HashMap::new(),
            ping_latency_ms: 0,
            connected: true,
            available_devices: vec!["car_01".to_string()],
        }
    }
}

impl Default for BiteAggregator {
    fn default() -> Self {
        Self::new()
    }
}
