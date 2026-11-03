//! SSE & Tauri IPC stream endpoints.
//! Ports of custom-api/health-data/index.ts and custom-api/retrive-data/index.ts.
//!
//! Supports both Tauri IPC event streams (`sse:health-data` and
//! `sse:retrive-data:<subId>`) and the in-process router endpoints.

use std::collections::HashMap;
use std::convert::Infallible;
use std::time::{Duration, Instant};

use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::response::sse::{Event, Sse};
use serde_json::{Value, json};
use sqlx::Row;
use tokio::sync::mpsc;
use tokio_stream::StreamExt;
use tokio_stream::wrappers::ReceiverStream;

use crate::state::AppState;

fn sse_response(
    rx: mpsc::Receiver<Event>,
) -> Sse<impl futures::Stream<Item = Result<Event, Infallible>>> {
    Sse::new(ReceiverStream::new(rx).map(Ok))
}

fn iso_millis_naive(t: chrono::NaiveDateTime) -> String {
    t.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn iso_millis_utc(t: chrono::DateTime<chrono::Utc>) -> String {
    t.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Spawns a 1 s background broadcaster that emits `sse:health-data` Tauri IPC events.
pub fn spawn_health_broadcaster(state: AppState) {
    tokio::spawn(async move {
        let url = format!("{}/api/bite-data/state", state.cfg.car_backend_url);
        let mut poll = tokio::time::interval(Duration::from_secs(1));
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            poll.tick().await;
            if let Some(bite_state) = fetch_bite_state(&state, &url).await {
                state.emit_event("sse:health-data", &bite_state);
            }
        }
    });
}

pub async fn get_bite_state_once(state: &AppState) -> Option<Value> {
    let url = format!("{}/api/bite-data/state", state.cfg.car_backend_url);
    fetch_bite_state(state, &url).await
}

// ---------------------------------------------------------------------------
// /api/sse/health-data — custom-api/health-data/index.ts
// ---------------------------------------------------------------------------

pub async fn health_data(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    tracing::info!(?query, "SSE Connection Established");
    let (tx, rx) = mpsc::channel::<Event>(32);

    tokio::spawn(async move {
        if tx
            .send(Event::default().comment("SSE Connection Established"))
            .await
            .is_err()
        {
            return;
        }
        let url = format!("{}/api/bite-data/state", state.cfg.car_backend_url);
        let start = tokio::time::Instant::now();
        let mut poll = tokio::time::interval_at(start + Duration::from_secs(1), Duration::from_secs(1));
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut heartbeat =
            tokio::time::interval_at(start + Duration::from_secs(30), Duration::from_secs(30));
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                _ = poll.tick() => {
                    let state = state.clone();
                    let url = url.clone();
                    let tx = tx.clone();
                    tokio::spawn(async move {
                        if let Some(bite_state) = fetch_bite_state(&state, &url).await {
                            let _ = tx.send(Event::default().data(bite_state.to_string())).await;
                        }
                    });
                }
                _ = heartbeat.tick() => {
                    if tx.send(Event::default().comment("heartbeat")).await.is_err() {
                        return;
                    }
                }
                _ = tx.closed() => return,
            }
        }
    });

    sse_response(rx)
}

