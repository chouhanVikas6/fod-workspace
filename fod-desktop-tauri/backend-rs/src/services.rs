//! Cross-module domain operations. OWNED BY AGENT R1 (mission/fod domain).
//!
//! The SIGNATURES of `upsert_mission_data`, `upsert_group_data` and
//! `handle_fod_from_socket` are FROZEN — realtime (R2) calls them from the
//! Kafka consumer and the car-backend socket listener. Everything else in this
//! file is R1-internal helper surface shared by routes/{mission,fod_group,
//! cleared_fod}.rs (ports of src/services/{mission,fod-group,fod,cleared-fod}.ts
//! and src/utils/apiMain.ts).

use crate::state::AppState;
use serde_json::{json, Map, Value};
use sqlx::types::chrono::{NaiveDateTime, Utc};
use sqlx::{Postgres, QueryBuilder};
use std::time::Duration;

pub const MISSION_STATUS: &[&str] = &["ACTIVE", "INACTIVE", "TERMINATED"];
pub const MISSION_SCAN_STATUS: &[&str] = &["PLAY", "PAUSE"];
pub const FOD_GROUP_STATUS: &[&str] = &["NEW", "ACCEPTED", "REJECTED", "CLEARED"];
pub const CLEARED_FOD_STATUS: &[&str] = &["found", "not_found", "false_positive"];

// ---------------------------------------------------------------------------
// JS-semantics helpers (parity with the Node handlers' loose value handling)
// ---------------------------------------------------------------------------

/// JavaScript truthiness for a JSON value ("" / 0 / null / false are falsy).
pub fn js_truthy(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::Number(n) => n.as_f64().map(|f| f != 0.0 && !f.is_nan()).unwrap_or(true),
        Value::String(s) => !s.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

/// JS `parseInt(str)` (base 10): trim, optional sign, leading digits.
/// Returns None for NaN.
pub fn js_parse_int(s: &str) -> Option<i64> {
    let t = s.trim();
    let (sign, digits) = match t.as_bytes().first() {
        Some(b'-') => (-1i64, &t[1..]),
        Some(b'+') => (1i64, &t[1..]),
        _ => (1i64, t),
    };
    let lead: String = digits.chars().take_while(|c| c.is_ascii_digit()).collect();
    if lead.is_empty() {
        return None;
    }
    lead.parse::<i64>().ok().map(|n| sign * n)
}

/// `Number.isInteger` semantics: JSON number with zero fractional part.
pub fn json_integer(v: &Value) -> Option<i64> {
    match v {
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Some(i)
            } else {
                n.as_f64().and_then(|f| {
                    if f.is_finite() && f.fract() == 0.0 && f.abs() < 9.2e18 {
                        Some(f as i64)
                    } else {
                        None
                    }
                })
            }
        }
        _ => None,
    }
}

/// Prisma `Int` (32-bit) coercion: integer-valued JSON number in i32 range.
pub fn json_i32(v: &Value) -> Option<i32> {
    json_integer(v).and_then(|n| i32::try_from(n).ok())
}

/// JS template-literal segment: `${x}` for path building (number → "5",
/// string kept, missing → "undefined", null → "null").
pub fn js_seg(v: Option<&Value>) -> String {
    match v {
        None => "undefined".to_string(),
        Some(Value::Null) => "null".to_string(),
        Some(Value::String(s)) => s.clone(),
        Some(Value::Number(n)) => n.to_string(),
        Some(Value::Bool(b)) => b.to_string(),
        Some(other) => other.to_string(),
    }
}

/// `new Date(x)` for the payload shapes seen here: epoch-ms number or
/// ISO-8601 string. Returns None for Invalid Date (→ callers error like
/// Prisma would).
pub fn parse_js_date(v: &Value) -> Option<NaiveDateTime> {
    match v {
        Value::Number(n) => {
            let ms = n.as_f64()?;
            chrono::DateTime::from_timestamp_millis(ms as i64).map(|dt| dt.naive_utc())
        }
        Value::String(s) => {
            if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(s) {
                return Some(dt.naive_utc());
            }
            // "2026-08-12T10:00:00.000" / "2026-08-12 10:00:00" (treated as UTC
            // like Node parses date-only/ISO-without-zone forms).
            for fmt in ["%Y-%m-%dT%H:%M:%S%.f", "%Y-%m-%d %H:%M:%S%.f", "%Y-%m-%d"] {
                if let Ok(dt) = NaiveDateTime::parse_from_str(s, fmt) {
                    return Some(dt);
                }
                if fmt == "%Y-%m-%d"
                    && let Ok(d) = chrono::NaiveDate::parse_from_str(s, fmt)
                {
                    return Some(d.and_hms_opt(0, 0, 0).unwrap());
                }
            }
            None
        }
        _ => None,
    }
}

/// Prisma's client-side `now()` (@updatedAt etc.) — UTC, like the Node client.
/// Never use SQL now() for these: the Postgres session TZ here is
/// Asia/Kolkata, so now() into timestamp-without-tz would store local wall
/// time while Prisma always stored UTC.
pub fn now_naive() -> NaiveDateTime {
    Utc::now().naive_utc()
}

/// Loose `x == 200` (JS ==): number 200 / 200.0 or string "200".
pub fn loose_eq_200(v: Option<&Value>) -> bool {
    match v {
        Some(Value::Number(n)) => n.as_f64() == Some(200.0),
        Some(Value::String(s)) => s.trim().parse::<f64>().ok() == Some(200.0),
        _ => false,
    }
}

/// `Buffer.from(frame)` equivalent for the JSON shapes a frame arrives as:
/// string → utf8 bytes, array of numbers → bytes (Node wraps mod 256),
/// {type:"Buffer",data:[...]} → bytes. Anything else → None (Buffer.from
/// would throw and the Node caller's catch swallows the record).
pub fn frame_to_bytes(v: &Value) -> Option<Vec<u8>> {
    fn arr_to_bytes(a: &[Value]) -> Vec<u8> {
        a.iter()
            .map(|x| x.as_f64().map(|f| (f as i64 & 0xFF) as u8).unwrap_or(0))
            .collect()
    }
    match v {
        Value::String(s) => Some(s.as_bytes().to_vec()),
        Value::Array(a) => Some(arr_to_bytes(a)),
        Value::Object(o) => o.get("data").and_then(|d| d.as_array()).map(|a| arr_to_bytes(a)),
        _ => None,
    }
}

// ---------------------------------------------------------------------------
// apiToMain (src/utils/apiMain.ts) -> gRPC integration with Car backend
// ---------------------------------------------------------------------------

fn proto_mission_status_str(status: i32) -> &'static str {
    match proto_defination::common::MissionStatus::try_from(status) {
        Ok(proto_defination::common::MissionStatus::Active) => "ACTIVE",
        Ok(proto_defination::common::MissionStatus::Inactive) => "INACTIVE",
        Ok(proto_defination::common::MissionStatus::Terminated) => "TERMINATED",
        _ => "INACTIVE",
    }
}

fn proto_scan_status_str(status: i32) -> &'static str {
    match proto_defination::common::MissionScanStatus::try_from(status) {
        Ok(proto_defination::common::MissionScanStatus::Play) => "PLAY",
        Ok(proto_defination::common::MissionScanStatus::Pause) => "PAUSE",
        _ => "PAUSE",
    }
}

pub(crate) fn proto_group_status_str(status: i32) -> &'static str {
    match proto_defination::common::FodGroupStatus::try_from(status) {
        Ok(proto_defination::common::FodGroupStatus::New) => "NEW",
        Ok(proto_defination::common::FodGroupStatus::Accepted) => "ACCEPTED",
        Ok(proto_defination::common::FodGroupStatus::Rejected) => "REJECTED",
        Ok(proto_defination::common::FodGroupStatus::Cleared) => "CLEARED",
        _ => "NEW",
    }
}

fn proto_group_status_from_str(s: &str) -> i32 {
    match s.trim().to_uppercase().as_str() {
        "NEW" => proto_defination::common::FodGroupStatus::New as i32,
        "ACCEPTED" => proto_defination::common::FodGroupStatus::Accepted as i32,
        "REJECTED" => proto_defination::common::FodGroupStatus::Rejected as i32,
        "CLEARED" => proto_defination::common::FodGroupStatus::Cleared as i32,
        _ => proto_defination::common::FodGroupStatus::GroupStatusUnspecified as i32,
    }
}

