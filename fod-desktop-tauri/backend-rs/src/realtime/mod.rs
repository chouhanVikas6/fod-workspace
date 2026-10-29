//! Realtime layer — OWNED BY AGENT R2.
//! socket.io namespaces (/gui, /rtk), the 100 ms health broadcast, the Kafka
//! consumer, the car-backend /client listener, and the SSE endpoints.

pub mod car_telemetry;
pub mod group_stream;
pub mod mission_stream;
pub mod socketio;
pub mod sse;

use crate::state::AppState;

/// Build the socket.io layer and register namespaces. Called once from main.
/// Must also store the io handle in state (state.io.set) so route handlers and
/// backend_link can emit to /gui.
pub async fn setup(state: AppState) -> anyhow::Result<socketioxide::layer::SocketIoLayer> {
    let (layer, io) = socketioxide::SocketIo::builder().build_layer();
    state
        .io
        .set(io.clone())
        .map_err(|_| anyhow::anyhow!("io already set"))?;
    socketio::register(io, state).await?;
    Ok(layer)
}
