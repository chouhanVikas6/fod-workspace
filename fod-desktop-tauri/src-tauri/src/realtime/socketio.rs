//! Tauri IPC replacements for `/gui` and `/rtk` socket namespaces.
//!
//! - Emits `gui:health` (`SystemHealthStat`) every 100 ms to all windows.
//! - Handles incoming client events (`rtk_data`, `ping`, `guiHeartBeat`) via
//!   the `socket_emit` Tauri command.

use std::time::Duration;

use serde_json::Value;

use crate::state::{AppState, SystemHealthStat};

pub async fn register(state: AppState) -> anyhow::Result<()> {
    tokio::spawn(async move {
        let mut tick = tokio::time::interval(Duration::from_millis(100));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            let snapshot = { state.health.read().await.clone() };
            state.emit_gui("health", &snapshot);

            let was_connected = { state.health.read().await.latency.connected };
            {
                let mut h = state.health.write().await;
                filter_recent_communications(&mut h);
                filter_other_health(&mut h);
            }
            let is_connected = { state.health.read().await.latency.connected };
            if was_connected && !is_connected {
                let st = state.clone();
                tokio::spawn(async move {
                    crate::services::terminate_active_mission_if_car_down(&st).await;
                });
            }
        }
    });

    Ok(())
}

/// Handle an event sent from the frontend via `invoke('socket_emit', ...)`.
pub async fn handle_socket_event(
    state: &AppState,
    namespace: Option<&str>,
    event: &str,
    payload: Option<Value>,
) {
    let ns = namespace.unwrap_or("/gui");
    match (ns, event) {
        ("/rtk", "rtk_data") | (_, "rtk_data") => {
            if let Some(data) = payload {
                tracing::info!(payload = %data, "rtk_data");
                let mut h = state.health.write().await;
                h.rtk_data.data = data;
                h.rtk_data.event_status = true;
                h.rtk_data.data_status = true;
            }
        }
        (_, "ping") => {
            tracing::debug!("pong");
        }
        (_, "guiHeartBeat") => {
            tracing::trace!("guiHeartBeat received");
        }
        _ => {
            tracing::debug!(namespace = ns, event = event, "unhandled socket_emit event");
        }
    }
}

/// `new Date(x).getTime()` for the payload timestamp fields we see: epoch-ms
/// numbers (car-backend heartbeats, our own updatedAt stamps) or ISO strings.
/// Anything else is JS `Invalid Date` → comparisons false → entry expires.
fn epoch_ms(v: Option<&Value>) -> Option<i64> {
    match v? {
        Value::Number(n) => n
            .as_i64()
            .or_else(|| n.as_f64().map(|f| f as i64)),
        Value::String(s) => chrono::DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|d| d.timestamp_millis()),
        _ => None,
    }
}

/// Port of filterRecentCommunications (socket.ts:104-119): drop entries older
/// than 5 s, then latency.connected = any live entry with type == "car"
/// (the Kafka `availableDevice` heartbeat from the car backend).
pub(crate) fn filter_recent_communications(h: &mut SystemHealthStat) {
    let five_ago = chrono::Utc::now().timestamp_millis() - 5000;
    h.available_communication.retain(|comm| {
        let t = epoch_ms(comm.get("timestamp")).or_else(|| epoch_ms(comm.get("updatedAt")));
        t.is_some_and(|ts| ts >= five_ago)
    });
    h.latency.connected = h.available_communication.iter().any(|comm| {
        let t = comm.get("type").and_then(Value::as_str).unwrap_or("");
        t == "car" || t.starts_with("car")
    });
}

/// Port of filterOtherHealth (socket.ts:121-143): expire per-camera AiHealth
/// entries after 5 s, then mirror the live map into AiHealth.data — but only
/// when non-empty, so an empty gui broadcast never clobbers the array the SSE
/// bite stream provides.
pub(crate) fn filter_other_health(h: &mut SystemHealthStat) {
    let five_ago = chrono::Utc::now().timestamp_millis() - 5000;
    let old = std::mem::take(&mut h.ai_health.health);
    for (k, v) in old {
        if epoch_ms(v.get("updatedAt")).is_some_and(|t| t >= five_ago) {
            h.ai_health.health.insert(k, v);
        }
    }
    if !h.ai_health.health.is_empty() {
        h.ai_health.data = h.ai_health.health.values().cloned().collect();
    }
}
