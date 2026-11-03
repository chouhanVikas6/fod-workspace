//! Realtime layer — Tauri IPC events + gRPC upstream subscribers.
//! Replaces legacy socket.io namespaces (/gui, /rtk) and HTTP SSE streams with
//! Tauri IPC events (`gui:health`, `gui:update`, `gui:fod`, `sse:health-data`,
//! `sse:retrive-data:<subId>`).

pub mod car_telemetry;
pub mod group_stream;
pub mod mission_stream;
pub mod socketio;
pub mod sse;

use crate::state::AppState;

/// Start background Tauri IPC broadcasters (100 ms health broadcast + 1 s BITE broadcast).
pub async fn setup(state: AppState) -> anyhow::Result<()> {
    socketio::register(state.clone()).await?;
    sse::spawn_health_broadcaster(state);
    Ok(())
}
