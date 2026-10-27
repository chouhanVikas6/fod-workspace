//! SSE endpoints — OWNED BY AGENT R2.
//! Ports of custom-api/health-data/index.ts and custom-api/retrive-data/index.ts
//! (mounted in routes/mod.rs at /api/sse/health-data and /api/sse/retrive-data).
//!
//! Framing matches the Node handlers byte-for-byte where the renderer's
//! EventSource consumers (subscribeHealth.ts, fodPanel.tsx, missionExplore.tsx)
//! can observe it:
//!   health-data : ": SSE Connection Established\n\n" once, then unnamed
//!                 "data: {biteState}\n\n" every 1 s, ":heartbeat\n\n" per 30 s
//!   retrive-data: "event: update\ndata: [rows]\n\n" (or "event: error\n…"),
//!                 immediate first poll then every 500 ms, ":heartbeat\n\n"
//!                 per 30 s
//! axum's Sse response carries the same Content-Type: text/event-stream and
//! Cache-Control: no-cache headers Node wrote (Connection: keep-alive is
//! implicit hop-by-hop under HTTP/1.1).
//! DB polling behaviour is kept as-is — parity first, no redesign.

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

/// ISO-8601 with milliseconds + Z — what JS Date#toISOString / JSON.stringify
/// produce. Naive DB timestamps are UTC (Prisma convention).
fn iso_millis_naive(t: chrono::NaiveDateTime) -> String {
    t.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

fn iso_millis_utc(t: chrono::DateTime<chrono::Utc>) -> String {
    t.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
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
        // axum serializes comments as ": <text>" (colon + space hardcoded),
        // so this yields Node's exact ": SSE Connection Established" line.
        // (The ":heartbeat" comments below gain that same space — ": heartbeat"
        // — which EventSource ignores; the Event API can't omit it.)
        if tx
            .send(Event::default().comment("SSE Connection Established"))
            .await
            .is_err()
        {
            return;
        }
        let url = format!("{}/api/bite-data/state", state.cfg.car_backend_url);
        let start = tokio::time::Instant::now();
        // setInterval semantics: first fire only after one full period.
        let mut poll = tokio::time::interval_at(start + Duration::from_secs(1), Duration::from_secs(1));
        poll.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut heartbeat =
            tokio::time::interval_at(start + Duration::from_secs(30), Duration::from_secs(30));
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

        loop {
            tokio::select! {
                _ = poll.tick() => {
                    // setInterval fires regardless of how long the previous
                    // axios call is taking (bite-data/state has been observed
                    // at 2.5 s) — overlap the fetches the same way instead of
                    // serializing them, or the 1 s cadence collapses.
                    let state = state.clone();
                    let url = url.clone();
                    let tx = tx.clone();
                    tokio::spawn(async move {
                        // backend temporarily unreachable — skip this tick
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
                _ = tx.closed() => return, // client closed the stream
            }
        }
    });

    sse_response(rx)
}

/// GET car-backend bite state; `const { latency, ...biteState } = r.data.data || {}`
/// — latency stays owned by the desktop's own heartbeat tracking.
async fn fetch_bite_state(state: &AppState, url: &str) -> Option<Value> {
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
COALESCE("f"."size", "fg"."biggestFodSize"::double precision, 10.0) AS "size",
COALESCE("f"."groupId", "fg"."groupId") AS "groupId",
COALESCE("f"."timestamp", "fg"."createdAt") AS "timestamp",
COALESCE("f"."location", '{"lat":0.0,"lon":0.0,"sd":0.0}'::jsonb) AS "location",
COALESCE("f"."class", 'Unknown') AS "class",
COALESCE("f"."velocity", 0.0) AS "velocity",
COALESCE("f"."sysid", '') AS "sysid",
COALESCE("f"."size", "fg"."biggestFodSize"::double precision, 10.0) AS "biggestSize",
"fg"."updatedAt" AT TIME ZONE 'UTC' AS "updatedAt",
fg."status"::text AS "groupStatus",
fg."groupId" AS "idssssss"
FROM "FodGroup" fg
LEFT JOIN "Fod" f ON fg."biggestFodId" = f."id"
WHERE fg."missionId" = $1
AND (
    (fg."updatedAt" AT TIME ZONE 'UTC') > $2::timestamptz
    OR ((fg."updatedAt" AT TIME ZONE 'UTC') = $2::timestamptz AND fg."groupId" > $3)
)
ORDER BY fg."updatedAt" ASC, fg."groupId" ASC
LIMIT 500
"#;


struct RetriveState {
    last_updated_at: String,
    last_group_id: i64,
    last_activity: Instant,
    data_has_been_sent: bool,
    polling_stopped: bool,
}

pub async fn retrive_data(
    State(state): State<AppState>,
    Query(query): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    // parseInt(req.query.id) — a missing/garbage id makes every poll hit the
    // error path, exactly like the NaN bind did in Prisma.
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
        let mut st = RetriveState {
            last_updated_at: "1970-01-01T00:00:00.000Z".to_string(),
            last_group_id: 0,
            last_activity: Instant::now(),
            data_has_been_sent: false,
            polling_stopped: false,
        };

        // Send initial data, then poll every 500 ms.
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
                return; // client closed the stream
            }
        }
    });

    sse_response(rx)
}

/// Port of sendData (custom-api/retrive-data/index.ts:24-118). Returns false
/// once the client is gone.
async fn send_data(
    state: &AppState,
    tx: &mpsc::Sender<Event>,
    mission_id: Option<i64>,
    st: &mut RetriveState,
) -> bool {
    let rows = match query_rows(state, mission_id, &st.last_updated_at, st.last_group_id).await {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!(error = %e, "SSE Error");
            let evt = Event::default()
                .event("error")
                .data(json!({ "error": "Failed to fetch data" }).to_string());
            return tx.send(evt).await.is_ok();
        }
    };

    if rows.is_empty() {
        // Inactivity timeout stops the DB polling but keeps the connection
        // (and heartbeats) alive — Node only clears pollInterval.
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

    // Advance cursor to the last row in this batch
    if let Some(last) = rows.last() {
        if let Some(ts) = last.get("updatedAt").and_then(Value::as_str) {
            st.last_updated_at = ts.to_string();
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
    last_updated_at: &str,
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
        // LEFT JOIN — every Fod column may be NULL.
        let id: Option<String> = row.try_get("id")?;
        let size: Option<f64> = row.try_get("size")?;
        let group_id: Option<i32> = row.try_get("groupId")?;
        let timestamp: Option<chrono::NaiveDateTime> = row.try_get("timestamp")?;
        let location: Option<Value> = row.try_get("location")?;
        let class: Option<String> = row.try_get("class")?;
        let velocity: Option<f64> = row.try_get("velocity")?;
        let sysid: Option<String> = row.try_get("sysid")?;
        let biggest_size: Option<f64> = row.try_get("biggestSize")?;
        let updated_at: Option<chrono::DateTime<chrono::Utc>> = row.try_get("updatedAt")?;
        let group_status: Option<String> = row.try_get("groupStatus")?;
        let idssssss: i32 = row.try_get("idssssss")?;
        out.push(json!({
            "id": id,
            "size": size,
            "groupId": group_id,
            "timestamp": timestamp.map(iso_millis_naive),
            "location": location,
            "class": class,
            "velocity": velocity,
            "sysid": sysid,
            "biggestSize": biggest_size,
            "updatedAt": updated_at.map(iso_millis_utc),
            "groupStatus": group_status,
            "idssssss": idssssss,
        }));
    }
    Ok(out)
}
