//! Shared application state.
//!
//! `SystemHealthStat` mirrors the `sytemHealthStat` object in
//! src/pages/api/socket.ts EXACTLY (field names included — the renderer and the
//! 100 ms `/gui` "health" broadcast depend on this serialized shape).

use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use tokio::task::JoinHandle;

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<crate::config::Config>,
    pub db: sqlx::SqlitePool,
    pub http: reqwest::Client,
    pub health: Arc<RwLock<SystemHealthStat>>,
    /// Tauri AppHandle used to emit IPC events to the frontend window.
    pub app_handle: Arc<OnceLock<AppHandle>>,
    /// Active `retrive-data` IPC subscriptions keyed by subscription ID.
    pub retrive_subs: Arc<Mutex<HashMap<String, JoinHandle<()>>>>,
    /// Random boot token exposed via /healthz.
    pub started_by: Arc<String>,
}

impl AppState {
    pub fn new(cfg: Arc<crate::config::Config>, db: sqlx::SqlitePool) -> Self {
        Self {
            cfg,
            db,
            http: reqwest::Client::new(),
            health: Arc::new(RwLock::new(SystemHealthStat::default())),
            app_handle: Arc::new(OnceLock::new()),
            retrive_subs: Arc::new(Mutex::new(HashMap::new())),
            started_by: Arc::new(uuid::Uuid::new_v4().simple().to_string()),
        }
    }

    pub fn set_app_handle(&self, handle: AppHandle) {
        let _ = self.app_handle.set(handle);
    }

    /// Emit a Tauri event to all webviews.
    pub fn emit_event<S: Serialize + Clone>(&self, event: &str, payload: &S) {
        if let Some(app) = self.app_handle.get() {
            let _ = app.emit(event, payload.clone());
        }
    }

    /// Emit a `/gui` socket replacement event over Tauri IPC.
    /// Emits `gui:{event}` (e.g. `gui:health`, `gui:update`, `gui:fod`).
    pub fn emit_gui<S: Serialize + Clone>(&self, event: &str, payload: &S) {
        if let Some(app) = self.app_handle.get() {
            let gui_event = format!("gui:{event}");
            let _ = app.emit(&gui_event, payload.clone());
        }
    }
}

#[derive(Serialize, Clone, Debug)]
pub struct StatusBlock {
    pub data: Value,
    #[serde(rename = "eventStatus")]
    pub event_status: bool,
    #[serde(rename = "dataStatus")]
    pub data_status: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct AiHealth {
    /// Per-camera map keyed by CAM_ID; entries carry an `updatedAt` epoch-ms
    /// field and expire after 5 s (filterOtherHealth in socket.ts).
    pub health: serde_json::Map<String, Value>,
    /// MUST stay an array — the renderer (CamerasInfo, BITE tab) iterates it,
    /// and only overwrite it when live camera data exists (socket.ts comment).
    pub data: Vec<Value>,
    #[serde(rename = "eventStatus")]
    pub event_status: bool,
    #[serde(rename = "dataStatus")]
    pub data_status: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct Latency {
    pub ping: u32,
    pub connected: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct SystemHealthStat {
    #[serde(rename = "carData")]
    pub car_data: StatusBlock,
    #[serde(rename = "RtkData")]
    pub rtk_data: StatusBlock,
    #[serde(rename = "AiHealth")]
    pub ai_health: AiHealth,
    pub latency: Latency,
    /// Entries expire after 5 s; `latency.connected` = any entry with
    /// type == "car" seen within the window (filterRecentCommunications).
    #[serde(rename = "availableCommunication")]
    pub available_communication: Vec<Value>,
    pub camera: Value,
}

impl Default for SystemHealthStat {
    fn default() -> Self {
        Self {
            car_data: StatusBlock {
                data: json!({ "primary_data": {}, "secondary_data": {} }),
                event_status: false,
                data_status: false,
            },
            rtk_data: StatusBlock {
                data: json!({}),
                event_status: false,
                data_status: false,
            },
            ai_health: AiHealth {
                health: serde_json::Map::new(),
                data: Vec::new(),
                event_status: false,
                data_status: false,
            },
            latency: Latency {
                ping: 5000,
                connected: false,
            },
            available_communication: Vec::new(),
            camera: json!({}),
        }
    }
}
