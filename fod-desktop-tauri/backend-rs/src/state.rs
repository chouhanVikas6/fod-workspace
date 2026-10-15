//! Shared application state.
//!
//! `SystemHealthStat` mirrors the `sytemHealthStat` object in
//! src/pages/api/socket.ts EXACTLY (field names included — the renderer and the
//! 100 ms `/gui` "health" broadcast depend on this serialized shape).

use serde::Serialize;
use serde_json::{json, Value};
use socketioxide::SocketIo;
use std::sync::{Arc, OnceLock};
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<crate::config::Config>,
    pub db: sqlx::PgPool,
    pub http: reqwest::Client,
    pub health: Arc<RwLock<SystemHealthStat>>,
    /// Set once by realtime::setup(); use `state.io()` to emit to namespaces.
    pub io: Arc<OnceLock<SocketIo>>,
    /// Random boot token exposed via /healthz — lets a second app instance
    /// distinguish "port busy by a live sibling" from "stale server".
    pub started_by: Arc<String>,
}

impl AppState {
    pub fn new(
        cfg: Arc<crate::config::Config>,
        db: sqlx::PgPool,
    ) -> Self {
        Self {
            cfg,
            db,
            http: reqwest::Client::new(),
            health: Arc::new(RwLock::new(SystemHealthStat::default())),
            io: Arc::new(OnceLock::new()),
            started_by: Arc::new(uuid::Uuid::new_v4().simple().to_string()),
        }
    }

    pub fn io(&self) -> Option<&SocketIo> {
        self.io.get()
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