/// GET car-backend bite state; `const { latency, ...biteState } = r.data.data || {}`
/// — latency stays owned by the desktop's own heartbeat tracking.
pub(crate) async fn fetch_bite_state(state: &AppState, url: &str) -> Option<Value> {
    if let Ok(mut client) = proto_defination::bite::bite_service_client::BiteServiceClient::connect(state.cfg.car_backend_url.clone()).await {
        if let Ok(resp) = client.get_bite_state(tonic::Request::new(proto_defination::bite::GetBiteStateRequest {})).await {
            let b = resp.into_inner();
            let mut cameras_obj = serde_json::Map::new();
            for c in b.cameras {
                cameras_obj.insert(c.cam_id.clone(), json!({
                    "connection": c.camera_connection,
                    "intrFps": c.intr_fps,
                    "pause": c.pause,
                    "vgFps": c.vg_fps,
                    "msFps": c.ms_fps,
                    "timestamp": c.timestamp,
                }));
            }
            let mut pc_nodes_obj = serde_json::Map::new();
            for (k, v) in &b.pc_nodes {
                pc_nodes_obj.insert(k.clone(), json!({
                    "cpuUsagePercent": v.cpu_usage_percent,
                    "memoryUsagePercent": v.memory_usage_percent,
                    "diskUsagePercent": v.disk_usage_percent,
                    "temperatureC": v.temperature_c,
                }));
            }
            let pc = b.pc_nodes.values().next().cloned().unwrap_or(proto_defination::bite::PcHealthMetrics {
                cpu_usage_percent: 15.0,
                memory_usage_percent: 25.0,
                disk_usage_percent: 30.0,
                temperature_c: 45.0,
            });
            let p_gps = b.primary_gps.as_ref();
            let s_gps = b.secondary_gps.as_ref();
            let car_health = json!({
                "temp": pc.temperature_c,
                "volt": 24.0,
                "connection": b.connected,
                "memory_gb": ((pc.memory_usage_percent / 100.0) * 32.0).round(),
                "space_gb": (((100.0 - pc.disk_usage_percent) / 100.0) * 500.0).round(),
                "rtk": {
                    "primary": {
                        "location": {
                            "lat": p_gps.map(|g| g.lat).unwrap_or(0.0),
                            "lon": p_gps.map(|g| g.lon).unwrap_or(0.0),
                            "sd": p_gps.map(|g| if g.sd < 0.0 { 0.1 } else { g.sd }).unwrap_or(0.1),
                            "heading": p_gps.map(|g| g.heading).unwrap_or(0.0),
                        },
                        "status": p_gps.map(|g| if g.fix.is_empty() { "RTK" } else { g.fix.as_str() }).unwrap_or("RTK"),
                        "satellite": 18,
                    },
                    "secondary": {
                        "location": {
                            "lat": s_gps.map(|g| g.lat).unwrap_or(0.0),
                            "lon": s_gps.map(|g| g.lon).unwrap_or(0.0),
                            "sd": s_gps.map(|g| if g.sd < 0.0 { 0.1 } else { g.sd }).unwrap_or(0.1),
                            "heading": s_gps.map(|g| g.heading).unwrap_or(0.0),
                        },
                        "status": s_gps.map(|g| if g.fix.is_empty() { "RTK" } else { g.fix.as_str() }).unwrap_or("RTK"),
                        "satellite": 16,
                    },
                    "timer_script_delay": b.ping_latency_ms,
                    "updatedAt": chrono::Utc::now().to_rfc3339(),
                },
                "updatedAt": chrono::Utc::now().to_rfc3339(),
            });
            return Some(json!({
                "timestamp": b.timestamp,
                "primaryGps": b.primary_gps.map(|g| json!({
                    "fix": g.fix,
                    "sd": g.sd,
                    "lat": g.lat,
                    "lon": g.lon,
                    "heading": g.heading,
                    "velocity": g.velocity,
                })),
                "secondaryGps": b.secondary_gps.map(|g| json!({
                    "fix": g.fix,
                    "sd": g.sd,
                    "lat": g.lat,
                    "lon": g.lon,
                    "heading": g.heading,
                    "velocity": g.velocity,
                })),
                "cameras": Value::Object(cameras_obj),
                "pcNodes": Value::Object(pc_nodes_obj),
                "car_health": car_health,
            }));
        }
    }

    let resp = state
        .http
        .get(url)
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?
        .error_for_status()
        .ok()?;
    let body: Value = resp.json().await.ok()?;
    match body.get("data") {
        Some(Value::Object(m)) => {
            let mut m = m.clone();
            m.remove("latency");
            Some(Value::Object(m))
        }
        _ => Some(json!({})),
    }
}

// ---------------------------------------------------------------------------
// /api/sse/retrive-data — custom-api/retrive-data/index.ts
// ---------------------------------------------------------------------------

/// JS parseInt: trimmed, optional sign, longest leading digit run; None = NaN.
fn parse_int_js(s: &str) -> Option<i64> {
    let s = s.trim();
    let (sign, digits) = match s.strip_prefix('-') {
        Some(rest) => (-1i64, rest),
        None => (1i64, s.strip_prefix('+').unwrap_or(s)),
    };
    let run: String = digits.chars().take_while(|c| c.is_ascii_digit()).collect();
    if run.is_empty() {
        return None;
    }
    run.parse::<i64>().ok().map(|v| sign * v)
}

const RETRIVE_SQL: &str = r#"
SELECT
COALESCE("f"."id", "fg"."biggestFodId", "fg"."id") AS "id",
COALESCE("f"."size", CAST("fg"."biggestFodSize" AS REAL), 10.0) AS "size",
COALESCE("f"."groupId", "fg"."groupId") AS "groupId",
COALESCE("f"."timestamp", "fg"."createdAt") AS "timestamp",
COALESCE("f"."location", '{"lat":0.0,"lon":0.0,"sd":0.0}') AS "location",
COALESCE("f"."class", 'Unknown') AS "class",
COALESCE("f"."velocity", 0.0) AS "velocity",
COALESCE("f"."sysid", '') AS "sysid",
COALESCE("f"."size", CAST("fg"."biggestFodSize" AS REAL), 10.0) AS "biggestSize",
"fg"."updatedAt" AS "updatedAt",
fg."status" AS "groupStatus",
fg."groupId" AS "idssssss"
FROM "FodGroup" fg
LEFT JOIN "Fod" f ON fg."biggestFodId" = f."id"
WHERE fg."missionId" = $1
AND (
    fg."updatedAt" > $2
    OR (fg."updatedAt" = $2 AND fg."groupId" > $3)
)
ORDER BY fg."updatedAt" ASC, fg."groupId" ASC
LIMIT 500
"#;

