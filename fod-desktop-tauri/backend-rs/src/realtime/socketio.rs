//! socket.io namespaces — OWNED BY AGENT R2. Port of src/pages/api/socket.ts.
//!
//! /gui: emits "health" (SystemHealthStat) every 100 ms to the namespace, and
//!       "fod" / "update" events forwarded from backend_link + Kafka. ONE
//!       global broadcast task total — deliberate fix of the Node bug where
//!       every connection leaked its own setInterval (socket.ts:264); cadence
//!       and payload identical.
//!       Each broadcast tick also runs the two 5 s freshness filters
//!       (filterRecentCommunications, filterOtherHealth) on the shared state —
//!       same order as the Node interval body: emit first, then filter.
//! /rtk: receives "rtk_data" payloads → state.health.RtkData.

use std::time::Duration;

use serde_json::Value;
use socketioxide::SocketIo;
use socketioxide::extract::{Data, SocketRef};

use crate::state::{AppState, SystemHealthStat};

pub async fn register(io: SocketIo, state: AppState) -> anyhow::Result<()> {
    // ---- /rtk namespace (socket.ts:243-260) ----
    {
        let state = state.clone();
        io.ns("/rtk", move |socket: SocketRef| {
            let state = state.clone();
            async move {
                tracing::info!("A client connected rtk server");

                let st = state.clone();
                socket.on("rtk_data", move |Data::<Value>(payload)| {
                    let st = st.clone();
                    async move {
                        tracing::info!(payload = %payload, "rtk_data");
                        let mut h = st.health.write().await;
                        h.rtk_data.data = payload;
                        h.rtk_data.event_status = true;
                        h.rtk_data.data_status = true;
                    }
                });

                socket.on("ping", || async {
                    tracing::info!("pong");
                });

                socket.on_disconnect(|| async {
                    tracing::info!("A client disconnected Rtk server");
                });
            }
        });
    }

    // ---- /gui namespace (socket.ts:262-280) ----
    io.ns("/gui", move |socket: SocketRef| async move {
        tracing::info!("A client connected to gui server");

        socket.on("ping", || async {
            tracing::info!("pong");
        });

        socket.on_disconnect(|| async {
            tracing::info!("A client disconnected Gui");
        });
    });

    // ---- single global 100 ms health broadcast (fixes socket.ts:264 leak) ----
    {
        let io = io.clone();
        let state = state.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_millis(100));
            tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
            loop {
                tick.tick().await;
                // Emit first, then run the freshness filters — the Node
                // interval body does exactly this (emit → filterRecent →
                // filterOther).
                let snapshot = { state.health.read().await.clone() };
                if let Some(op) = io.of("/gui") {
                    // Broadcasting to zero connected sockets is a no-op, same
                    // as namespaceGui.emit with no clients.
                    if let Err(e) = op.emit("health", &snapshot).await {
                        tracing::debug!(error = %e, "health broadcast error");
                    }
                }
                let mut h = state.health.write().await;
                filter_recent_communications(&mut h);
                filter_other_health(&mut h);
            }
        });
    }

    Ok(())
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