fn proto_ms_to_iso(ms: i64) -> String {
    if ms > 0 {
        chrono::DateTime::from_timestamp_millis(ms)
            .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
            .unwrap_or_else(|| chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
    } else {
        chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
    }
}

fn proto_mission_detail_to_json(m: &proto_defination::mission::MissionDetail) -> Value {
    json!({
        "id": m.id,
        "status": proto_mission_status_str(m.status),
        "timer": m.timer as f64,
        "scanStatus": proto_scan_status_str(m.scan_status),
        "pass": m.pass,
        "speed": m.speed,
        "createdAt": proto_ms_to_iso(m.created_at),
        "updatedAt": proto_ms_to_iso(m.updated_at),
        "createdBy": m.created_by,
        "updatedBy": m.updated_by,
    })
}

fn proto_fod_group_to_json(g: &proto_defination::fod_group::FodGroupEntity) -> Value {
    json!({
        "id": g.id.to_string(),
        "groupId": g.group_id,
        "missionId": g.mission_id,
        "status": proto_group_status_str(g.status),
        "biggestFod": g.biggest_fod,
        "biggestFodSize": g.biggest_fod_size,
        "version": g.version,
        "createdAt": proto_ms_to_iso(g.created_at),
        "updatedAt": proto_ms_to_iso(g.updated_at),
        "primaryPacket": Value::Null,
        "clearedFod": Value::Null,
    })
}

fn proto_fod_entity_to_json(f: &proto_defination::fod::FodEntity) -> Value {
    let lat = f.location.as_ref().map(|l| l.lat).unwrap_or(0.0);
    let lon = f.location.as_ref().map(|l| l.lon).unwrap_or(0.0);
    let sd = f.location.as_ref().map(|l| l.sd).unwrap_or(0.0);
    json!({
        "id": f.id,
        "missionId": f.mission_id,
        "groupId": f.group_id,
        "sysid": f.sysid,
        "location": {
            "lat": lat,
            "lon": lon,
            "sd": sd,
        },
        "lat": lat,
        "lon": lon,
        "sd": sd,
        "confidence": f.confidence,
        "class": f.class_name,
        "className": f.class_name,
        "velocity": f.velocity,
        "size": f.size,
        "timestamp": proto_ms_to_iso(f.timestamp),
        "imageSha256": f.image_sha256,
        "imageSize": f.image_size,
        "frameMissing": f.frame_missing,
        "createdAt": proto_ms_to_iso(f.created_at),
    })
}

async fn connect_channel_with_fallback(primary: &str, secondary: &str) -> Option<tonic::transport::Channel> {
    if let Ok(endpoint) = tonic::transport::Endpoint::from_shared(primary.to_string()) {
        if let Ok(ch) = endpoint.connect_timeout(Duration::from_millis(600)).timeout(Duration::from_secs(5)).connect().await {
            return Some(ch);
        }
    }
    if let Ok(endpoint) = tonic::transport::Endpoint::from_shared(secondary.to_string()) {
        if let Ok(ch) = endpoint.connect_timeout(Duration::from_millis(600)).timeout(Duration::from_secs(5)).connect().await {
            return Some(ch);
        }
    }
    None
}

async fn connect_mission_control_client(state: &AppState) -> Option<proto_defination::mission_control::mission_control_service_client::MissionControlServiceClient<tonic::transport::Channel>> {
    let ch = connect_channel_with_fallback(&state.cfg.car_backend_url, &state.cfg.atc_backend_url).await?;
    Some(proto_defination::mission_control::mission_control_service_client::MissionControlServiceClient::new(ch))
}

async fn connect_mission_client(state: &AppState) -> Option<proto_defination::mission::mission_service_client::MissionServiceClient<tonic::transport::Channel>> {
    let ch = connect_channel_with_fallback(&state.cfg.car_backend_url, &state.cfg.atc_backend_url).await?;
    Some(proto_defination::mission::mission_service_client::MissionServiceClient::new(ch))
}

async fn connect_fod_group_client(state: &AppState) -> Option<proto_defination::fod_group::fod_group_service_client::FodGroupServiceClient<tonic::transport::Channel>> {
    let ch = connect_channel_with_fallback(&state.cfg.car_backend_url, &state.cfg.atc_backend_url).await?;
    Some(proto_defination::fod_group::fod_group_service_client::FodGroupServiceClient::new(ch))
}

async fn connect_fod_client(state: &AppState) -> Option<proto_defination::fod::fod_service_client::FodServiceClient<tonic::transport::Channel>> {
    let ch = connect_channel_with_fallback(&state.cfg.car_backend_url, &state.cfg.atc_backend_url).await?;
    Some(proto_defination::fod::fod_service_client::FodServiceClient::new(ch))
}

async fn connect_image_client(state: &AppState) -> Option<proto_defination::image::image_service_client::ImageServiceClient<tonic::transport::Channel>> {
    let ch = connect_channel_with_fallback(&state.cfg.car_backend_url, &state.cfg.atc_backend_url).await?;
    Some(proto_defination::image::image_service_client::ImageServiceClient::new(ch))
}

pub async fn connect_cleared_fod_client(state: &AppState) -> Option<proto_defination::cleared_fod::cleared_fod_service_client::ClearedFodServiceClient<tonic::transport::Channel>> {
    let ch = connect_channel_with_fallback(&state.cfg.car_backend_url, &state.cfg.atc_backend_url).await?;
    Some(proto_defination::cleared_fod::cleared_fod_service_client::ClearedFodServiceClient::new(ch))
}

pub async fn call_car_grpc(
    state: &AppState,
    endpoint: &str,
    data: Option<Value>,
) -> Option<Value> {
    // 1. Mission Control: Start
    if endpoint == "/api/mission-control/start" {
        let speed = data.as_ref().and_then(|d| d.get("speed")).and_then(Value::as_i64).map(|v| v as i32);
        let pass = data.as_ref().and_then(|d| d.get("pass")).and_then(Value::as_i64).map(|v| v as i32);
        let mut client = connect_mission_control_client(state).await?;
        let res = match client.start_mission(tonic::Request::new(
            proto_defination::mission_control::StartMissionRequest { speed, pass },
        )).await {
            Ok(resp) => resp.into_inner(),
            Err(status) if status.code() == tonic::Code::AlreadyExists => {
                tracing::warn!("Car backend reported mission already active, terminating previous and starting new");
                let _ = client.terminate_mission(tonic::Request::new(
                    proto_defination::mission_control::TerminateMissionRequest { mission_id: 0 },
                )).await;
                client.start_mission(tonic::Request::new(
                    proto_defination::mission_control::StartMissionRequest { speed, pass },
                )).await.ok()?.into_inner()
            }
            Err(e) => {
                tracing::error!("start_mission failed: {e}");
                return None;
            }
        };
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": {
                "id": res.mission_id,
                "missionId": res.mission_id,
                "status": proto_mission_status_str(res.status),
                "scanStatus": proto_scan_status_str(res.scan_status),
                "timer": res.timer_seconds,
                "duration": res.timer_seconds * 1000,
                "createdAt": proto_ms_to_iso(res.created_at),
            }
        }));
    }

    // 2. Mission Control: Join
    if let Some(id_str) = endpoint.strip_prefix("/api/mission-control/join/") {
        let mission_id = id_str.parse::<i64>().ok()?;
        let mut client = connect_mission_control_client(state).await?;
        let res = client.join_mission(tonic::Request::new(
            proto_defination::mission_control::JoinMissionRequest { mission_id },
        )).await.ok()?.into_inner();
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": {
                "id": res.mission_id,
                "missionId": res.mission_id,
                "status": proto_mission_status_str(res.status),
                "scanStatus": proto_scan_status_str(res.scan_status),
                "startTime": res.start_time,
                "durationMs": res.duration_ms,
                "duration": res.duration_ms,
                "timer": (res.duration_ms as f64) / 1000.0,
                "fodGroupCount": res.fod_group_count,
            }
        }));
    }

    // 3. Mission Control: Restart
    if let Some(id_str) = endpoint.strip_prefix("/api/mission-control/restart/") {
        let mission_id = id_str.parse::<i64>().ok()?;
        let mut client = connect_mission_control_client(state).await?;
        let res = client.restart_mission(tonic::Request::new(
            proto_defination::mission_control::RestartMissionRequest { mission_id },
        )).await.ok()?.into_inner();
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": {
                "id": res.mission_id,
                "missionId": res.mission_id,
                "status": proto_mission_status_str(res.status),
                "scanStatus": proto_scan_status_str(res.scan_status),
                "timer": res.timer_seconds,
                "duration": res.timer_seconds * 1000,
                "createdAt": proto_ms_to_iso(res.created_at),
            }
        }));
    }

    // 4. Mission Control: Scan Status
    if endpoint == "/api/mission-control/scan-status" || endpoint == "/mission/scan/status" {
        let mut client = connect_mission_control_client(state).await?;
        let res = client.get_scan_status(tonic::Request::new(
            proto_defination::mission_control::GetScanStatusRequest {},
        )).await.ok()?.into_inner();
        let status_str = proto_scan_status_str(res.scan_status);
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": status_str,
        }));
    }

    // 5. Mission Control: Toggle Scan
    if endpoint == "/api/mission-control/toggle-scan" {
        let resume = data.as_ref()
            .and_then(|d| d.get("resume").and_then(Value::as_bool))
            .or_else(|| {
                data.as_ref().and_then(|d| d.get("type").and_then(Value::as_str)).map(|s| {
                    let lower = s.to_ascii_lowercase();
                    lower == "resume" || lower == "play"
                })
            })
            .unwrap_or(true);
        let cam_list = data.as_ref()
            .and_then(|d| d.get("camList").and_then(Value::as_array))
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let mut client = connect_mission_control_client(state).await?;
        let res = client.toggle_scan_status(tonic::Request::new(
            proto_defination::mission_control::ToggleScanRequest { resume, cam_list },
        )).await.ok()?.into_inner();
        let status_str = proto_scan_status_str(res.scan_status);
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": status_str,
        }));
    }

    // 6. Mission Control: Terminate
    if let Some(id_str) = endpoint.strip_prefix("/api/mission-control/terminate/") {
        let mission_id = id_str.parse::<i64>().ok()?;
        let mut client = connect_mission_control_client(state).await?;
        let res = client.terminate_mission(tonic::Request::new(
            proto_defination::mission_control::TerminateMissionRequest { mission_id },
        )).await.ok()?.into_inner();
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": {
                "missionId": res.mission_id,
                "success": res.success,
                "message": res.message,
            }
        }));
    }

    // 7. Mission: Active
    if endpoint == "/mission/active" || endpoint == "/api/mission/load/active" {
        let mut client = connect_mission_client(state).await?;
        let res = client.get_active_mission(tonic::Request::new(
            proto_defination::mission::GetActiveMissionRequest {},
        )).await.ok()?.into_inner();
        return match res.active_mission {
            Some(m) => Some(proto_mission_detail_to_json(&m)),
            None => Some(Value::Null),
        };
    }

    // 8. Mission: Exclude (Scheduler & sync)
    if endpoint == "/api/mission/exclude" {
        let mut client = connect_mission_client(state).await?;
        let active = client.get_active_mission(tonic::Request::new(
            proto_defination::mission::GetActiveMissionRequest {},
        )).await.ok().and_then(|r| r.into_inner().active_mission);

        let all = client.list_missions(tonic::Request::new(
            proto_defination::mission::ListMissionsRequest {
                pagination: Some(proto_defination::common::PaginationRequest { page: 1, limit: 100 }),
            },
        )).await.ok().map(|r| r.into_inner().missions).unwrap_or_default();

        let excluded_ids: std::collections::HashSet<i64> = data.as_ref()
            .and_then(|d| d.get("missionList").and_then(Value::as_array))
            .map(|arr| arr.iter().filter_map(Value::as_i64).collect())
            .unwrap_or_default();

        let excluded_missions: Vec<Value> = all
            .into_iter()
            .filter(|m| !excluded_ids.contains(&m.id))
            .map(|m| proto_mission_detail_to_json(&m))
            .collect();

        return Some(json!({
            "activeMission": active.map(|m| proto_mission_detail_to_json(&m)).unwrap_or(Value::Null),
            "missionList": excluded_missions,
        }));
    }

    // 9. Mission: List all
    if endpoint == "/mission" || endpoint == "/mission/get/all" || endpoint == "/api/mission" {
        let mut client = connect_mission_client(state).await?;
        let res = client.list_missions(tonic::Request::new(
            proto_defination::mission::ListMissionsRequest {
                pagination: Some(proto_defination::common::PaginationRequest { page: 1, limit: 100 }),
            },
        )).await.ok()?.into_inner();
        let list: Vec<Value> = res.missions.iter().map(proto_mission_detail_to_json).collect();
        return Some(Value::Array(list));
    }

    // 10. Mission: Details / Retrieve / Load by id
    if let Some(id_str) = endpoint.strip_prefix("/mission/details/")
        .or_else(|| endpoint.strip_prefix("/mission/retrive-data/"))
        .or_else(|| endpoint.strip_prefix("/mission/load/"))
    {
        let mission_id = id_str.parse::<i64>().ok()?;
        let mut client = connect_mission_client(state).await?;
        let res = client.retrieve_mission_data(tonic::Request::new(
            proto_defination::mission::RetrieveMissionRequest { mission_id },
        )).await.ok()?.into_inner();
        let detail = res.mission.map(|m| proto_mission_detail_to_json(&m)).unwrap_or(Value::Null);
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": detail,
            "totalFodGroups": res.total_fod_groups,
            "totalFods": res.total_fods,
        }));
    }

    // 11. Mission: Stats
    if let Some(_id_str) = endpoint.strip_prefix("/mission/stats/") {
        let mut client = connect_mission_client(state).await?;
        let res = client.list_missions_with_stats(tonic::Request::new(
            proto_defination::mission::ListMissionsWithStatsRequest {},
        )).await.ok()?.into_inner();
        let list: Vec<Value> = res.stats.into_iter().map(|s| {
            json!({
                "mission": s.mission.map(|m| proto_mission_detail_to_json(&m)).unwrap_or(Value::Null),
                "totalFodGroups": s.total_fod_groups,
                "totalFods": s.total_fods,
                "clearedCount": s.cleared_count,
            })
        }).collect();
        return Some(Value::Array(list));
    }

    // 12. Mission: Update (e.g. /mission/123)
    if let Some(id_str) = endpoint.strip_prefix("/mission/") {
        if let Ok(mission_id) = id_str.parse::<i64>() {
            let mut client = connect_mission_client(state).await?;
            let req = proto_defination::mission::UpdateMissionRequest {
                mission_id,
                status: data.as_ref().and_then(|d| d.get("status").and_then(Value::as_str)).map(|s| {
                    match s {
                        "ACTIVE" => proto_defination::common::MissionStatus::Active as i32,
                        "INACTIVE" => proto_defination::common::MissionStatus::Inactive as i32,
                        "TERMINATED" => proto_defination::common::MissionStatus::Terminated as i32,
                        _ => 0,
                    }
                }),
                scan_status: data.as_ref().and_then(|d| d.get("scanStatus").and_then(Value::as_str)).map(|s| {
                    match s {
                        "PLAY" => proto_defination::common::MissionScanStatus::Play as i32,
                        "PAUSE" => proto_defination::common::MissionScanStatus::Pause as i32,
                        _ => 0,
                    }
                }),
                timer: data.as_ref().and_then(|d| d.get("timer").and_then(Value::as_i64)),
                speed: data.as_ref().and_then(|d| d.get("speed").and_then(Value::as_i64)).map(|v| v as i32),
                pass: data.as_ref().and_then(|d| d.get("pass").and_then(Value::as_i64)).map(|v| v as i32),
            };
            let res = client.update_mission(tonic::Request::new(req)).await.ok()?.into_inner();
            return Some(proto_mission_detail_to_json(&res));
        }
    }

    // 13. FOD Group: Group count (/api/fod-group/group-count/{id})
    if let Some(id_str) = endpoint.strip_prefix("/api/fod-group/group-count/") {
        let mission_id = id_str.parse::<i64>().ok()?;
        let mut client = connect_fod_group_client(state).await?;
        let res = client.get_group_count(tonic::Request::new(
            proto_defination::fod_group::GroupCountRequest { mission_id },
        )).await.ok()?.into_inner();
        return Some(json!({
            "statusCode": 200,
            "status": 200,
            "data": res.count,
        }));
    }

    // 14. FOD Group: Sync groups or all groups
    if endpoint == "/api/fod-group/sync/groups" || endpoint.starts_with("/api/fod-group/all/") {
        let mission_id = data.as_ref()
            .and_then(|d| d.get("missionId").and_then(Value::as_i64))
            .or_else(|| endpoint.strip_prefix("/api/fod-group/all/").and_then(|s| s.parse::<i64>().ok()))
            .unwrap_or(1);
        let mut client = connect_fod_group_client(state).await?;
        let mut all_groups = Vec::new();
        let mut page = 1;
        loop {
            let res = match client.list_groups(tonic::Request::new(
                proto_defination::fod_group::ListGroupsRequest {
                    mission_id,
                    pagination: Some(proto_defination::common::PaginationRequest { page, limit: 200 }),
                },
            )).await {
                Ok(r) => r.into_inner(),
                Err(e) => {
                    tracing::warn!("list_groups page {page} failed: {e}");
                    break;
                }
            };

            let total_pages = res.pagination.as_ref().map(|p| p.total_pages).unwrap_or(1);
            let len = res.groups.len();
            for g in res.groups {
                all_groups.push(proto_fod_group_to_json(&g));
            }
            if page >= total_pages || len == 0 || page >= 200 {
                break;
            }
            page += 1;
        }
        return Some(json!({
            "fodGroups": all_groups,
            "statusCode": 200,
            "status": 200,
        }));
    }

    // 15. FOD Group: Single update (/api/fod-group/update/{groupId})
    if let Some(gid_str) = endpoint.strip_prefix("/api/fod-group/update/") {
        let group_id = gid_str.parse::<i64>().ok()?;
        let mission_id = data.as_ref().and_then(|d| d.get("missionId").and_then(Value::as_i64)).unwrap_or(1);
        let status = data.as_ref().and_then(|d| d.get("status").and_then(Value::as_str)).unwrap_or("NEW");
        let mut client = connect_fod_group_client(state).await?;
        let resolutions = vec![proto_defination::fod_group::GroupResolution {
            command_id: uuid::Uuid::new_v4().to_string(),
            mission_id,
            group_id,
            desired_status: proto_group_status_from_str(status),
            base_version: 0,
            base_version_vector: Default::default(),
            decided_at_ms: chrono::Utc::now().timestamp_millis(),
            origin_node: "desktop".to_string(),
        }];
        let _ = client.resolve_groups(tonic::Request::new(
            proto_defination::fod_group::ResolveGroupsRequest { resolutions },
        )).await.ok()?;
        return Some(json!({
            "status": 200,
            "statusCode": 200,
            "message": "Updated",
        }));
    }

    // 16. FOD Group: Batch Resolve (/api/fod-group/resolve)
    if endpoint == "/api/fod-group/resolve" {
        let mut resolutions = Vec::new();
        if let Some(Value::Array(arr)) = &data {
            for item in arr {
                let gid = item.get("groupId").and_then(Value::as_i64).unwrap_or(0);
                let mid = item.get("missionId").and_then(Value::as_i64).unwrap_or(0);
                let st = item.get("status").and_then(Value::as_str).unwrap_or("NEW");
                let base_version = item.get("version").and_then(Value::as_i64).unwrap_or(0);
                resolutions.push(proto_defination::fod_group::GroupResolution {
                    command_id: uuid::Uuid::new_v4().to_string(),
                    mission_id: mid,
                    group_id: gid,
                    desired_status: proto_group_status_from_str(st),
                    base_version,
                    base_version_vector: Default::default(),
                    decided_at_ms: chrono::Utc::now().timestamp_millis(),
                    origin_node: "desktop".to_string(),
                });
            }
        }
        let mut client = connect_fod_group_client(state).await?;
        let res = client.resolve_groups(tonic::Request::new(
            proto_defination::fod_group::ResolveGroupsRequest { resolutions },
        )).await.ok()?.into_inner();
        let resolved_list: Vec<Value> = res.results.into_iter().filter_map(|r| {
            r.group.map(|g| proto_fod_group_to_json(&g))
        }).collect();
        return Some(Value::Array(resolved_list));
    }

    // 17. FOD: Mission group FODs (/api/fod/mission-group)
    if endpoint == "/api/fod/mission-group" {
        let group_id = data.as_ref()
            .and_then(|d| d.get("groupId"))
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(0);
        let mission_id = data.as_ref()
            .and_then(|d| d.get("missionId"))
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
            .unwrap_or(1);
        let excluded_ids: Vec<String> = data.as_ref()
            .and_then(|d| d.get("excludedIds").and_then(Value::as_array))
            .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_string())).collect())
            .unwrap_or_default();
        let mut client = connect_fod_client(state).await?;
        let res = client.get_fods_by_group(tonic::Request::new(
            proto_defination::fod::GetFodsByGroupRequest {
                mission_id,
                group_id,
                excluded_ids,
            },
        )).await.ok()?.into_inner();
        let list: Vec<Value> = res.fods.iter().map(proto_fod_entity_to_json).collect();
        return Some(Value::Array(list));
    }

    None
}