struct RetriveState {
    last_updated_at: chrono::NaiveDateTime,
    last_group_id: i64,
    last_activity: Instant,
    data_has_been_sent: bool,
    polling_stopped: bool,
}

impl RetriveState {
    fn new() -> Self {
        let epoch = chrono::DateTime::from_timestamp_millis(0)
            .map(|dt| dt.naive_utc())
            .unwrap_or_default();
        Self {
            last_updated_at: epoch,
            last_group_id: 0,
            last_activity: Instant::now(),
            data_has_been_sent: false,
            polling_stopped: false,
        }
    }
}

/// Start a Tauri IPC subscription for `retrive-data`, emitting events on
/// `sse:retrive-data:{sub_id}` with payload `{ "event": "update"|"error", "data": ... }`.
pub async fn start_retrive_ipc_stream(state: AppState, sub_id: String, mission_id: Option<i64>) {
    stop_retrive_ipc_stream(&state, &sub_id).await;

    if let Some(mid) = mission_id {
        let st = state.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::scheduler::sync_fod(&st, mid).await {
                tracing::warn!("sync_fod on IPC retrive-data connect for mission {mid} failed: {e}");
            }
        });
    }

    let event_name = format!("sse:retrive-data:{sub_id}");
    let state_clone = state.clone();
    let handle = tokio::spawn(async move {
        let mut st = RetriveState::new();
        send_data_ipc(&state_clone, &event_name, mission_id, &mut st).await;

        let start = tokio::time::Instant::now();
        let mut poll =
            tokio::time::interval_at(start + Duration::from_millis(500), Duration::from_millis(500));
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            poll.tick().await;
            if !st.polling_stopped {
                send_data_ipc(&state_clone, &event_name, mission_id, &mut st).await;
            }
        }
    });

    state.retrive_subs.lock().await.insert(sub_id, handle);
}

pub async fn stop_retrive_ipc_stream(state: &AppState, sub_id: &str) {
    if let Some(handle) = state.retrive_subs.lock().await.remove(sub_id) {
        handle.abort();
    }
}

async fn send_data_ipc(
    state: &AppState,
    event_name: &str,
    mission_id: Option<i64>,
    st: &mut RetriveState,
) {
    let rows = match query_rows(state, mission_id, st.last_updated_at, st.last_group_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!(error = %e, "IPC retrive-data error");
            state.emit_event(
                event_name,
                &json!({
                    "event": "error",
                    "data": { "error": "Failed to fetch data" }
                }),
            );
            return;
        }
    };

    if rows.is_empty() {
        if !st.data_has_been_sent {
            st.data_has_been_sent = true;
            state.emit_event(
                event_name,
                &json!({
                    "event": "update",
                    "data": []
                }),
            );
            return;
        }
        if st.data_has_been_sent
            && st.last_activity.elapsed() > Duration::from_secs(5 * 60)
            && !st.polling_stopped
        {
            tracing::info!("[IPC retrive-data] Inactivity timeout reached, stopping polling.");
            st.polling_stopped = true;
        }
        return;
    }

    st.last_activity = Instant::now();
    st.data_has_been_sent = true;

    if let Some(last) = rows.last() {
        if let Some(ts_val) = last.get("updatedAt") {
            if let Some(dt) = crate::services::parse_js_date(ts_val) {
                st.last_updated_at = dt;
            }
        }
        if let Some(gid) = last.get("idssssss").and_then(Value::as_i64) {
            st.last_group_id = gid;
        }
    }

    state.emit_event(
        event_name,
        &json!({
            "event": "update",
            "data": rows
        }),
    );
}

pub async fn retrive_data(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let mission_id = query.get("id").and_then(|s| parse_int_js(s));
    tracing::info!(?mission_id, "SSE retrive-data connection opened");

    if let Some(mid) = mission_id {
        let st = state.clone();
        tokio::spawn(async move {
            if let Err(e) = crate::scheduler::sync_fod(&st, mid).await {
                tracing::warn!("sync_fod on SSE connect for mission {mid} failed: {e}");
            }
        });
    }

    let (tx, rx) = mpsc::channel::<Event>(32);

    tokio::spawn(async move {
        let mut st = RetriveState::new();

        if !send_data(&state, &tx, mission_id, &mut st).await {
            return;
        }
        let start = tokio::time::Instant::now();
        let mut poll =
            tokio::time::interval_at(start + Duration::from_millis(500), Duration::from_millis(500));
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut heartbeat =
            tokio::time::interval_at(start + Duration::from_secs(30), Duration::from_secs(30));
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            let alive = tokio::select! {
                _ = poll.tick(), if !st.polling_stopped => {
                    send_data(&state, &tx, mission_id, &mut st).await
                }
                _ = heartbeat.tick() => {
                    tx.send(Event::default().comment("heartbeat")).await.is_ok()
                }
            };
            if !alive {
                return;
            }
        }
    });

    sse_response(rx)
}

async fn send_data(
    state: &AppState,
    tx: &mpsc::Sender<Event>,
    mission_id: Option<i64>,
    st: &mut RetriveState,
) -> bool {
    let rows = match query_rows(state, mission_id, st.last_updated_at, st.last_group_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!(error = %e, "SSE Error");
            let evt = Event::default()
                .event("error")
                .data(json!({ "error": "Failed to fetch data" }).to_string());
            let _ = tx.send(evt).await;
            return true;
        }
    };

    if rows.is_empty() {
        if !st.data_has_been_sent {
            st.data_has_been_sent = true;
            let evt = Event::default().event("update").data("[]");
            return tx.send(evt).await.is_ok();
        }
        if st.data_has_been_sent
            && st.last_activity.elapsed() > Duration::from_secs(5 * 60)
            && !st.polling_stopped
        {
            tracing::info!("[SSE] Inactivity timeout reached, stopping polling.");
            st.polling_stopped = true;
        }
        return true;
    }

    st.last_activity = Instant::now();
    st.data_has_been_sent = true;

    if let Some(last) = rows.last() {
        if let Some(ts_val) = last.get("updatedAt") {
            if let Some(dt) = crate::services::parse_js_date(ts_val) {
                st.last_updated_at = dt;
            }
        }
        if let Some(gid) = last.get("idssssss").and_then(Value::as_i64) {
            st.last_group_id = gid;
        }
    }

    let evt = Event::default()
        .event("update")
        .data(serde_json::to_string(&rows).unwrap_or_else(|_| "[]".into()));
    tx.send(evt).await.is_ok()
}

async fn query_rows(
    state: &AppState,
    mission_id: Option<i64>,
    last_updated_at: chrono::NaiveDateTime,
    last_group_id: i64,
) -> anyhow::Result<Vec<Value>> {
    let mission_id = mission_id.ok_or_else(|| anyhow::anyhow!("invalid mission id (NaN)"))?;
    let rows = sqlx::query(RETRIVE_SQL)
        .bind(mission_id)
        .bind(last_updated_at)
        .bind(last_group_id)
        .fetch_all(&state.db)
        .await?;

    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        let id: Option<String> = row.try_get("id")?;
        let size: Option<f64> = row.try_get("size")?;
        let group_id: Option<i32> = row.try_get("groupId")?;
        let timestamp: Option<String> = row
            .try_get::<chrono::NaiveDateTime, _>("timestamp")
            .ok()
            .map(iso_millis_naive)
            .or_else(|| {
                row.try_get::<chrono::DateTime<chrono::Utc>, _>("timestamp")
                    .ok()
                    .map(iso_millis_utc)
            });
        let location: Option<Value> = row.try_get("location")?;
        let class: Option<String> = row.try_get("class")?;
        let velocity: Option<f64> = row.try_get("velocity")?;
        let sysid: Option<String> = row.try_get("sysid")?;
        let biggest_size: Option<f64> = row.try_get("biggestSize")?;
        let updated_at: Option<String> = row
            .try_get::<chrono::NaiveDateTime, _>("updatedAt")
            .ok()
            .map(iso_millis_naive)
            .or_else(|| {
                row.try_get::<chrono::DateTime<chrono::Utc>, _>("updatedAt")
                    .ok()
                    .map(iso_millis_utc)
            });
        let group_status: Option<String> = row.try_get("groupStatus")?;
        let idssssss: i32 = row.try_get("idssssss")?;
        out.push(json!({
            "id": id,
            "size": size,
            "groupId": group_id,
            "timestamp": timestamp,
            "location": location,
            "class": class,
            "velocity": velocity,
            "sysid": sysid,
            "biggestSize": biggest_size,
            "updatedAt": updated_at,
            "groupStatus": group_status,
            "idssssss": idssssss,
        }));
    }
    Ok(out)
}