pub async fn fetch_biggest_fods_for_mission(
    state: &AppState,
    mission_id: i64,
) -> Vec<proto_defination::fod::FodEntity> {
    let mut client = match connect_fod_client(state).await {
        Some(c) => c,
        None => return Vec::new(),
    };
    let Ok(res) = client.get_biggest_fod_per_group(tonic::Request::new(
        proto_defination::fod::GetBiggestFodRequest { mission_id },
    )).await else {
        return Vec::new();
    };
    res.into_inner().fods
}

pub async fn fetch_fod_from_car(
    state: &AppState,
    fod_id: &str,
) -> Option<proto_defination::fod::FodEntity> {
    let mut client = connect_fod_client(state).await?;
    let res = client.get_fod(tonic::Request::new(
        proto_defination::fod::GetFodRequest {
            id: fod_id.to_string(),
        }
    )).await.ok()?;
    Some(res.into_inner())
}

async fn connect_user_client(url: &str) -> Option<proto_defination::user::user_service_client::UserServiceClient<tonic::transport::Channel>> {
    let endpoint = tonic::transport::Endpoint::from_shared(url.to_string()).ok()?;
    let ch = endpoint
        .connect_timeout(Duration::from_millis(1500))
        .timeout(Duration::from_secs(5))
        .connect()
        .await
        .ok()?;
    Some(proto_defination::user::user_service_client::UserServiceClient::new(ch))
}

pub async fn push_user_to_upstream(state: &AppState, user: &crate::models::User) -> bool {
    let role = match user.role {
        crate::models::Role::Admin => proto_defination::user::UserRole::Admin as i32,
        crate::models::Role::Collector => proto_defination::user::UserRole::Collector as i32,
        crate::models::Role::Guest => proto_defination::user::UserRole::Guest as i32,
        crate::models::Role::Driver => proto_defination::user::UserRole::Driver as i32,
    };
    let entity = proto_defination::user::UserEntity {
        id: user.id.clone(),
        username: user.username.clone(),
        first_name: user.first_name.clone(),
        last_name: user.last_name.clone(),
        password_hash: user.password.clone(),
        is_active: user.is_active,
        role,
        created_at_ms: user.created_at.and_utc().timestamp_millis(),
        updated_at_ms: user.updated_at.and_utc().timestamp_millis(),
    };

    let urls = [
        state.cfg.car_backend_url.clone(),
        state.cfg.atc_backend_url.clone(),
    ];

    for url in urls {
        if let Some(mut client) = connect_user_client(&url).await {
            match client.upsert_user(tonic::Request::new(entity.clone())).await {
                Ok(res) => {
                    if res.into_inner().success {
                        tracing::info!("User '{}' pushed successfully to upstream at {}", user.username, url);
                        return true;
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed upsert_user on upstream {url}: {e}");
                }
            }
        } else {
            tracing::debug!("Could not connect to {url} for user sync");
        }
    }
    false
}

pub async fn delete_user_from_upstream(state: &AppState, username: &str) -> bool {
    let urls = [
        state.cfg.car_backend_url.clone(),
        state.cfg.atc_backend_url.clone(),
    ];

    let mut any_success = false;
    for url in urls {
        if let Some(mut client) = connect_user_client(&url).await {
            match client.delete_user(tonic::Request::new(proto_defination::user::DeleteUserRequest {
                username: username.to_string(),
            })).await {
                Ok(res) => {
                    if res.into_inner().success {
                        tracing::info!("User '{}' deleted successfully from upstream at {}", username, url);
                        any_success = true;
                    }
                }
                Err(e) => {
                    tracing::warn!("Failed delete_user on upstream {url}: {e}");
                }
            }
        } else {
            tracing::debug!("Could not connect to {url} for user delete");
        }
    }
    any_success
}

#[derive(Debug, Default, Clone)]
pub struct PulledUsers {
    pub users: Vec<proto_defination::user::UserEntity>,
    pub deleted_usernames: Vec<String>,
    pub all_active_usernames: Option<Vec<String>>,
}

pub async fn pull_users_from_upstream(
    state: &AppState,
    since_ms: i64,
    full_reconcile: bool,
) -> PulledUsers {
    let urls = [
        state.cfg.car_backend_url.clone(),
        state.cfg.atc_backend_url.clone(),
    ];

    for url in urls {
        if let Some(mut client) = connect_user_client(&url).await {
            if full_reconcile || since_ms == 0 {
                if let Ok(res) = client.get_users(tonic::Request::new(proto_defination::user::GetUsersRequest {})).await {
                    let users = res.into_inner().users;
                    let all_active_usernames = Some(users.iter().map(|u| u.username.clone()).collect());
                    return PulledUsers {
                        users,
                        deleted_usernames: Vec::new(),
                        all_active_usernames,
                    };
                }
            } else {
                if let Ok(res) = client.sync_users(tonic::Request::new(proto_defination::user::SyncUsersRequest { since_ms })).await {
                    let inner = res.into_inner();
                    return PulledUsers {
                        users: inner.users,
                        deleted_usernames: inner.deleted_usernames,
                        all_active_usernames: None,
                    };
                }
            }
        }
    }
    PulledUsers::default()
}

pub async fn fetch_image_from_car(
    state: &AppState,
    sha256: &str,
    thumbnail: bool,
) -> Option<Vec<u8>> {
    let prefix = if sha256.len() >= 2 { &sha256[0..2] } else { "xx" };
    // Direct disk paths
    for base in [
        std::path::Path::new("../fod-backend/apps/car/data/frames"),
        std::path::Path::new("/home/zoid/workspace/fod-backend/apps/car/data/frames"),
    ] {
        let candidate = if thumbnail {
            base.join(prefix).join("thumb").join(format!("{sha256}.jpg"))
        } else {
            base.join(prefix).join(format!("{sha256}.jpg"))
        };
        if let Ok(bytes) = tokio::fs::read(&candidate).await {
            return Some(bytes);
        }
        // Fall back to full frame if thumbnail missing
        if thumbnail {
            let full_candidate = base.join(prefix).join(format!("{sha256}.jpg"));
            if let Ok(bytes) = tokio::fs::read(&full_candidate).await {
                return Some(bytes);
            }
        }
    }

    // gRPC download from Car backend
    let car_url = state.cfg.car_backend_url.clone();
    let mut client = proto_defination::image::image_service_client::ImageServiceClient::connect(car_url).await.ok()?;
    let stream_res = client.download_image(tonic::Request::new(
        proto_defination::image::ImageDownloadRequest {
            sha256: sha256.to_string(),
            thumbnail,
        }
    )).await.ok()?;

    let mut stream = stream_res.into_inner();
    let mut all_bytes = Vec::new();
    while let Ok(Some(chunk)) = stream.message().await {
        all_bytes.extend_from_slice(&chunk.data);
    }
    if !all_bytes.is_empty() {
        Some(all_bytes)
    } else {
        None
    }
}


/// Port of `apiToMain`: queries Car backend via gRPC when applicable,
/// with fallback to ATC backend and HTTP for non-gRPC endpoints.
pub async fn api_to_main(
    state: &AppState,
    method: reqwest::Method,
    endpoint: &str,
    data: Option<Value>,
    timeout_ms: Option<u64>,
) -> Option<Value> {
    if let Some(grpc_val) = call_car_grpc(state, endpoint, data.clone()).await {
        return Some(grpc_val);
    }

    let urls = [
        crate::upstream::car_url(state, endpoint),
        crate::upstream::atc_url(state, endpoint),
    ];

    for url in urls {
        let mut req = state
            .http
            .request(method.clone(), &url)
            .timeout(Duration::from_millis(timeout_ms.unwrap_or(2_000)));
        if let Some(ref body) = data {
            req = req.json(body);
        }
        if let Ok(resp) = req.send().await {
            let status = resp.status();
            if status.is_success() {
                let text = resp.text().await.unwrap_or_default();
                return Some(serde_json::from_str::<Value>(&text).unwrap_or(Value::String(text)));
            }
        }
    }

    tracing::warn!("Upstream server failed, falling back to local handlers: {endpoint}");
    None
}

// ---------------------------------------------------------------------------
// Dynamic INSERT helper (Prisma "undefined field ⇒ column omitted ⇒ DB
// default" semantics need per-payload column lists)
// ---------------------------------------------------------------------------

pub(crate) enum Bind {
    I32(i32),
    OptI32(Option<i32>),
    I64(i64),
    OptI64(Option<i64>),
    F64(f64),
    OptF64(Option<f64>),
    Str(String),
    OptStr(Option<String>),
    Dt(NaiveDateTime),
    OptDt(Option<NaiveDateTime>),
    OptBool(Option<bool>),
    Json(Value),
    StrArr(Vec<String>),
    /// text bind cast to a Postgres enum type: (value, "\"EnumType\"")
    Enum(String, &'static str),
}

pub(crate) fn push_bind_val(qb: &mut QueryBuilder<Postgres>, v: &Bind) {
    match v {
        Bind::I32(x) => {
            qb.push_bind(*x);
        }
        Bind::OptI32(x) => {
            qb.push_bind(*x);
        }
        Bind::I64(x) => {
            qb.push_bind(*x);
        }
        Bind::OptI64(x) => {
            qb.push_bind(*x);
        }
        Bind::F64(x) => {
            qb.push_bind(*x);
        }
        Bind::OptF64(x) => {
            qb.push_bind(*x);
        }
        Bind::Str(x) => {
            qb.push_bind(x.clone());
        }
        Bind::OptStr(x) => {
            qb.push_bind(x.clone());
        }
        Bind::Dt(x) => {
            qb.push_bind(*x);
        }
        Bind::OptDt(x) => {
            qb.push_bind(*x);
        }
        Bind::OptBool(x) => {
            qb.push_bind(*x);
        }
        Bind::Json(x) => {
            qb.push_bind(x.clone());
        }
        Bind::StrArr(x) => {
            qb.push_bind(x.clone());
        }
        Bind::Enum(x, ty) => {
            qb.push_bind(x.clone());
            qb.push("::");
            qb.push(*ty);
        }
    }
}

/// `INSERT INTO "<table>" ("c1",...) VALUES ($1,...)` from (column, bind)
/// pairs; caller appends ON CONFLICT / RETURNING.
pub(crate) fn insert_builder(table: &str, cols: &[(&str, Bind)]) -> QueryBuilder<Postgres> {
    let mut qb: QueryBuilder<Postgres> = QueryBuilder::new(format!("INSERT INTO \"{table}\" ("));
    for (i, (name, _)) in cols.iter().enumerate() {
        if i > 0 {
            qb.push(", ");
        }
        qb.push(format!("\"{name}\""));
    }
    qb.push(") VALUES (");
    for (i, (_, val)) in cols.iter().enumerate() {
        if i > 0 {
            qb.push(", ");
        }
        push_bind_val(&mut qb, val);
    }
    qb.push(")");
    qb
}

fn get_enum(
    data: &Value,
    key: &str,
    allowed: &[&str],
    ty: &'static str,
) -> anyhow::Result<Option<Bind>> {
    match data.get(key) {
        None => Ok(None),
        Some(Value::String(s)) if allowed.contains(&s.as_str()) => {
            Ok(Some(Bind::Enum(s.clone(), ty)))
        }
        Some(other) => anyhow::bail!("Invalid value for enum field {key}: {other}"),
    }
}

fn get_req_i32(data: &Value, key: &str) -> anyhow::Result<i32> {
    data.get(key)
        .and_then(json_i32)
        .ok_or_else(|| anyhow::anyhow!("Argument {key}: missing or not a 32-bit integer"))
}

fn get_req_i64(data: &Value, key: &str) -> anyhow::Result<i64> {
    data.get(key)
        .and_then(json_integer)
        .ok_or_else(|| anyhow::anyhow!("Argument {key}: missing or not an integer"))
}

fn get_opt_str(data: &Value, key: &str) -> Option<Bind> {
    match data.get(key) {
        None => None,
        Some(Value::Null) => Some(Bind::OptStr(None)),
        Some(Value::String(s)) => Some(Bind::OptStr(Some(s.clone()))),
        // Prisma would reject a non-string here; treat like absent-but-log.
        Some(_) => None,
    }
}

fn get_req_date(data: &Value, key: &str) -> anyhow::Result<NaiveDateTime> {
    data.get(key)
        .and_then(parse_js_date)
        .ok_or_else(|| anyhow::anyhow!("Argument {key}: missing or invalid DateTime"))
}

// ---------------------------------------------------------------------------
// missionService (src/services/mission.ts)
// ---------------------------------------------------------------------------

/// Shared body of `prisma.mission.upsert` as used by upsertMissionData and
/// activateMission: create {...mission}, update { status, scanStatus } (+
/// client-side updatedAt). Unknown payload keys are ignored (PARITY: Prisma
/// would throw a validation error on unknown keys; live payloads never carry
/// any).
async fn upsert_mission_row<'e, E>(ex: E, mission: &Value, now: NaiveDateTime) -> anyhow::Result<()>
where
    E: sqlx::PgExecutor<'e>,
{
    let id = get_req_i64(mission, "id")?;
    let mut cols: Vec<(&str, Bind)> = vec![("id", Bind::I64(id))];
    if let Some(b) = get_enum(mission, "status", MISSION_STATUS, "\"MissionStatus\"")? {
        cols.push(("status", b));
    }
    if let Some(v) = mission.get("timer") {
        let t = v
            .as_f64()
            .ok_or_else(|| anyhow::anyhow!("Argument timer: not a number"))?;
        cols.push(("timer", Bind::F64(t)));
    }
    if let Some(b) = get_enum(mission, "scanStatus", MISSION_SCAN_STATUS, "\"MissionScanStatus\"")? {
        cols.push(("scanStatus", b));
    }
    for key in ["pass", "speed"] {
        match mission.get(key) {
            None => {}
            Some(Value::Null) => cols.push((key, Bind::OptI32(None))),
            Some(v) => cols.push((
                key,
                Bind::OptI32(Some(json_i32(v).ok_or_else(|| {
                    anyhow::anyhow!("Argument {key}: not an Int")
                })?)),
            )),
        }
    }
    cols.push(("createdAt", Bind::Dt(get_req_date(mission, "createdAt")?)));
    // create {...mission}: updatedAt from payload if present, else Prisma now()
    let updated_at = mission
        .get("updatedAt")
        .and_then(parse_js_date)
        .unwrap_or(now);
    cols.push(("updatedAt", Bind::Dt(updated_at)));
    if let Some(b) = get_opt_str(mission, "createdBy") {
        cols.push(("createdBy", b));
    }
    if let Some(b) = get_opt_str(mission, "updatedBy") {
        cols.push(("updatedBy", b));
    }
    match mission.get("dirty") {
        None => {}
        Some(Value::Null) => cols.push(("dirty", Bind::OptBool(None))),
        Some(Value::Bool(b)) => cols.push(("dirty", Bind::OptBool(Some(*b)))),
        Some(other) => anyhow::bail!("Argument dirty: not a Boolean ({other})"),
    }
    match mission.get("previousTime") {
        None => {} // column omitted → DB default CURRENT_TIMESTAMP (as Prisma)
        Some(Value::Null) => cols.push(("previousTime", Bind::OptDt(None))),
        Some(v) => cols.push((
            "previousTime",
            Bind::OptDt(Some(parse_js_date(v).ok_or_else(|| {
                anyhow::anyhow!("Argument previousTime: invalid DateTime")
            })?)),
        )),
    }

    let mut qb = insert_builder("Mission", &cols);
    qb.push(" ON CONFLICT (\"id\") DO UPDATE SET ");
    // update { status: mission.status, scanStatus: mission.scanStatus } —
    // undefined fields are skipped by Prisma.
    let mut first = true;
    if let Some(b) = get_enum(mission, "status", MISSION_STATUS, "\"MissionStatus\"")? {
        qb.push("\"status\" = ");
        push_bind_val(&mut qb, &b);
        first = false;
    }
    if let Some(b) = get_enum(mission, "scanStatus", MISSION_SCAN_STATUS, "\"MissionScanStatus\"")? {
        if !first {
            qb.push(", ");
        }
        qb.push("\"scanStatus\" = ");
        push_bind_val(&mut qb, &b);
        first = false;
    }
    if !first {
        qb.push(", ");
    }
    qb.push("\"updatedAt\" = ");
    qb.push_bind(now);
    qb.build().execute(ex).await?;
    Ok(())
}

/// Port of missionService.upsertMissionData (src/services/mission.ts).
/// Called by the Kafka `update` topic handler for messages with type=="mission".
pub async fn upsert_mission_data(state: &AppState, data: Value) -> anyhow::Result<()> {
    tracing::info!("upserting mission data {data}");
    // `if(!missionId)` — falsy id (missing/null/0) → skip silently.
    let falsy_id = !data.get("id").map(js_truthy).unwrap_or(false);
    if falsy_id {
        tracing::info!("Mission not updated by hook cause missed missionId");
        return Ok(());
    }
    upsert_mission_row(&state.db, &data, now_naive()).await
}

/// Port of missionService.activateMission — used by POST /api/mission/load/new.
pub async fn activate_mission(state: &AppState, mission: &Value) -> anyhow::Result<()> {
    let now = now_naive();
    let mut tx = state.db.begin().await?;
    sqlx::query(
        "UPDATE \"Mission\" SET \"status\" = 'INACTIVE', \"scanStatus\" = 'PAUSE', \"updatedAt\" = $1 WHERE \"status\" = 'ACTIVE'",
    )
    .bind(now)
    .execute(&mut *tx)
    .await?;
    upsert_mission_row(&mut *tx, mission, now).await?;
    tx.commit().await?;
    Ok(())
}

// ---------------------------------------------------------------------------
// fod-group service (src/services/fod-group.ts)
// ---------------------------------------------------------------------------

/// Port of upsertGroupData (src/services/fod-group.ts).
/// Called by the Kafka `update` topic handler for messages with type=="fodGroup"
/// (the caller also re-emits the data on /gui as an "update" event).
pub async fn upsert_group_data(state: &AppState, data: Value) -> anyhow::Result<()> {
    // Node drops a payload `id` and lets Prisma generate one on create.
    let group_id = get_req_i32(&data, "groupId")?;
    let mission_id = get_req_i64(&data, "missionId")?;

    let mut cols: Vec<(&str, Bind)> = vec![
        ("id", Bind::Str(uuid::Uuid::new_v4().to_string())),
        ("groupId", Bind::I32(group_id)),
        ("missionId", Bind::I64(mission_id)),
    ];
    let status = get_enum(&data, "status", FOD_GROUP_STATUS, "\"FodGroupStatus\"")?;
    if let Some(Bind::Enum(s, ty)) = &status {
        cols.push(("status", Bind::Enum(s.clone(), ty)));
    }
    if let Some(b) = get_opt_str(&data, "biggestFodId") {
        cols.push(("biggestFodId", b));
    }
    match data.get("biggestFodSize") {
        None => {}
        Some(Value::Null) => cols.push(("biggestFodSize", Bind::OptI32(None))),
        Some(v) => cols.push((
            "biggestFodSize",
            Bind::OptI32(Some(json_i32(v).ok_or_else(|| {
                anyhow::anyhow!("Argument biggestFodSize: not an Int")
            })?)),
        )),
    }
    match data.get("dirty") {
        None => {}
        Some(Value::Null) => cols.push(("dirty", Bind::OptBool(None))),
        Some(Value::Bool(b)) => cols.push(("dirty", Bind::OptBool(Some(*b)))),
        Some(other) => anyhow::bail!("Argument dirty: not a Boolean ({other})"),
    }
    let now = now_naive();
    cols.push(("createdAt", Bind::Dt(get_req_date(&data, "createdAt")?)));
    let updated_at = data.get("updatedAt").and_then(parse_js_date).unwrap_or(now);
    cols.push(("updatedAt", Bind::Dt(updated_at)));

    let mut qb = insert_builder("FodGroup", &cols);
    qb.push(" ON CONFLICT (\"groupId\", \"missionId\") DO UPDATE SET ");
    // update { status: fodGroup.status, dirty: false } — status skipped when
    // absent from the payload (Prisma undefined semantics).
    if let Some(b) = status {
        qb.push("\"status\" = ");
        push_bind_val(&mut qb, &b);
        qb.push(", ");
    }
    qb.push("\"dirty\" = false, \"updatedAt\" = ");
    qb.push_bind(now);
    qb.build().execute(&state.db).await?;
    Ok(())
}

/// Port of updateFodGroup (src/services/fod-group.ts) for the one shape
/// createFod passes: { groupId, missionId, biggestFodId, biggestFodSize,
/// status }. Errors when the row does not exist (Prisma P2025).
async fn update_fod_group_biggest(
    state: &AppState,
    group_id: i32,
    mission_id: i64,
    biggest_fod_id: &str,
    biggest_fod_size: i32,
    status: &str,
) -> anyhow::Result<()> {
    let res = sqlx::query(
        "UPDATE \"FodGroup\" SET \"groupId\" = $1, \"missionId\" = $2, \"biggestFodId\" = $3, \"biggestFodSize\" = $4, \"status\" = $5::\"FodGroupStatus\", \"updatedAt\" = $6 WHERE \"groupId\" = $1 AND \"missionId\" = $2",
    )
    .bind(group_id)
    .bind(mission_id)
    .bind(biggest_fod_id)
    .bind(biggest_fod_size)
    .bind(status)
    .bind(now_naive())
    .execute(&state.db)
    .await?;
    if res.rows_affected() == 0 {
        anyhow::bail!("Record to update not found (FodGroup {group_id}/{mission_id})");
    }
    Ok(())
}

/// Port of upsertGroupBatch (src/services/fod-group.ts) — download NDJSON
/// `fodGroup` records: note the source field names (groupStatus, biggestFod).
pub async fn upsert_group_batch(
    state: &AppState,
    batch: Vec<Value>,
    mission_id: i64,
) -> anyhow::Result<()> {
    for g in batch {
        let group_id = get_req_i32(&g, "groupId")?;
        let now = now_naive();
        let mut cols: Vec<(&str, Bind)> = vec![
            ("id", Bind::Str(uuid::Uuid::new_v4().to_string())),
            ("missionId", Bind::I64(mission_id)),
            ("groupId", Bind::I32(group_id)),
        ];
        let status = get_enum(&g, "groupStatus", FOD_GROUP_STATUS, "\"FodGroupStatus\"")?;
        if let Some(Bind::Enum(s, ty)) = &status {
            cols.push(("status", Bind::Enum(s.clone(), ty)));
        }
        if let Some(b) = get_opt_str(&g, "biggestFod") {
            cols.push(("biggestFodId", b));
        }
        match g.get("biggestFodSize") {
            None => {}
            Some(Value::Null) => cols.push(("biggestFodSize", Bind::OptI32(None))),
            Some(v) => cols.push((
                "biggestFodSize",
                Bind::OptI32(Some(json_i32(v).ok_or_else(|| {
                    anyhow::anyhow!("Argument biggestFodSize: not an Int")
                })?)),
            )),
        }
        cols.push(("createdAt", Bind::Dt(get_req_date(&g, "createdAt")?)));
        cols.push(("updatedAt", Bind::Dt(now)));

        let mut qb = insert_builder("FodGroup", &cols);
        qb.push(" ON CONFLICT (\"groupId\", \"missionId\") DO UPDATE SET ");
        if let Some(b) = status {
            qb.push("\"status\" = ");
            push_bind_val(&mut qb, &b);
            qb.push(", ");
        }
        qb.push("\"updatedAt\" = ");
        qb.push_bind(now);
        qb.build().execute(&state.db).await?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// cleared-fod service (src/services/cleared-fod.ts)
// ---------------------------------------------------------------------------

/// Port of createClearedFodBatch: per record, upsert ClearedFod on
/// (groupId, missionId) then flip the FodGroup to dirty/CLEARED. Returns the
/// updated FodGroup rows (that is what the Node function resolves with, and
/// what POST /api/mission/clear-fod sends back).
pub async fn create_cleared_fod_batch(
    state: &AppState,
    batch: Vec<Value>,
    mission_id: i64,
) -> anyhow::Result<Vec<crate::models::FodGroup>> {
    let mut out = Vec::with_capacity(batch.len());
    for fod in batch {
        let group_id = get_req_i32(&fod, "groupId")?;
        let row_mission_id = get_req_i64(&fod, "missionId").unwrap_or(mission_id);
        let now = now_naive();

        // create { ...fod, createdAt: new Date() }
        let mut cols: Vec<(&str, Bind)> = Vec::new();
        cols.push((
            "id",
            Bind::Str(match fod.get("id") {
                Some(Value::String(s)) => s.clone(),
                _ => uuid::Uuid::new_v4().to_string(),
            }),
        ));
        cols.push(("missionId", Bind::I64(row_mission_id)));
        cols.push(("groupId", Bind::I32(group_id)));
        match get_enum(&fod, "status", CLEARED_FOD_STATUS, "\"ClearedFodStatus\"")? {
            Some(b) => cols.push(("status", b)),
            None => anyhow::bail!("Argument status is missing"),
        }
        for key in ["beforeClearImg", "afterClearImg"] {
            if let Some(v) = fod.get(key) {
                let arr = v
                    .as_array()
                    .ok_or_else(|| anyhow::anyhow!("Argument {key}: not a list"))?
                    .iter()
                    .map(|x| {
                        x.as_str()
                            .map(|s| s.to_string())
                            .ok_or_else(|| anyhow::anyhow!("Argument {key}: non-string entry"))
                    })
                    .collect::<anyhow::Result<Vec<String>>>()?;
                cols.push((key, Bind::StrArr(arr)));
            }
        }
        let location = fod
            .get("location")
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("Argument location is missing"))?;
        cols.push(("location", Bind::Json(location)));
        cols.push(("createdAt", Bind::Dt(now)));
        cols.push(("updatedAt", Bind::Dt(now)));
        if let Some(b) = get_opt_str(&fod, "createdBy") {
            cols.push(("createdBy", b));
        }
        if let Some(b) = get_opt_str(&fod, "updatedBy") {
            cols.push(("updatedBy", b));
        }
        match fod.get("dirty") {
            None => {}
            Some(Value::Null) => cols.push(("dirty", Bind::OptBool(None))),
            Some(Value::Bool(b)) => cols.push(("dirty", Bind::OptBool(Some(*b)))),
            Some(other) => anyhow::bail!("Argument dirty: not a Boolean ({other})"),
        }

        let mut qb = insert_builder("ClearedFod", &cols);
        // Prisma upsert with `update: {}` still bumps @updatedAt on an
        // existing row.
        qb.push(" ON CONFLICT (\"groupId\", \"missionId\") DO UPDATE SET \"updatedAt\" = ");
        qb.push_bind(now);
        qb.build().execute(&state.db).await?;

        // Then FodGroup → dirty + CLEARED (upsert to ensure row exists)
        let group: Option<crate::models::FodGroup> = sqlx::query_as(
            r#"INSERT INTO "FodGroup" ("id", "groupId", "missionId", "dirty", "status", "createdAt", "updatedAt")
               VALUES ($1, $2, $3, true, 'CLEARED', $4, $4)
               ON CONFLICT ("groupId", "missionId") DO UPDATE SET "dirty" = true, "status" = 'CLEARED', "updatedAt" = $4
               RETURNING *"#,
        )
        .bind(uuid::Uuid::new_v4().to_string())
        .bind(group_id)
        .bind(row_mission_id)
        .bind(now)
        .fetch_optional(&state.db)
        .await?;
        match group {
            Some(g) => out.push(g),
            None => anyhow::bail!("Record to update not found (FodGroup {group_id}/{row_mission_id})"),
        }
    }
    Ok(out)
}

// ---------------------------------------------------------------------------
// fod service (src/services/fod.ts)
// ---------------------------------------------------------------------------

/// Port of handleFodFromSocket (src/services/fod.ts).
/// Called by realtime::backend_link for every `fod` event from car-backend's
/// /client namespace (the caller also re-emits the payload on /gui as "fod").
/// Like the Node function, this never propagates errors — createFod catches
/// and logs everything (with one retry on connection exhaustion).
pub async fn handle_fod_from_socket(state: &AppState, payload: Value) -> anyhow::Result<()> {
    create_fod(state, payload).await;
    Ok(())
}

/// Port of createFodBatch. NOTE (parity): the Node version ignores its
/// missionId argument — each fod carries its own missionId.
pub async fn create_fod_batch(state: &AppState, batch: Vec<Value>, _mission_id: i64) {
    for fod in batch {
        create_fod(state, fod).await;
    }
}

/// Port of createFod — errors are logged, never returned, with a single
/// retry when Postgres reports connection exhaustion (parity with the
/// 'Too many database connections opened' check).
pub async fn create_fod(state: &AppState, fod: Value) {
    if let Err(e) = create_fod_inner(state, &fod).await {
        tracing::error!("Error in handleFodFromSocket: {e} fod.id={}", js_seg(fod.get("id")));
        if e.to_string().contains("Too many database connections opened") {
            tracing::info!("Too many request");
            if let Err(e2) = create_fod_inner(state, &fod).await {
                tracing::error!("Error in handleFodFromSocket (retry): {e2}");
            }
        }
    }
}

async fn create_fod_inner(state: &AppState, fod: &Value) -> anyhow::Result<()> {
    if !js_truthy(fod) {
        tracing::warn!("Ignoring invalid/empty FOD payload");
        return Ok(());
    }

    // Image first if frame is present
    if let Some(frame) = fod.get("frame").filter(|v| js_truthy(v)) {
        if let Some(bytes) = frame_to_bytes(frame) {
            let _ = crate::imagewriter::write_fod_jpeg(
                &js_seg(fod.get("missionId")),
                &js_seg(fod.get("groupId")),
                &js_seg(fod.get("id")),
                &bytes,
            )
            .await;
        }
    }

    let group_id = get_req_i32(fod, "groupId")?;
    let mission_id = get_req_i64(fod, "missionId")?;
    let id = match fod.get("id") {
        Some(Value::String(s)) => s.clone(),
        other => anyhow::bail!("Argument id: expected String, got {other:?}"),
    };
    let timestamp = get_req_date(fod, "timestamp")?;
    let size = fod
        .get("size")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| anyhow::anyhow!("Argument size: missing or not a number"))?;
    let velocity = fod
        .get("velocity")
        .and_then(|v| v.as_f64())
        .ok_or_else(|| anyhow::anyhow!("Argument velocity: missing or not a number"))?;
    let location = fod
        .get("location")
        .cloned()
        .ok_or_else(|| anyhow::anyhow!("Argument location is missing"))?;
    let status = match fod.get("status") {
        Some(v) if js_truthy(v) => v
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| anyhow::anyhow!("Argument status: not a string"))?,
        _ => "NEW".to_string(),
    };
    if !FOD_GROUP_STATUS.contains(&status.as_str()) {
        anyhow::bail!("Invalid value for enum field status: {status}");
    }

    let existing_group: Option<crate::models::FodGroup> = sqlx::query_as(
        "SELECT * FROM \"FodGroup\" WHERE \"groupId\" = $1 AND \"missionId\" = $2",
    )
    .bind(group_id)
    .bind(mission_id)
    .fetch_optional(&state.db)
    .await?;

    // Local shadow of the Node `fodGroup` variable used for the biggest-fod
    // comparison below.
    let group_biggest_size: Option<i32> = match &existing_group {
        Some(g) => g.biggest_fod_size,
        None => {
            let data = json!({
                "groupId": group_id,
                "missionId": mission_id,
                "createdAt": timestamp.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
                "biggestFodId": id,
                "biggestFodSize": size,
                "status": status,
            });
            upsert_group_data(state, data).await?;
            Some(
                json_i32(&json!(size))
                    .ok_or_else(|| anyhow::anyhow!("Argument biggestFodSize: not an Int"))?,
            )
        }
    };

    // prisma.fod.upsert by id.
    let now = now_naive();
    let sysid = get_opt_str(fod, "sysid");
    let class = get_opt_str(fod, "class");
    let confidence: Option<Bind> = match fod.get("confidence") {
        None => None,
        Some(Value::Null) => Some(Bind::OptF64(None)),
        Some(v) => Some(Bind::OptF64(Some(v.as_f64().ok_or_else(|| {
            anyhow::anyhow!("Argument confidence: not a number")
        })?))),
    };
    let mut cols: Vec<(&str, Bind)> = vec![
        ("id", Bind::Str(id.clone())),
        ("missionId", Bind::I64(mission_id)),
        ("groupId", Bind::I32(group_id)),
    ];
    if let Some(b) = sysid {
        cols.push(("sysid", b));
    }
    if let Some(b) = confidence {
        cols.push(("confidence", b));
    }
    if let Some(b) = class {
        cols.push(("class", b));
    }
    cols.push(("velocity", Bind::F64(velocity)));
    cols.push(("size", Bind::F64(size)));
    cols.push(("location", Bind::Json(location)));
    cols.push(("timestamp", Bind::Dt(timestamp)));
    cols.push(("createdAt", Bind::Dt(timestamp)));
    cols.push(("updatedAt", Bind::Dt(now)));

    let update_cols: Vec<&str> = cols
        .iter()
        .map(|(n, _)| *n)
        .filter(|n| *n != "id" && *n != "createdAt")
        .collect();
    let mut qb = insert_builder("Fod", &cols);
    qb.push(" ON CONFLICT (\"id\") DO UPDATE SET ");
    for (i, name) in update_cols.iter().enumerate() {
        if i > 0 {
            qb.push(", ");
        }
        qb.push(format!("\"{name}\" = EXCLUDED.\"{name}\""));
    }
    qb.push(" RETURNING \"id\"");
    let created_id: Option<(String,)> = qb.build_query_as().fetch_optional(&state.db).await?;

    if created_id.is_some() {
        let needs_update = match group_biggest_size {
            None => true,
            Some(b) => (b as f64) < size,
        };
        if needs_update {
            let biggest = json_i32(&json!(size))
                .ok_or_else(|| anyhow::anyhow!("Argument biggestFodSize: not an Int"))?;
            update_fod_group_biggest(state, group_id, mission_id, &id, biggest, &status).await?;
        }
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Misc shared with routes
// ---------------------------------------------------------------------------

/// Port of setMission (src/services/fod.ts). PARITY: the Node module-level
/// `mission` variable is write-only — nothing ever reads it — so this is a
/// deliberate no-op beyond the log line.
pub fn set_mission(payload: &Value) {
    tracing::info!("starting mission {payload}");
}

/// Serialize a typed row into a JSON object (helper for handlers that merge
/// DB rows with loose upstream payloads).
pub fn to_value<T: serde::Serialize>(row: &T) -> Value {
    serde_json::to_value(row).unwrap_or(Value::Null)
}

/// Build an object from key/value pairs preserving insertion order.
pub fn obj(pairs: Vec<(&str, Value)>) -> Value {
    let mut m = Map::new();
    for (k, v) in pairs {
        m.insert(k.to_string(), v);
    }
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    //! R1 smoke test for the socket-ingestion path (handle_fod_from_socket →
    //! createFod port) against the live dev database. Throwaway ids
    //! (mission 999998 / group 434343), cleans up after itself; images go to
    //! a temp dir (test chdirs before the writer runs — keep this test alone
    //! in the binary or serialize tests that depend on cwd).
    //! Run: cargo test create_fod_from_socket_flow

    use super::*;
    use crate::state::AppState;

    async fn cleanup(db: &sqlx::PgPool, mission_id: i32) {
        for sql in [
            "DELETE FROM \"Fod\" WHERE \"missionId\" = $1",
            "DELETE FROM \"FodGroup\" WHERE \"missionId\" = $1",
            "DELETE FROM \"ClearedFod\" WHERE \"missionId\" = $1",
            "DELETE FROM \"Mission\" WHERE \"id\" = $1",
        ] {
            sqlx::query(sql).bind(mission_id).execute(db).await.unwrap();
        }
    }

    #[tokio::test]
    async fn create_fod_from_socket_flow() {
        let tmp = std::env::temp_dir().join(format!("r1-svc-smoke-{}", std::process::id()));
        std::fs::create_dir_all(&tmp).unwrap();
        std::env::set_current_dir(&tmp).unwrap();

        let db = sqlx::postgres::PgPoolOptions::new()
            .max_connections(2)
            .connect("postgresql://postgres:1234@localhost:5432/zoid_client")
            .await
            .expect("dev database must be up");
        let mission_id = 999998i32;
        let group_id = 434343i32;
        cleanup(&db, mission_id).await;
        sqlx::query(
            "INSERT INTO \"Mission\" (\"id\",\"status\",\"timer\",\"scanStatus\",\"createdAt\",\"updatedAt\") \
             VALUES ($1,'INACTIVE',0,'PAUSE',now() at time zone 'utc',now() at time zone 'utc')",
        )
        .bind(mission_id)
        .execute(&db)
        .await
        .unwrap();

        let cfg = std::sync::Arc::new(crate::config::Config::load());
        let state = AppState::new(cfg, db.clone());

        // First fod: no group yet → group created with biggestFod = this fod.
        let base64_frame = "/9j/4AAfakejpegdata"; // string frame → file bytes are the utf8 text (Node parity)
        let f1 = json!({
            "id": "r1-smoke-fod-1", "frame": base64_frame,
            "groupId": group_id, "missionId": mission_id,
            "timestamp": 1754993000000i64, "size": 10.0, "velocity": 1.5,
            "location": {"lat": 1.0, "lon": 2.0},
            "sysid": "lucid08", "confidence": 0.9, "class": "Organic"
        });
        handle_fod_from_socket(&state, f1).await.unwrap();

        let (status, biggest_id, biggest_size): (String, Option<String>, Option<i32>) =
            sqlx::query_as(
                "SELECT \"status\"::text, \"biggestFodId\", \"biggestFodSize\" FROM \"FodGroup\" WHERE \"groupId\" = $1 AND \"missionId\" = $2",
            )
            .bind(group_id)
            .bind(mission_id)
            .fetch_one(&db)
            .await
            .expect("group row created");
        assert_eq!(status, "NEW");
        assert_eq!(biggest_id.as_deref(), Some("r1-smoke-fod-1"));
        assert_eq!(biggest_size, Some(10));

        // Image written with the Node double-encode semantics: file content ==
        // utf8 bytes of the base64 string.
        let img = tmp
            .join("fod-images/mission")
            .join(mission_id.to_string())
            .join(group_id.to_string())
            .join("r1-smoke-fod-1.jpg");
        assert_eq!(std::fs::read(&img).unwrap(), base64_frame.as_bytes());

        // Bigger fod in the same group → biggestFod switches.
        let f2 = json!({
            "id": "r1-smoke-fod-2", "frame": base64_frame,
            "groupId": group_id, "missionId": mission_id,
            "timestamp": "2026-08-12T10:00:00.000Z", "size": 25.0,
            "velocity": 1.5, "location": {"lat": 1.0}
        });
        handle_fod_from_socket(&state, f2).await.unwrap();
        let (biggest_id2, biggest_size2): (Option<String>, Option<i32>) = sqlx::query_as(
            "SELECT \"biggestFodId\", \"biggestFodSize\" FROM \"FodGroup\" WHERE \"groupId\" = $1 AND \"missionId\" = $2",
        )
        .bind(group_id)
        .bind(mission_id)
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(biggest_id2.as_deref(), Some("r1-smoke-fod-2"));
        assert_eq!(biggest_size2, Some(25));

        // Re-send fod-1 → upsert, no duplicate row.
        let f1_again = json!({
            "id": "r1-smoke-fod-1", "frame": base64_frame,
            "groupId": group_id, "missionId": mission_id,
            "timestamp": 1754993000000i64, "size": 10.0, "velocity": 2.0,
            "location": {"lat": 1.0}
        });
        handle_fod_from_socket(&state, f1_again).await.unwrap();
        let fods: i64 = sqlx::query_scalar("SELECT count(*) FROM \"Fod\" WHERE \"missionId\" = $1")
            .bind(mission_id)
            .fetch_one(&db)
            .await
            .unwrap();
        assert_eq!(fods, 2);

        // Invalid payload (no frame) → swallowed.
        handle_fod_from_socket(&state, json!({"id": "x"})).await.unwrap();

        // upsert_mission_data: falsy id → no-op; real id → status update.
        upsert_mission_data(&state, json!({"status": "ACTIVE"})).await.unwrap();
        upsert_mission_data(
            &state,
            json!({"id": mission_id, "status": "TERMINATED", "scanStatus": "PAUSE",
                   "createdAt": "2026-08-12T09:00:00.000Z"}),
        )
        .await
        .unwrap();
        let mstatus: String =
            sqlx::query_scalar("SELECT \"status\"::text FROM \"Mission\" WHERE \"id\" = $1")
                .bind(mission_id)
                .fetch_one(&db)
                .await
                .unwrap();
        assert_eq!(mstatus, "TERMINATED");

        // upsert_group_data update path: status change + dirty reset to false.
        upsert_group_data(
            &state,
            json!({"id": "ignored", "groupId": group_id, "missionId": mission_id,
                   "status": "ACCEPTED", "createdAt": "2026-08-12T09:00:00.000Z"}),
        )
        .await
        .unwrap();
        let (gstatus, dirty): (String, Option<bool>) = sqlx::query_as(
            "SELECT \"status\"::text, \"dirty\" FROM \"FodGroup\" WHERE \"groupId\" = $1 AND \"missionId\" = $2",
        )
        .bind(group_id)
        .bind(mission_id)
        .fetch_one(&db)
        .await
        .unwrap();
        assert_eq!(gstatus, "ACCEPTED");
        assert_eq!(dirty, Some(false));

        cleanup(&db, mission_id).await;
        std::fs::remove_dir_all(&tmp).ok();
    }
}
