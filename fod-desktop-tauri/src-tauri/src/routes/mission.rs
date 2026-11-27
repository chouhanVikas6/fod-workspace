//! Mission routes — OWNED BY AGENT R1.
//! Port of src/pages/api/mission/** with behavioural parity: same method
//! checks (405 bodies are the Node `res.end` plain strings, not JSON), same
//! success/error JSON envelopes, same car-backend calls via apiToMain
//! semantics (any upstream failure → null → the handler's own fallback).

use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderValue, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::{Json, Router};
use serde_json::{json, Value};
use sqlx::{FromRow, Row};
use std::collections::HashMap;

use crate::models::{ClearedFod, Fod, FodGroup, Mission};
use crate::services::{self as svc, Bind};
use crate::state::AppState;

/// Object.keys(config.cameraMap) from src/config/clientConfig.ts — insertion
/// order matters (it is the payload the vehicle backend receives).
const CAMERA_MAP_KEYS: [&str; 26] = [
    "flir00", "flir01", "flir02", "flir03", "flir04", "flir05", "flir06", "flir07", "lucid08",
    "lucid09", "lucid10", "lucid11", "lucid12", "lucid13", "lucid14", "lucid15", "lucid16",
    "lucid17", "lucid18", "lucid19", "lucid20", "lucid21", "lucid22", "lucid23", "lucid24",
    "lucid25",
];

pub fn router() -> Router<AppState> {
    // Every route is mounted with any(): each handler performs the SAME
    // req.method check its Node counterpart does (405 text body, Allow header
    // only where the Node code called res.setHeader). Using axum method
    // routers instead would auto-inject a computed Allow header on 405s the
    // Node handlers never sent.
    Router::new()
        .route("/", any(list_missions))
        .route("/create", any(create_mission))
        .route("/stat", any(stat))
        .route("/toggle-scan", any(toggle_scan))
        .route("/clear-fod", any(clear_fod))
        .route("/download/{id}", any(download))
        .route("/export/{id}", any(export))
        .route("/delete/{id}", any(delete_mission))
        .route("/excluded", any(excluded))
        .route("/explore/{id}", any(explore))
        .route("/group-fods/{id}", any(group_fods))
        .route("/join/{id}", any(join))
        .route("/load/active", any(load_active))
        .route("/load/new", any(load_new))
        .route("/load/{id}", any(load_by_id))
        .route("/restart/{id}", any(restart))
        .route("/retrive-data/{id}", any(retrive_data))
        .route("/scan-status", any(scan_status))
        .route("/terminate/{id}", any(terminate))
        .route("/update/{id}", any(update_mission))
        .route("/templates", any(mission_templates))
        .route("/templates/{id}", any(mission_template_by_id))
        .route("/storage-overview", any(storage_overview))
        .route("/storage-policy", any(storage_policy))
        .route("/local-free/{id}", any(local_free))
        .route("/local-free-batch", any(local_free_batch))
        .route("/local-reimport/{id}", any(local_reimport))
        .route("/atc/cold-store/{id}", any(atc_cold_store))
        .route("/atc/restore/{id}", any(atc_restore))
        .route("/car/drop/{id}", any(car_drop))
        .route("/archive/export/{id}", any(archive_export))
        .route("/archive/import", any(archive_import))
}

/// Node 405: `res.status(405).end(\`Method ${req.method} Not Allowed\`)` —
/// a plain string body, plus an Allow header only where the Node handler
/// called res.setHeader.
pub(crate) fn mna(method: &Method, allow: Option<&'static str>) -> Response {
    let mut resp =
        (StatusCode::METHOD_NOT_ALLOWED, format!("Method {method} Not Allowed")).into_response();
    if let Some(a) = allow {
        resp.headers_mut()
            .insert(header::ALLOW, HeaderValue::from_static(a));
    }
    resp
}

pub(crate) fn err_json(status: StatusCode, body: Value) -> Response {
    (status, Json(body)).into_response()
}

fn err500(msg: &str) -> Response {
    err_json(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": msg }))
}

/// Lenient body parse: the Electron router always handed handlers an object
/// (`body || {}`), so unparseable/absent bodies become `{}`.
fn parse_body(bytes: &[u8]) -> Value {
    if bytes.is_empty() {
        return json!({});
    }
    serde_json::from_slice(bytes).unwrap_or_else(|_| json!({}))
}

// ---------------------------------------------------------------------------
// GET /api/mission — pages/api/mission/index.ts
// ---------------------------------------------------------------------------
async fn list_missions(method: Method, State(s): State<AppState>) -> Response {
    if method != Method::GET {
        return mna(&method, None);
    }
    let upstream = svc::api_to_main(&s, reqwest::Method::GET, "/mission", Some(json!({})), None).await;
    match upstream {
        Some(Value::Array(arr)) => {
            let filtered: Vec<Value> = arr
                .into_iter()
                .filter(|m| m.get("storageTier").and_then(Value::as_str) != Some("COLD_STORED"))
                .collect();
            (StatusCode::OK, Json(filtered)).into_response()
        }
        Some(v) if svc::js_truthy(&v) => (StatusCode::OK, Json(v)).into_response(),
        _ => match sqlx::query_as::<_, Mission>(
            r#"SELECT * FROM "Mission" WHERE COALESCE("storageTier", 'HOT') != 'COLD_STORED'"#,
        )
            .fetch_all(&s.db)
            .await
        {
            Ok(rows) => (StatusCode::OK, Json(rows)).into_response(),
            Err(_) => err500("Failed to retrieve missions"),
        },
    }
}

// ---------------------------------------------------------------------------
// POST /api/mission/create — pages/api/mission/create.ts
// PARITY: "Mission".id has no DB default (Prisma @default(dbgenerated()) with
// nothing behind it) and the handler never supplies one, so the insert always
// fails → 500, exactly like the Node handler in this database.
// ---------------------------------------------------------------------------
async fn create_mission(method: Method, State(s): State<AppState>, bytes: axum::body::Bytes) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let body = parse_body(&bytes);
    match try_create_mission(&s, &body).await {
        Ok(m) => (StatusCode::CREATED, Json(m)).into_response(),
        Err(_) => err500("Failed to create mission"),
    }
}

async fn try_create_mission(s: &AppState, body: &Value) -> anyhow::Result<Mission> {
    let mut cols: Vec<(&str, Bind)> = Vec::new();
    match body.get("status") {
        None => {}
        Some(Value::String(v)) if svc::MISSION_STATUS.contains(&v.as_str()) => {
            cols.push(("status", Bind::Enum(v.clone(), "\"MissionStatus\"")))
        }
        Some(other) => anyhow::bail!("Argument status: invalid ({other})"),
    }
    match body.get("timer") {
        None => {}
        Some(v) => cols.push((
            "timer",
            Bind::F64(v.as_f64().ok_or_else(|| anyhow::anyhow!("timer: not a number"))?),
        )),
    }
    match body.get("scanStatus") {
        None => {}
        Some(Value::String(v)) if svc::MISSION_SCAN_STATUS.contains(&v.as_str()) => {
            cols.push(("scanStatus", Bind::Enum(v.clone(), "\"MissionScanStatus\"")))
        }
        Some(other) => anyhow::bail!("Argument scanStatus: invalid ({other})"),
    }
    match body.get("createdBy") {
        None => {}
        Some(Value::Null) => cols.push(("createdBy", Bind::OptStr(None))),
        Some(Value::String(v)) => cols.push(("createdBy", Bind::OptStr(Some(v.clone())))),
        Some(other) => anyhow::bail!("Argument createdBy: invalid ({other})"),
    }
    match body.get("previousTime") {
        None => {}
        Some(Value::Null) => cols.push(("previousTime", Bind::OptDt(None))),
        Some(v) => cols.push((
            "previousTime",
            Bind::OptDt(Some(
                svc::parse_js_date(v).ok_or_else(|| anyhow::anyhow!("previousTime: invalid"))?,
            )),
        )),
    }
    let created_at = body
        .get("createdAt")
        .and_then(svc::parse_js_date)
        .ok_or_else(|| anyhow::anyhow!("Argument createdAt is missing"))?;
    cols.push(("createdAt", Bind::Dt(created_at)));
    cols.push(("updatedAt", Bind::Dt(svc::now_naive())));

    let mut qb = svc::insert_builder("Mission", &cols);
    qb.push(" RETURNING *");
    Ok(qb.build_query_as::<Mission>().fetch_one(&s.db).await?)
}

// ---------------------------------------------------------------------------
// GET /api/mission/stat — pages/api/mission/stat.ts
// ---------------------------------------------------------------------------
async fn stat(method: Method, State(s): State<AppState>) -> Response {
    if method != Method::GET {
        return mna(&method, None);
    }
    // syncService.sync("missionList") — swallows its own errors in Node.
    if let Err(e) = crate::scheduler::sync(&s, "missionList").await {
        tracing::error!("Error during syncing process: {e}");
    }
    let sql = r#"
       SELECT
         m.*,
         COUNT(CASE WHEN fg.status = 'ACCEPTED' THEN 1 END) AS "accepted",
         COUNT(CASE WHEN fg.status = 'REJECTED' THEN 1 END) AS "rejected",
         COUNT(CASE WHEN fg.status = 'CLEARED' THEN 1 END) AS "cleared",
         COUNT(CASE WHEN fg.status = 'NEW' THEN 1 END) AS "newFodGroups",
         COUNT(CASE WHEN COALESCE(fg."dirty", 0) = 1 THEN 1 END) AS "dirtyCount",
         COUNT(fg.id) AS "total",
         (SELECT fg2."groupId" FROM "FodGroup" fg2 WHERE fg2."missionId" = m.id AND fg2."biggestFodId" IS NOT NULL ORDER BY COALESCE(fg2."biggestFodSize", 0) DESC, fg2."groupId" DESC LIMIT 1) AS "biggestGroupId",
         (SELECT fg2."biggestFodId" FROM "FodGroup" fg2 WHERE fg2."missionId" = m.id AND fg2."biggestFodId" IS NOT NULL ORDER BY COALESCE(fg2."biggestFodSize", 0) DESC, fg2."groupId" DESC LIMIT 1) AS "biggestFodId",
         (SELECT MAX(f."timestamp") FROM "Fod" f WHERE f."missionId" = m.id) AS "lastFodAt"
       FROM "Mission" m
       LEFT JOIN "FodGroup" fg ON m.id = fg."missionId"
       WHERE COALESCE(m."storageTier", 'HOT') != 'COLD_STORED'
       GROUP BY m.id
       ORDER BY m.id DESC
     "#;
    let rows = match sqlx::query(sql).fetch_all(&s.db).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("{e}");
            return err500("Failed to retrieve missions");
        }
    };
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut out: Vec<Value> = Vec::with_capacity(rows.len());
    for row in rows {
        let mission = match Mission::from_row(&row) {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("{e}");
                return err500("Failed to retrieve missions");
            }
        };
        let created_ms = mission.created_at.and_utc().timestamp_millis();
        let updated_ms = mission.updated_at.and_utc().timestamp_millis();
        let last_fod_ms = row
            .try_get::<Option<sqlx::types::chrono::NaiveDateTime>, _>("lastFodAt")
            .ok()
            .flatten()
            .map(|dt| dt.and_utc().timestamp_millis());
        let duration_ms: i64 = if mission.status == crate::models::MissionStatus::Active {
            if mission.timer > 0.0 {
                let base_ms = (mission.timer * 1000.0).round() as i64;
                let tail_ms = (now_ms - updated_ms).clamp(0, 10_000);
                base_ms + tail_ms
            } else {
                (now_ms - created_ms).max(0)
            }
        } else if mission.timer > 0.0 {
            (mission.timer * 1000.0).round() as i64
        } else {
            let end_ms = updated_ms.max(last_fod_ms.unwrap_or(updated_ms));
            (end_ms - created_ms).max(0)
        };

        let mut v = svc::to_value(&mission);
        let o = v.as_object_mut().unwrap();
        for key in ["accepted", "rejected", "cleared", "newFodGroups", "dirtyCount", "total"] {
            let n: i64 = row.try_get(key).unwrap_or(0);
            o.insert(key.to_string(), json!(n));
        }
        let img_dir = std::path::Path::new("fod-images/mission").join(mission.id.to_string());
        let local_size_bytes = crate::archive::dir_size_bytes(&img_dir).await;
        o.insert("localSizeBytes".to_string(), json!(local_size_bytes));
        if let (Ok(Some(bgid)), Ok(Some(bfid))) = (
            row.try_get::<Option<i32>, _>("biggestGroupId"),
            row.try_get::<Option<String>, _>("biggestFodId"),
        ) && !bfid.is_empty()
        {
            o.insert(
                "thumbnail".to_string(),
                json!(format!("/images/{}/{}/{}.jpg", mission.id, bgid, bfid)),
            );
        }
        o.insert("mission_id".to_string(), json!(mission.id));
        o.insert("durationMs".to_string(), json!(duration_ms));
        o.insert("duration".to_string(), json!(duration_ms));
        out.push(v);
    }
    (StatusCode::OK, Json(out)).into_response()
}

// ---------------------------------------------------------------------------
// GET /api/mission/toggle-scan — pages/api/mission/toggle-scan.ts
// ---------------------------------------------------------------------------
async fn toggle_scan(method: Method, State(s): State<AppState>, Query(q): Query<HashMap<String, String>>) -> Response {
    if method != Method::GET {
        return mna(&method, None);
    }
    let mut body = serde_json::Map::new();
    if let Some(t) = q.get("type") {
        body.insert("type".into(), json!(t));
    }
    body.insert("camList".into(), json!(CAMERA_MAP_KEYS));

    let sim_verb = if q.get("type").map(|s| s.as_str()) == Some("pause") { "pause" } else { "resume" };
    let sim_url = format!("http://127.0.0.1:50055/command?cmd={}", sim_verb);
    tokio::spawn(async move {
        let _ = reqwest::Client::new().get(&sim_url).timeout(std::time::Duration::from_millis(300)).send().await;
    });

    let v = svc::api_to_main(
        &s,
        reqwest::Method::POST,
        "/api/mission-control/toggle-scan",
        Some(Value::Object(body)),
        None,
    )
    .await;
    match v {
        Some(v) if svc::js_truthy(&v) => {
            let status = v.get("data").and_then(Value::as_str)
                .or_else(|| v.as_str())
                .unwrap_or("PAUSE");
            let _ = sqlx::query(
                "UPDATE \"Mission\" SET \"scanStatus\" = $1, \"updatedAt\" = $2 WHERE \"status\" = 'ACTIVE'",
            )
            .bind(status)
            .bind(svc::now_naive())
            .execute(&s.db)
            .await;

            let resp = if v.get("data").is_some() {
                v
            } else {
                json!({
                    "statusCode": 200,
                    "status": 200,
                    "data": status
                })
            };
            (StatusCode::OK, Json(resp)).into_response()
        }
        _ => err_json(
            StatusCode::BAD_GATEWAY,
            json!({ "error": "Vehicle backend unreachable — scan not toggled" }),
        ),
    }
}

// ---------------------------------------------------------------------------
// POST /api/mission/clear-fod — pages/api/mission/clear-fod/index.ts
// ---------------------------------------------------------------------------
async fn clear_fod(method: Method, State(s): State<AppState>, bytes: axum::body::Bytes) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST, PUT"));
    }
    let body = parse_body(&bytes);
    let mission_id = match body.get("missionId").and_then(svc::json_integer) {
        Some(m) => m,
        None => return err500("Failed to retrieve mission data"),
    };
    match svc::create_cleared_fod_batch(&s, vec![body], mission_id).await {
        Ok(groups) => match groups.into_iter().next() {
            Some(g) => {
                let state = s.clone();
                tokio::spawn(async move {
                    let _ = crate::scheduler::resolve_fod_group(&state).await;
                });
                (StatusCode::OK, Json(g)).into_response()
            }
            // Unreachable in Node too (Promise.all always resolves an array);
            // kept for the 404 branch's sake.
            None => err_json(StatusCode::NOT_FOUND, json!({ "error": "Group data not found" })),
        },
        Err(e) => {
            tracing::error!("{e}");
            err500("Failed to retrieve mission data")
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/mission/download/{id} — pages/api/mission/download/[id].ts
// Streams car-backend NDJSON in the background; responds 200 {} immediately
// (Node behaviour — even when the vehicle backend is unreachable).
// ---------------------------------------------------------------------------
async fn download(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, None);
    }
    let mission_id = match svc::js_parse_int(&id) {
        Some(m) if m != 0 => m,
        _ => return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Mission ID is missing" })),
    };
    // PARITY: the Node handler hardcodes this URL (does not use
    // NEXT_PUBLIC_SERVER_URL).
    let url = format!("http://localhost:6969/mission/download/{mission_id}");
    match s.http.get(&url).send().await {
        Ok(resp) => {
            let state = s.clone();
            tokio::spawn(async move {
                process_download_stream(state, resp, mission_id).await;
            });
        }
        Err(e) => tracing::error!("Streaming error: {e}"),
    }
    (StatusCode::OK, Json(json!({}))).into_response()
}

async fn process_download_stream(state: AppState, resp: reqwest::Response, mission_id: i64) {
    use futures::StreamExt;
    let mut stream = resp.bytes_stream();
    let mut buffer = String::new();
    while let Some(chunk) = stream.next().await {
        let chunk = match chunk {
            Ok(c) => c,
            Err(e) => {
                tracing::error!("Streaming error: {e}");
                return;
            }
        };
        buffer.push_str(&String::from_utf8_lossy(&chunk));
        let mut lines: Vec<String> = buffer.split('\n').map(|s| s.to_string()).collect();
        buffer = lines.pop().unwrap_or_default();
        for line in lines {
            if line.trim().is_empty() {
                continue;
            }
            if !process_download_line(&state, &line, mission_id).await {
                tracing::error!("Error parsing chunk: {line}");
            }
        }
    }
    tracing::info!("Stream finished.");
}

/// One NDJSON record; false → the Node `catch` ("Error parsing chunk") path.
async fn process_download_line(state: &AppState, line: &str, mission_id: i64) -> bool {
    let mut data: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return false,
    };
    let typ = data.get("type").and_then(|t| t.as_str()).unwrap_or("").to_string();
    match typ.as_str() {
        "mission" => {
            tracing::info!("Processed chunk: mission");
            let payload = data.get("data").cloned().unwrap_or(Value::Null);
            if let Err(e) = svc::upsert_mission_data(state, payload).await {
                tracing::error!("upsertMissionData: {e}");
            }
        }
        "fodGroup" => {
            let payload = data.get("data").cloned().unwrap_or(Value::Null);
            if let Err(e) = svc::upsert_group_batch(state, vec![payload], mission_id).await {
                tracing::error!("upsertGroupBatch: {e}");
            }
        }
        "clearedFod" => {
            let payload = data.get("data").cloned().unwrap_or(Value::Null);
            if let Err(e) = svc::create_cleared_fod_batch(state, vec![payload], mission_id).await {
                tracing::error!("createClearedFodBatch: {e}");
            }
        }
        "fod" => {
            // base64 = Buffer.from(frame).toString(); re-encode when it does
            // not already look like base64 JPEG text.
            let Some(frame) = data.get("data").and_then(|d| d.get("frame")) else {
                return false; // TypeError in Node → "Error parsing chunk"
            };
            let Some(bytes) = svc::frame_to_bytes(frame) else {
                return false;
            };
            let text = String::from_utf8_lossy(&bytes);
            let base64_str = if text.starts_with("/9j/4AA") {
                text.into_owned()
            } else {
                use base64::Engine;
                base64::engine::general_purpose::STANDARD.encode(&bytes)
            };
            if let Some(d) = data.get_mut("data") {
                d["frame"] = Value::String(base64_str);
            }
            let payload = data.get("data").cloned().unwrap_or(Value::Null);
            svc::create_fod_batch(state, vec![payload], mission_id).await;
        }
        _ => {}
    }
    true
}

// ---------------------------------------------------------------------------
// GET /api/mission/export/{id} — pages/api/mission/export/[id].ts
// ---------------------------------------------------------------------------
async fn export(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let mission_id = match svc::js_parse_int(&id) {
        Some(m) if m != 0 => m,
        _ => {
            return err_json(
                StatusCode::BAD_REQUEST,
                json!({ "error": "Mission ID is missing or invalid" }),
            )
        }
    };
    match try_export(&s, mission_id).await {
        Ok(resp) => resp,
        Err(e) => {
            tracing::error!("Mission export failed: {e}");
            err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": "Failed to export mission", "details": e.to_string() }),
            )
        }
    }
}

async fn try_export(s: &AppState, mission_id: i64) -> anyhow::Result<Response> {
    let mission: Option<Mission> = sqlx::query_as("SELECT * FROM \"Mission\" WHERE \"id\" = $1")
        .bind(mission_id)
        .fetch_optional(&s.db)
        .await?;
    let Some(mission) = mission else {
        return Ok(err_json(
            StatusCode::NOT_FOUND,
            json!({ "error": format!("Mission {mission_id} not found locally") }),
        ));
    };
    let fod_groups: Vec<FodGroup> =
        sqlx::query_as("SELECT * FROM \"FodGroup\" WHERE \"missionId\" = $1")
            .bind(mission_id)
            .fetch_all(&s.db)
            .await
            .map_err(|e| anyhow::anyhow!("fodGroups query: {e}"))?;
    let fods: Vec<Fod> = sqlx::query_as("SELECT * FROM \"Fod\" WHERE \"missionId\" = $1")
        .bind(mission_id)
        .fetch_all(&s.db)
        .await
        .map_err(|e| anyhow::anyhow!("fods query: {e}"))?;
    let cleared_fods: Vec<ClearedFod> =
        sqlx::query_as("SELECT * FROM \"ClearedFod\" WHERE \"missionId\" = $1")
            .bind(mission_id)
            .fetch_all(&s.db)
            .await
            .map_err(|e| anyhow::anyhow!("clearedFods query: {e}"))?;

    let counts = json!({
        "fodGroups": fod_groups.len(),
        "fods": fods.len(),
        "clearedFods": cleared_fods.len(),
    });
    let backup = svc::obj(vec![
        (
            "exportedAt",
            json!(chrono::Utc::now().format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()),
        ),
        ("mission", svc::to_value(&mission)),
        ("fodGroups", svc::to_value(&fod_groups)),
        ("fods", svc::to_value(&fods)),
        ("clearedFods", svc::to_value(&cleared_fods)),
    ]);

    let exports_dir = std::env::current_dir()?.join("fod-images/exports");
    tokio::fs::create_dir_all(&exports_dir).await?;
    let file_name = format!(
        "mission-{mission_id}-{}.json",
        chrono::Utc::now().timestamp_millis()
    );
    let file_path = exports_dir.join(&file_name);
    tokio::fs::write(&file_path, serde_json::to_string_pretty(&backup)?).await?;

    Ok((
        StatusCode::OK,
        Json(json!({
            "message": "Mission exported",
            "path": file_path.to_string_lossy(),
            "counts": counts,
        })),
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// DELETE|GET /api/mission/delete/{id} — pages/api/mission/delete/[id].ts
// ---------------------------------------------------------------------------
async fn delete_mission(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::DELETE && method != Method::GET {
        return mna(&method, Some("DELETE, GET"));
    }
    let mission_id = match svc::js_parse_int(&id) {
        Some(m) if m != 0 => m,
        _ => {
            return err_json(
                StatusCode::BAD_REQUEST,
                json!({ "error": "Mission ID is missing or invalid" }),
            )
        }
    };
    match try_delete(&s, mission_id).await {
        Ok(resp) => resp,
        Err(e) => {
            tracing::error!("Mission delete failed: {e}");
            err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": "Failed to delete mission", "details": e.to_string() }),
            )
        }
    }
}

async fn try_delete(s: &AppState, mission_id: i64) -> anyhow::Result<Response> {
    let mission: Option<Mission> = sqlx::query_as("SELECT * FROM \"Mission\" WHERE \"id\" = $1")
        .bind(mission_id)
        .fetch_optional(&s.db)
        .await?;
    let Some(mission) = mission else {
        return Ok(err_json(
            StatusCode::NOT_FOUND,
            json!({ "error": format!("Mission {mission_id} not found locally") }),
        ));
    };
    if mission.status == crate::models::MissionStatus::Active {
        return Ok(err_json(
            StatusCode::CONFLICT,
            json!({ "error": "Cannot delete the active mission — terminate it first" }),
        ));
    }

    let mut tx = s.db.begin().await?;
    let fods = sqlx::query("DELETE FROM \"Fod\" WHERE \"missionId\" = $1")
        .bind(mission_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    let fod_groups = sqlx::query("DELETE FROM \"FodGroup\" WHERE \"missionId\" = $1")
        .bind(mission_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    let cleared_fods = sqlx::query("DELETE FROM \"ClearedFod\" WHERE \"missionId\" = $1")
        .bind(mission_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
    sqlx::query("DELETE FROM \"Mission\" WHERE \"id\" = $1")
        .bind(mission_id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    let mut images_removed = false;
    let image_dir = std::path::Path::new("fod-images/mission").join(mission_id.to_string());
    if image_dir.exists() {
        match tokio::fs::remove_dir_all(&image_dir).await {
            Ok(_) => images_removed = true,
            Err(e) => tracing::error!("Failed to remove image folder for mission {mission_id} {e}"),
        }
    }

    Ok((
        StatusCode::OK,
        Json(json!({
            "message": format!("Mission {mission_id} deleted"),
            "deleted": { "fods": fods, "fodGroups": fod_groups, "clearedFods": cleared_fods },
            "imagesRemoved": images_removed,
        })),
    )
        .into_response())
}

// ---------------------------------------------------------------------------
// GET /api/mission/excluded — pages/api/mission/excluded/index.ts
// ---------------------------------------------------------------------------
async fn excluded(method: Method) -> Response {
    if method != Method::GET {
        return mna(&method, Some("POST")); // sic (Node)
    }
    (StatusCode::OK, Json(json!({ "message": "mission list updated" }))).into_response()
}

// ---------------------------------------------------------------------------
// GET /api/mission/explore/{id} — pages/api/mission/explore/[id].ts
// ---------------------------------------------------------------------------
async fn explore(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err500("Failed to retrieve mission");
    };
    match sqlx::query_as::<_, Mission>("SELECT * FROM \"Mission\" WHERE \"id\" = $1 LIMIT 1")
        .bind(mission_id)
        .fetch_optional(&s.db)
        .await
    {
        Ok(m) => (StatusCode::OK, Json(m)).into_response(), // null when absent, like Node
        Err(e) => {
            tracing::error!("{e}");
            err500("Failed to retrieve mission")
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/mission/group-fods/{id}?missionId= — pages/api/mission/group-fods/[id].ts
// (The Node 402 "missing args." write is immediately overwritten by the 500
// from the NaN Prisma query in the shipped mainApiRouter — port the final
// outcome.)
// ---------------------------------------------------------------------------
async fn group_fods(method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET, PUT"));
    }
    let group_id = svc::js_parse_int(&id).and_then(|v| i32::try_from(v).ok());
    let mission_id = q
        .get("missionId")
        .and_then(|m| svc::js_parse_int(m));
    let (Some(group_id), Some(mission_id)) = (group_id, mission_id) else {
        return err500("Failed to retrieve fods");
    };
    match sqlx::query_as::<_, Fod>(
        "SELECT * FROM \"Fod\" WHERE \"missionId\" = $1 AND \"groupId\" = $2",
    )
    .bind(mission_id)
    .bind(group_id)
    .fetch_all(&s.db)
    .await
    {
        Ok(mut fods) => {
            fods.sort_by(|a, b| b.size.partial_cmp(&a.size).unwrap_or(std::cmp::Ordering::Equal));
            (StatusCode::OK, Json(json!({ "data": fods, "origin": "self" }))).into_response()
        }
        Err(e) => {
            tracing::error!("{e}");
            err500("Failed to retrieve fods")
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/mission/join/{id} — pages/api/mission/join/[id].ts
// ---------------------------------------------------------------------------
async fn join(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let v = svc::api_to_main(
        &s,
        reqwest::Method::GET,
        &format!("/api/mission-control/join/{id}"),
        Some(json!({})),
        None,
    )
    .await;
    if let Some(m) = &v
        && svc::loose_eq_200(m.get("statusCode"))
    {
        return (StatusCode::OK, Json(m.get("data").cloned().unwrap_or(Value::Null)))
            .into_response();
    }
    // Upstream refused/unreachable: mark the mission INACTIVE locally, then
    // report the server error. A failing update (bad id / no row → Prisma
    // P2025) short-circuits to the catch envelope instead.
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err500("Failed to retrieve mission");
    };
    let res = sqlx::query("UPDATE \"Mission\" SET \"status\" = 'INACTIVE', \"updatedAt\" = $1 WHERE \"id\" = $2")
        .bind(svc::now_naive())
        .bind(mission_id)
        .execute(&s.db)
        .await;
    match res {
        Ok(r) if r.rows_affected() > 0 => err500("Something went bad on server"),
        _ => err500("Failed to retrieve mission"),
    }
}

// ---------------------------------------------------------------------------
// GET /api/mission/load/active — pages/api/mission/load/active.ts
// ---------------------------------------------------------------------------
async fn load_active(method: Method, State(s): State<AppState>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let v = match svc::api_to_main(&s, reqwest::Method::GET, "/mission/active", Some(json!({})), None).await {
        Some(val) if svc::js_truthy(&val) => val,
        _ => {
            let local: Option<Mission> = sqlx::query_as(r#"SELECT * FROM "Mission" WHERE "status" = 'ACTIVE' LIMIT 1"#)
                .fetch_optional(&s.db)
                .await
                .ok()
                .flatten();
            local.map(|m| serde_json::to_value(m).unwrap_or(Value::Null)).unwrap_or(Value::Null)
        }
    };
    svc::set_mission(&v);
    if svc::js_truthy(&v) {
        (StatusCode::OK, Json(v)).into_response()
    } else {
        err_json(StatusCode::NOT_FOUND, json!({ "error": "Mission not found" }))
    }
}

// ---------------------------------------------------------------------------
// POST|GET /api/mission/load/new — pages/api/mission/load/new.ts
// ---------------------------------------------------------------------------
async fn load_new(method: Method, State(s): State<AppState>, bytes: axum::body::Bytes) -> Response {
    if method != Method::POST && method != Method::GET {
        return mna(&method, Some("GET, POST"));
    }
    let body = parse_body(&bytes);
    // speed/pass validation (skip when the key is absent or null, like
    // `speed != null` in Node).
    for (key, min, max, msg) in [
        (
            "speed",
            5i64,
            45i64,
            "Mission speed must be an integer between 5 and 45 km/h",
        ),
        ("pass", 1, 3, "Number of passes must be between 1 and 3"),
    ] {
        match body.get(key) {
            None | Some(Value::Null) => {}
            Some(v) => match svc::json_integer(v) {
                Some(n) if (min..=max).contains(&n) => {}
                _ => return err_json(StatusCode::BAD_REQUEST, json!({ "error": msg })),
            },
        }
    }
    let existing_active: Option<i64> = sqlx::query_scalar(
        "SELECT \"id\" FROM \"Mission\" WHERE \"status\" = 'ACTIVE' LIMIT 1",
    )
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();
    if existing_active.is_some() {
        return err_json(
            StatusCode::CONFLICT,
            json!({ "error": "A live mission is already active. Please join or terminate it first." }),
        );
    }

    let mut data = serde_json::Map::new();
    for key in ["speed", "pass"] {
        if let Some(v) = body.get(key) {
            data.insert(key.to_string(), v.clone());
        }
    }
    let mission = svc::api_to_main(
        &s,
        reqwest::Method::POST,
        "/api/mission-control/start",
        Some(Value::Object(data)),
        None,
    )
    .await;
    tracing::info!("Mission: {mission:?}");

    let ok = mission.as_ref().is_some_and(|m| {
        // strict `mission.statusCode !== 200` — string "200" does NOT pass.
        m.get("statusCode").and_then(|c| c.as_f64()) == Some(200.0)
            && m.get("data").map(svc::js_truthy).unwrap_or(false)
    });
    if !ok {
        let m = mission.unwrap_or(Value::Null);
        let err = [
            m.get("error").and_then(|e| e.get("message")),
            m.get("message"),
        ]
        .into_iter()
        .flatten()
        .find(|v| svc::js_truthy(v))
        .cloned()
        .unwrap_or_else(|| json!("Failed to start mission"));
        return err_json(StatusCode::CONFLICT, json!({ "error": err }));
    }
    let data = mission.unwrap().get("data").cloned().unwrap();
    if let Err(e) = svc::activate_mission(&s, &data).await {
        tracing::error!("{e}");
        return err500("Failed to retrieve mission");
    }
    (StatusCode::OK, Json(data)).into_response()
}

// ---------------------------------------------------------------------------
// GET /api/mission/load/{id} — pages/api/mission/load/[id].ts
// (NOTE: checks `.status`, not `.statusCode` — kept.)
// ---------------------------------------------------------------------------
async fn load_by_id(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let v = svc::api_to_main(
        &s,
        reqwest::Method::GET,
        &format!("/mission/load/{id}"),
        Some(json!({})),
        None,
    )
    .await;
    if let Some(m) = &v
        && svc::loose_eq_200(m.get("status"))
    {
        return (StatusCode::OK, Json(m.get("data").cloned().unwrap_or(Value::Null)))
            .into_response();
    }
    err500("Something went bad on server")
}

// ---------------------------------------------------------------------------
// GET /api/mission/restart/{id} — pages/api/mission/restart/[id].ts
// ---------------------------------------------------------------------------
async fn restart(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let v = svc::api_to_main(
        &s,
        reqwest::Method::GET,
        &format!("/api/mission-control/restart/{id}"),
        Some(json!({})),
        None,
    )
    .await;
    tracing::info!("restart mission: {v:?}");
    if let Some(m) = &v
        && svc::loose_eq_200(m.get("statusCode"))
    {
        return (StatusCode::OK, Json(m.get("data").cloned().unwrap_or(Value::Null)))
            .into_response();
    }
    err500("Something went bad on server")
}

// ---------------------------------------------------------------------------
// GET /api/mission/retrive-data/{id} — pages/api/mission/retrive-data/[id].ts
// ---------------------------------------------------------------------------
async fn retrive_data(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET, PUT"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err500("Failed to retrieve mission data");
    };
    // Same query as the Node handler ($queryRaw); the only textual change is
    // ::text on the enum column so the driver returns it as a string, which
    // is what Prisma produced.
    let sql = r#"
      SELECT
            "f"."id",
            "f"."size",
            "f"."groupId",
            "f"."timestamp",
            "f"."location",
            "f"."class",
            "f"."velocity",
            "f"."sysid",
            "maxFod"."maxSize" AS "biggestSize",
            fg."status" AS "groupStatus"
        FROM
            "Fod" f
        INNER JOIN (
            SELECT
                "groupId",
                MAX("size") AS "maxSize"
            FROM
                "Fod"
            WHERE
                "missionId" = $1
            GROUP BY
                "groupId"
        ) AS "maxFod" ON f."groupId" = "maxFod"."groupId" AND f."size" = "maxFod"."maxSize"
        LEFT JOIN
            "FodGroup" fg ON f."groupId" = fg."groupId" AND f."missionId" = fg."missionId"
        WHERE
            f."missionId" = $1
        GROUP BY
            f."groupId"
        ORDER BY
            f."groupId" DESC
      "#;
    let rows = match sqlx::query(sql).bind(mission_id).fetch_all(&s.db).await {
        Ok(r) => r,
        Err(e) => {
            tracing::error!("{e}");
            return err500("Failed to retrieve mission data");
        }
    };
    let mut out: Vec<Value> = Vec::with_capacity(rows.len());
    for row in rows {
        let location: Value = row.try_get("location").unwrap_or(Value::Null);
        // fod.location = typeof location=="string" ? JSON.parse(location) : location
        let location = match location {
            Value::String(text) => match serde_json::from_str::<Value>(&text) {
                Ok(v) => v,
                Err(e) => {
                    tracing::error!("{e}");
                    return err500("Failed to retrieve mission data");
                }
            },
            other => other,
        };
        let ts: sqlx::types::chrono::NaiveDateTime = match row.try_get("timestamp") {
            Ok(t) => t,
            Err(e) => {
                tracing::error!("{e}");
                return err500("Failed to retrieve mission data");
            }
        };
        out.push(svc::obj(vec![
            ("id", json!(row.try_get::<String, _>("id").unwrap_or_default())),
            ("size", json!(row.try_get::<f64, _>("size").unwrap_or(0.0))),
            ("groupId", json!(row.try_get::<i32, _>("groupId").unwrap_or(0))),
            ("timestamp", json!(ts.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())),
            ("location", location),
            ("class", json!(row.try_get::<Option<String>, _>("class").ok().flatten())),
            ("velocity", json!(row.try_get::<f64, _>("velocity").unwrap_or(0.0))),
            ("sysid", json!(row.try_get::<Option<String>, _>("sysid").ok().flatten())),
            ("biggestSize", json!(row.try_get::<f64, _>("biggestSize").unwrap_or(0.0))),
            (
                "groupStatus",
                json!(row.try_get::<Option<String>, _>("groupStatus").ok().flatten()),
            ),
        ]));
    }
    (StatusCode::OK, Json(out)).into_response()
}

// ---------------------------------------------------------------------------
// GET /api/mission/scan-status — pages/api/mission/scan-status/index.ts
// ---------------------------------------------------------------------------
async fn scan_status(method: Method, State(s): State<AppState>) -> Response {
    if method != Method::GET {
        return mna(&method, None);
    }
    let local_scan: Option<String> = sqlx::query_scalar(
        "SELECT \"scanStatus\" FROM \"Mission\" WHERE \"status\" = 'ACTIVE' LIMIT 1",
    )
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    let scan = if let Some(s) = local_scan {
        json!(s)
    } else {
        let v = svc::api_to_main(
            &s,
            reqwest::Method::GET,
            "/api/mission-control/scan-status",
            None,
            Some(1000),
        )
        .await;
        match v {
            Some(v) if svc::js_truthy(&v) => {
                if let Some(s) = v.get("data").and_then(Value::as_str) {
                    json!(s)
                } else {
                    v
                }
            }
            _ => json!("PAUSE"),
        }
    };
    (StatusCode::OK, Json(json!({ "scanStatus": scan }))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/mission/terminate/{id} — pages/api/mission/terminate/[id].ts
// ---------------------------------------------------------------------------
async fn terminate(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::POST {
        return mna(&method, None);
    }
    let missions = svc::api_to_main(
        &s,
        reqwest::Method::GET,
        &format!("/api/mission-control/terminate/{id}"),
        Some(json!({})),
        None,
    )
    .await;
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err500("Failed to terminate missions");
    };
    let _ = sqlx::query(
        r#"UPDATE "Mission"
           SET "status" = 'INACTIVE',
               "scanStatus" = 'PAUSE',
               "timer" = CASE WHEN "timer" > 0 THEN "timer" ELSE MAX(0.0, (julianday($1) - julianday("createdAt")) * 86400.0) END,
               "updatedAt" = $1
           WHERE "id" = $2 OR "status" = 'ACTIVE'"#,
    )
        .bind(svc::now_naive())
        .bind(mission_id)
        .execute(&s.db)
        .await;
    tracing::info!("terminate: {missions:?}");
    (StatusCode::OK, Json(missions.unwrap_or(json!({
        "statusCode": 200,
        "status": 200,
        "data": {
            "missionId": mission_id,
            "success": true,
            "message": "Mission terminated successfully"
        }
    })))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/mission/update/{id} — pages/api/mission/update/[id].ts
// ---------------------------------------------------------------------------
async fn update_mission(method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("PATCH")); // sic (Node)
    }
    let body = parse_body(&bytes);
    tracing::info!("patching mission {body}");
    let v = svc::api_to_main(
        &s,
        reqwest::Method::POST,
        &format!("/mission/{id}"),
        Some(body),
        None,
    )
    .await;
    // Node res.json(mission) — null body when upstream failed.
    (StatusCode::OK, Json(v.unwrap_or(Value::Null))).into_response()
}

fn mission_template_to_json(t: &crate::models::MissionTemplate) -> Value {
    let boundary_points: Value =
        serde_json::from_str(&t.boundary_points).unwrap_or_else(|_| json!([]));
    json!({
        "id": t.id,
        "name": t.name,
        "description": t.description,
        "type": t.template_type,
        "speed": t.speed,
        "pass": t.pass,
        "overlap": t.overlap,
        "direction": t.direction,
        "reverse": t.reverse,
        "boundaryPoints": boundary_points,
        "isCustom": t.is_custom,
        "createdAt": t.created_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
        "updatedAt": t.updated_at.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string(),
    })
}

// ---------------------------------------------------------------------------
// GET / POST /api/mission/templates
// ---------------------------------------------------------------------------
async fn mission_templates(
    method: Method,
    State(s): State<AppState>,
    bytes: axum::body::Bytes,
) -> Response {
    if method == Method::GET {
        match sqlx::query_as::<_, crate::models::MissionTemplate>(
            r#"SELECT * FROM "MissionTemplate"
               WHERE COALESCE("isDeleted", false) = false
               ORDER BY "createdAt" DESC"#,
        )
        .fetch_all(&s.db)
        .await
        {
            Ok(rows) => {
                let list: Vec<Value> = rows.iter().map(mission_template_to_json).collect();
                (StatusCode::OK, Json(list)).into_response()
            }
            Err(e) => {
                tracing::error!("Failed to list mission templates: {e}");
                err500("Failed to retrieve mission templates")
            }
        }
    } else if method == Method::POST {
        let body = parse_body(&bytes);
        let id = body
            .get("id")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .map(str::to_string)
            .unwrap_or_else(|| format!("tmpl-custom-{}", chrono::Utc::now().timestamp_millis()));
        let name = body
            .get("name")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|v| !v.is_empty())
            .unwrap_or("Custom Scan Template")
            .to_string();
        let description = body
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string();
        let template_type = body
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or("CUSTOM")
            .to_string();
        let speed = body.get("speed").and_then(Value::as_i64).unwrap_or(20) as i32;
        let pass = body.get("pass").and_then(Value::as_i64).unwrap_or(1) as i32;
        let overlap = body.get("overlap").and_then(Value::as_i64).unwrap_or(20) as i32;
        let direction = body
            .get("direction")
            .and_then(Value::as_str)
            .unwrap_or("LENGTHWISE")
            .to_string();
        let reverse = body.get("reverse").and_then(Value::as_bool).unwrap_or(false);
        let boundary_points = match body.get("boundaryPoints") {
            Some(Value::String(s)) => s.clone(),
            Some(v) => serde_json::to_string(v).unwrap_or_else(|_| "[]".to_string()),
            None => "[]".to_string(),
        };
        let is_custom = body.get("isCustom").and_then(Value::as_bool).unwrap_or(true);
        let now = svc::now_naive();

        let row = match sqlx::query_as::<_, crate::models::MissionTemplate>(
            r#"INSERT INTO "MissionTemplate" (
                   "id", "name", "description", "type", "speed", "pass", "overlap",
                   "direction", "reverse", "boundaryPoints", "isCustom", "isDeleted",
                   "dirty", "createdAt", "updatedAt"
               )
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false, true, $12, $12)
               ON CONFLICT ("id") DO UPDATE SET
                   "name" = EXCLUDED."name",
                   "description" = EXCLUDED."description",
                   "type" = EXCLUDED."type",
                   "speed" = EXCLUDED."speed",
                   "pass" = EXCLUDED."pass",
                   "overlap" = EXCLUDED."overlap",
                   "direction" = EXCLUDED."direction",
                   "reverse" = EXCLUDED."reverse",
                   "boundaryPoints" = EXCLUDED."boundaryPoints",
                   "isCustom" = EXCLUDED."isCustom",
                   "isDeleted" = false,
                   "dirty" = true,
                   "updatedAt" = EXCLUDED."updatedAt"
               RETURNING *"#,
        )
        .bind(&id)
        .bind(&name)
        .bind(&description)
        .bind(&template_type)
        .bind(speed)
        .bind(pass)
        .bind(overlap)
        .bind(&direction)
        .bind(reverse)
        .bind(&boundary_points)
        .bind(is_custom)
        .bind(now)
        .fetch_one(&s.db)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("Failed to save mission template: {e}");
                return err500("Failed to save mission template");
            }
        };

        // Best-effort immediate push to Car/ATC; background scheduler will retry if offline
        if svc::push_mission_template_to_upstream(&s, &row).await {
            let _ = sqlx::query(r#"UPDATE "MissionTemplate" SET "dirty" = false WHERE "id" = $1"#)
                .bind(&row.id)
                .execute(&s.db)
                .await;
        }

        (StatusCode::OK, Json(mission_template_to_json(&row))).into_response()
    } else {
        mna(&method, Some("GET, POST"))
    }
}

// ---------------------------------------------------------------------------
// DELETE /api/mission/templates/{id}
// ---------------------------------------------------------------------------
async fn mission_template_by_id(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    if method != Method::DELETE {
        return mna(&method, Some("DELETE"));
    }
    let now = svc::now_naive();
    let updated = sqlx::query_as::<_, crate::models::MissionTemplate>(
        r#"UPDATE "MissionTemplate"
           SET "isDeleted" = true, "dirty" = true, "updatedAt" = $2
           WHERE "id" = $1
           RETURNING *"#,
    )
    .bind(&id)
    .bind(now)
    .fetch_optional(&s.db)
    .await;

    match updated {
        Ok(Some(row)) => {
            if svc::push_mission_template_to_upstream(&s, &row).await {
                let _ = sqlx::query(
                    r#"UPDATE "MissionTemplate" SET "dirty" = false WHERE "id" = $1"#,
                )
                .bind(&row.id)
                .execute(&s.db)
                .await;
            }
            (StatusCode::OK, Json(json!({ "success": true, "id": id }))).into_response()
        }
        Ok(None) => (StatusCode::OK, Json(json!({ "success": true, "id": id }))).into_response(),
        Err(e) => {
            tracing::error!("Failed to delete mission template {id}: {e}");
            err500("Failed to delete mission template")
        }
    }
}

// ---------------------------------------------------------------------------
// Storage Lifecycle, Local Eviction/Re-import, ATC Cold Store & Archives
// ---------------------------------------------------------------------------

async fn storage_overview(method: Method, State(s): State<AppState>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }

    let (total_bytes, used_bytes, free_bytes, usage_percent) =
        crate::archive::disk_usage_for_path(std::path::Path::new("fod-images/mission")).await;
    let cache_bytes = crate::archive::dir_size_bytes(std::path::Path::new("fod-images/mission")).await;
    let local_stored_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "Mission" WHERE COALESCE("localEvicted", 0) = 0"#,
    )
    .fetch_one(&s.db)
    .await
    .unwrap_or(0);
    let local_evicted_count: i64 = sqlx::query_scalar(
        r#"SELECT COUNT(*) FROM "Mission" WHERE COALESCE("localEvicted", 0) = 1"#,
    )
    .fetch_one(&s.db)
    .await
    .unwrap_or(0);
    let desktop_policy = crate::scheduler::get_desktop_storage_policy(&s).await;

    let fleet = match svc::atc_get_storage_overview(&s).await {
        Ok(ov) => {
            let atc_disk = ov.atc_disk.map(|d| {
                json!({
                    "nodeId": d.node_id,
                    "online": d.online,
                    "totalBytes": d.total_bytes,
                    "usedBytes": d.used_bytes,
                    "freeBytes": d.free_bytes,
                    "usagePercent": d.usage_percent,
                    "framesBytes": d.frames_bytes,
                    "archivesBytes": d.archives_bytes,
                    "hotMissionCount": d.hot_mission_count,
                    "coldMissionCount": d.cold_mission_count,
                })
            });
            let car_disk = ov.car_disk.map(|d| {
                json!({
                    "nodeId": d.node_id,
                    "online": d.online,
                    "totalBytes": d.total_bytes,
                    "usedBytes": d.used_bytes,
                    "freeBytes": d.free_bytes,
                    "usagePercent": d.usage_percent,
                    "framesBytes": d.frames_bytes,
                    "archivesBytes": d.archives_bytes,
                    "hotMissionCount": d.hot_mission_count,
                    "coldMissionCount": d.cold_mission_count,
                })
            });
            let missions: Vec<Value> = ov
                .missions
                .into_iter()
                .map(|entry| {
                    let m = entry.mission;
                    json!({
                        "id": m.as_ref().map(|x| x.id).unwrap_or(0),
                        "displayId": m.as_ref().and_then(|x| x.display_id),
                        "status": m.as_ref().map(|x| match x.status { 1 => "ACTIVE", 3 => "TERMINATED", _ => "INACTIVE" }).unwrap_or("INACTIVE"),
                        "createdAt": m.as_ref().map(|x| x.created_at).unwrap_or(0),
                        "storageTier": m.as_ref().map(|x| x.storage_tier.as_str()).unwrap_or("HOT"),
                        "storageEpoch": m.as_ref().map(|x| x.storage_epoch).unwrap_or(1),
                        "archiveSizeBytes": m.as_ref().and_then(|x| x.archive_size_bytes),
                        "coldStoredAtMs": m.as_ref().and_then(|x| x.cold_stored_at_ms),
                        "totalFodGroups": entry.total_fod_groups,
                        "totalFods": entry.total_fods,
                        "clearedCount": entry.cleared_count,
                        "dirtyGroupCount": entry.dirty_group_count,
                        "hotBytes": entry.hot_bytes,
                        "archiveBytes": entry.archive_bytes,
                        "presentHotOnAtc": entry.present_hot_on_atc,
                        "presentColdOnAtc": entry.present_cold_on_atc,
                        "presentHotOnCar": entry.present_hot_on_car,
                        "carStorageTier": entry.car_storage_tier,
                    })
                })
                .collect();
            let fleet_policy = ov.policy.map(|p| {
                json!({
                    "autoColdStoreEnabled": p.auto_cold_store_enabled,
                    "atcKeepHotMissions": p.atc_keep_hot_missions,
                    "atcMaxDiskPercent": p.atc_max_disk_percent,
                    "autoDropCarOnColdStore": p.auto_drop_car_on_cold_store,
                    "autoDropCarWhenBackedUp": p.auto_drop_car_when_backed_up,
                    "carKeepHotMissions": p.car_keep_hot_missions,
                    "carMaxDiskPercent": p.car_max_disk_percent,
                })
            });
            json!({
                "atcOnline": true,
                "atcDisk": atc_disk,
                "carDisk": car_disk,
                "missions": missions,
                "fleetPolicy": fleet_policy,
            })
        }
        Err(e) => {
            json!({
                "atcOnline": false,
                "error": e.to_string(),
                "atcDisk": Value::Null,
                "carDisk": Value::Null,
                "missions": [],
                "fleetPolicy": Value::Null,
            })
        }
    };

    (
        StatusCode::OK,
        Json(json!({
            "desktop": {
                "totalBytes": total_bytes,
                "usedBytes": used_bytes,
                "freeBytes": free_bytes,
                "usagePercent": usage_percent,
                "cacheBytes": cache_bytes,
                "storedMissions": local_stored_count,
                "freedMissions": local_evicted_count,
                "policy": desktop_policy,
            },
            "fleet": fleet,
        })),
    )
        .into_response()
}

async fn storage_policy(
    method: Method,
    State(s): State<AppState>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let body = parse_body(&bytes);

    let mut saved_desktop = None;
    if let Some(dp) = body.get("desktop") {
        if let Ok(policy) = serde_json::from_value::<crate::scheduler::DesktopStoragePolicy>(dp.clone()) {
            if let Err(e) = crate::scheduler::save_desktop_storage_policy(&s, &policy).await {
                return err500(&format!("Failed to save desktop policy: {e}"));
            }
            saved_desktop = Some(policy);
        }
    }

    let mut saved_fleet = None;
    if let Some(fp) = body.get("fleet") {
        let cfg = proto_defination::mission::StoragePolicyConfig {
            auto_cold_store_enabled: fp.get("autoColdStoreEnabled").and_then(Value::as_bool).unwrap_or(false),
            atc_keep_hot_missions: fp.get("atcKeepHotMissions").and_then(Value::as_u64).unwrap_or(30) as u32,
            atc_max_disk_percent: fp.get("atcMaxDiskPercent").and_then(Value::as_u64).unwrap_or(85) as u32,
            auto_drop_car_on_cold_store: fp.get("autoDropCarOnColdStore").and_then(Value::as_bool).unwrap_or(true),
            auto_drop_car_when_backed_up: fp.get("autoDropCarWhenBackedUp").and_then(Value::as_bool).unwrap_or(false),
            car_keep_hot_missions: fp.get("carKeepHotMissions").and_then(Value::as_u64).unwrap_or(15) as u32,
            car_max_disk_percent: fp.get("carMaxDiskPercent").and_then(Value::as_u64).unwrap_or(80) as u32,
        };
        match svc::atc_update_storage_policy(&s, cfg).await {
            Ok(res) => {
                saved_fleet = Some(json!({
                    "autoColdStoreEnabled": res.auto_cold_store_enabled,
                    "atcKeepHotMissions": res.atc_keep_hot_missions,
                    "atcMaxDiskPercent": res.atc_max_disk_percent,
                    "autoDropCarOnColdStore": res.auto_drop_car_on_cold_store,
                    "autoDropCarWhenBackedUp": res.auto_drop_car_when_backed_up,
                    "carKeepHotMissions": res.car_keep_hot_missions,
                    "carMaxDiskPercent": res.car_max_disk_percent,
                }));
            }
            Err(e) => {
                return err_json(
                    StatusCode::BAD_GATEWAY,
                    json!({ "error": format!("Failed to update ATC fleet policy: {e}") }),
                );
            }
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "desktop": saved_desktop,
            "fleet": saved_fleet,
        })),
    )
        .into_response()
}

async fn local_free(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Invalid mission ID" }));
    };

    // Best-effort flush of any dirty decisions before freeing local data
    let _ = crate::scheduler::resolve_fod_group(&s).await;

    match crate::scheduler::purge_local_mission_data(&s, mission_id, false).await {
        Ok((bytes_freed, rows_removed)) => (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "missionId": mission_id,
                "bytesFreed": bytes_freed,
                "rowsRemoved": rows_removed,
            })),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::CONFLICT, json!({ "error": e.to_string() })),
    }
}

async fn local_free_batch(
    method: Method,
    State(s): State<AppState>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let body = parse_body(&bytes);
    let ids: Vec<i64> = body
        .get("missionIds")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(svc::json_integer).collect())
        .unwrap_or_default();

    let _ = crate::scheduler::resolve_fod_group(&s).await;

    let mut freed_total = 0u64;
    let mut freed_ids = Vec::new();
    let mut errors = Vec::new();

    for mid in ids {
        match crate::scheduler::purge_local_mission_data(&s, mid, false).await {
            Ok((b, _)) => {
                freed_total += b;
                freed_ids.push(mid);
            }
            Err(e) => errors.push(json!({ "missionId": mid, "error": e.to_string() })),
        }
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": errors.is_empty(),
            "freedMissionIds": freed_ids,
            "bytesFreed": freed_total,
            "errors": errors,
        })),
    )
        .into_response()
}

async fn reimport_mission_locally(s: &AppState, mission_id: i64) -> anyhow::Result<Value> {
    let existing_row: Option<(String,)> = sqlx::query_as(
        r#"SELECT COALESCE("storageTier", 'HOT') FROM "Mission" WHERE "id" = $1"#,
    )
    .bind(mission_id)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten();

    if let Some((ref tier,)) = existing_row {
        if tier == "COLD_STORED" {
            anyhow::bail!("Mission {mission_id} is cold-stored on ATC. Restore it from Cold Storage first.");
        }
    } else {
        // Mission row was previously dropped locally — fetch metadata from ATC/Car and insert it
        let detail = svc::api_to_main(
            s,
            reqwest::Method::GET,
            &format!("/mission/details/{mission_id}"),
            None,
            Some(5000),
        )
        .await;
        let data = detail.as_ref().and_then(|v| v.get("data")).unwrap_or(&Value::Null);
        if data.is_null() {
            anyhow::bail!("Mission {mission_id} not found on ATC or Car");
        }
        let tier = data.get("storageTier").and_then(Value::as_str).unwrap_or("HOT");
        if tier == "COLD_STORED" {
            anyhow::bail!("Mission {mission_id} is cold-stored on ATC. Restore it from Cold Storage first.");
        }
        let now = svc::now_naive();
        let display_id = data.get("displayId").and_then(Value::as_i64);
        let timer = data.get("timer").and_then(Value::as_f64).unwrap_or(0.0);
        let pass = data.get("pass").and_then(Value::as_i64).map(|v| v as i32);
        let speed = data.get("speed").and_then(Value::as_i64).map(|v| v as i32);
        let epoch = data.get("storageEpoch").and_then(Value::as_i64).unwrap_or(1);
        let created_at = data
            .get("createdAt")
            .and_then(svc::parse_js_date)
            .unwrap_or(now);
        sqlx::query(
            r#"INSERT INTO "Mission" ("id","displayId","status","timer","scanStatus","pass","speed","localEvicted","storageTier","storageEpoch","createdAt","updatedAt")
               VALUES ($1,$2,'TERMINATED',$3,'PAUSE',$4,$5,0,'HOT',$6,$7,$8)
               ON CONFLICT ("id") DO UPDATE SET "localEvicted" = 0, "storageTier" = 'HOT', "storageEpoch" = MAX(COALESCE("Mission"."storageEpoch", 1), EXCLUDED."storageEpoch"), "updatedAt" = EXCLUDED."updatedAt""#,
        )
        .bind(mission_id)
        .bind(display_id)
        .bind(timer)
        .bind(pass)
        .bind(speed)
        .bind(epoch)
        .bind(created_at)
        .bind(now)
        .execute(&s.db)
        .await?;
    }

    sqlx::query(
        r#"UPDATE "Mission" SET "localEvicted" = 0, "updatedAt" = $2 WHERE "id" = $1"#,
    )
    .bind(mission_id)
    .bind(svc::now_naive())
    .execute(&s.db)
    .await?;

    crate::scheduler::clear_mission_sync_cursor(mission_id);

    let groups = svc::fetch_all_groups_prefer_atc(s, mission_id).await?;
    let now = svc::now_naive();
    let mut cleared_group_ids = Vec::new();

    for g in &groups {
        let st = svc::proto_group_status_str(g.status);
        if st == "CLEARED" {
            cleared_group_ids.push(g.group_id);
        }
        let vv_str = serde_json::to_string(&g.version_vector).unwrap_or_else(|_| "{}".to_string());
        let created = chrono::DateTime::from_timestamp_millis(g.created_at)
            .map(|dt| dt.naive_utc())
            .unwrap_or(now);
        let id = uuid::Uuid::new_v4().to_string();
        let _ = sqlx::query(
            r#"INSERT INTO "FodGroup" ("id","groupId","missionId","dirty","status","version","versionVector","decidedAtMs","updatedBy","biggestFodId","biggestFodSize","createdAt","updatedAt")
               VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10,$11,$12)
               ON CONFLICT ("missionId","groupId") DO UPDATE SET
                 "status" = EXCLUDED."status",
                 "version" = EXCLUDED."version",
                 "versionVector" = EXCLUDED."versionVector",
                 "decidedAtMs" = EXCLUDED."decidedAtMs",
                 "updatedBy" = EXCLUDED."updatedBy",
                 "biggestFodId" = COALESCE(EXCLUDED."biggestFodId", "FodGroup"."biggestFodId"),
                 "biggestFodSize" = COALESCE(EXCLUDED."biggestFodSize", "FodGroup"."biggestFodSize"),
                 "dirty" = false,
                 "updatedAt" = EXCLUDED."updatedAt""#,
        )
        .bind(id)
        .bind(g.group_id as i32)
        .bind(mission_id)
        .bind(st)
        .bind(g.version)
        .bind(&vv_str)
        .bind(g.decided_at_ms)
        .bind(&g.updated_by)
        .bind(g.biggest_fod.as_deref())
        .bind(g.biggest_fod_size.map(|v| v as i32))
        .bind(created)
        .bind(now)
        .execute(&s.db)
        .await;
    }

    let fods = svc::fetch_biggest_fods_prefer_atc(s, mission_id).await;
    let mut restored_frames = 0usize;
    for f in &fods {
        let lat = f.location.as_ref().map(|l| l.lat).unwrap_or(0.0);
        let lon = f.location.as_ref().map(|l| l.lon).unwrap_or(0.0);
        let sd = f.location.as_ref().map(|l| l.sd).unwrap_or(0.0);
        let loc = json!({ "lat": lat, "lon": lon, "sd": sd });
        let ts = chrono::DateTime::from_timestamp_millis(f.timestamp)
            .map(|dt| dt.naive_utc())
            .unwrap_or(now);
        let created = chrono::DateTime::from_timestamp_millis(f.created_at)
            .map(|dt| dt.naive_utc())
            .unwrap_or(ts);

        let _ = sqlx::query(
            r#"INSERT INTO "Fod" (
                "id", "missionId", "groupId", "sysid", "location", "confidence",
                "class", "velocity", "size", "timestamp", "createdAt", "updatedAt", "dirty"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
            ON CONFLICT ("id") DO UPDATE SET
                "location" = EXCLUDED."location",
                "confidence" = EXCLUDED."confidence",
                "class" = EXCLUDED."class",
                "velocity" = EXCLUDED."velocity",
                "size" = EXCLUDED."size",
                "updatedAt" = $12"#,
        )
        .bind(&f.id)
        .bind(f.mission_id)
        .bind(f.group_id as i32)
        .bind(if f.sysid.is_empty() { None } else { Some(&f.sysid) })
        .bind(loc)
        .bind(f.confidence)
        .bind(if f.class_name.is_empty() { None } else { Some(&f.class_name) })
        .bind(f.velocity)
        .bind(f.size)
        .bind(ts)
        .bind(created)
        .bind(now)
        .execute(&s.db)
        .await;

        let m_str = f.mission_id.to_string();
        let g_str = f.group_id.to_string();
        if !f.frame_jpeg.is_empty() {
            if crate::imagewriter::write_fod_jpeg(&m_str, &g_str, &f.id, &f.frame_jpeg).await.is_ok() {
                restored_frames += 1;
            }
        } else if !f.image_sha256.is_empty() {
            if let Some(bytes) = svc::fetch_image_prefer_atc(s, &f.image_sha256).await {
                if crate::imagewriter::write_fod_jpeg(&m_str, &g_str, &f.id, &bytes).await.is_ok() {
                    restored_frames += 1;
                }
            }
        }
    }

    let mut restored_cleared = 0usize;
    for gid in cleared_group_ids {
        if let Some(cf) = svc::fetch_cleared_fod_prefer_atc(s, mission_id, gid).await {
            let status_str = match proto_defination::common::ClearedFodStatus::try_from(cf.status) {
                Ok(proto_defination::common::ClearedFodStatus::NotFound) => "not_found",
                Ok(proto_defination::common::ClearedFodStatus::FalsePositive) => "false_positive",
                _ => "found",
            };
            let loc = cf
                .location
                .map(|l| json!({ "lat": l.lat, "lon": l.lon, "sd": l.sd }))
                .unwrap_or_else(|| json!({}));
            let created = chrono::DateTime::from_timestamp_millis(cf.created_at)
                .map(|dt| dt.naive_utc())
                .unwrap_or(now);
            let _ = sqlx::query(
                r#"INSERT INTO "ClearedFod"
                   ("id","status","beforeClearImg","afterClearImg","location","groupId","missionId","createdAt","updatedAt","createdBy","updatedBy","dirty")
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false)
                   ON CONFLICT ("groupId","missionId") DO NOTHING"#,
            )
            .bind(&cf.id)
            .bind(status_str)
            .bind(sqlx::types::Json(&cf.before_image_sha256))
            .bind(sqlx::types::Json(&cf.after_image_sha256))
            .bind(loc)
            .bind(cf.group_id as i32)
            .bind(cf.mission_id)
            .bind(created)
            .bind(now)
            .bind(cf.created_by.as_deref())
            .bind(cf.created_by.as_deref())
            .execute(&s.db)
            .await;

            for sha in cf.before_image_sha256.iter().chain(cf.after_image_sha256.iter()) {
                if !sha.is_empty() {
                    let cached = std::path::Path::new("fod-images/mission").join(format!("{sha}.jpg"));
                    if !cached.exists() {
                        if let Some(bytes) = svc::fetch_image_prefer_atc(s, sha).await {
                            if let Some(parent) = cached.parent() {
                                let _ = tokio::fs::create_dir_all(parent).await;
                            }
                            let _ = tokio::fs::write(&cached, &bytes).await;
                        }
                    }
                }
            }
            restored_cleared += 1;
        }
    }

    Ok(json!({
        "success": true,
        "missionId": mission_id,
        "restoredGroups": groups.len(),
        "restoredFods": fods.len(),
        "restoredCleared": restored_cleared,
        "restoredFrames": restored_frames,
    }))
}

async fn local_reimport(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Invalid mission ID" }));
    };

    match reimport_mission_locally(&s, mission_id).await {
        Ok(res) => (StatusCode::OK, Json(res)).into_response(),
        Err(e) => err_json(StatusCode::CONFLICT, json!({ "error": e.to_string() })),
    }
}

async fn atc_cold_store(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Invalid mission ID" }));
    };
    let body = parse_body(&bytes);
    let force_drop_car = body
        .get("forceDropCar")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    // Push any local dirty changes to Car/ATC first
    let _ = crate::scheduler::resolve_fod_group(&s).await;

    match svc::atc_cold_store_mission(&s, mission_id, force_drop_car).await {
        Ok(res) => {
            // Completely drop the cold-stored mission from this desktop instance as well
            let _ = crate::scheduler::drop_cold_stored_mission_locally(&s, mission_id).await;

            (
                StatusCode::OK,
                Json(json!({
                    "success": res.success,
                    "message": res.message,
                    "archiveSizeBytes": res.archive_size_bytes,
                    "archiveSha256": res.archive_sha256,
                    "bytesFreed": res.bytes_freed,
                })),
            )
                .into_response()
        }
        Err(e) => err_json(StatusCode::CONFLICT, json!({ "error": e.to_string() })),
    }
}

async fn atc_restore(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Invalid mission ID" }));
    };
    let body = parse_body(&bytes);
    let reimport_local = body
        .get("reimportLocal")
        .and_then(Value::as_bool)
        .unwrap_or(false);

    match svc::atc_restore_cold_mission(&s, mission_id).await {
        Ok(res) => {
            let new_epoch = res.mission.as_ref().map(|m| m.storage_epoch).unwrap_or(2);
            let display_id = res.mission.as_ref().and_then(|m| m.display_id);
            let timer = res.mission.as_ref().map(|m| m.timer as f64).unwrap_or(0.0);
            let speed = res.mission.as_ref().and_then(|m| m.speed);
            let pass = res.mission.as_ref().and_then(|m| m.pass);
            let created_at = res
                .mission
                .as_ref()
                .and_then(|m| chrono::DateTime::from_timestamp_millis(m.created_at))
                .map(|dt| dt.naive_utc())
                .unwrap_or_else(svc::now_naive);

            let _ = sqlx::query(
                r#"INSERT INTO "Mission" ("id","displayId","status","timer","scanStatus","speed","pass","localEvicted","storageTier","storageEpoch","coldStoredAt","createdAt","updatedAt")
                   VALUES ($1,$2,'TERMINATED',$3,'PAUSE',$4,$5,$6,'HOT',$7,NULL,$8,$9)
                   ON CONFLICT ("id") DO UPDATE SET
                       "storageTier" = 'HOT',
                       "storageEpoch" = MAX(COALESCE("Mission"."storageEpoch", 1), EXCLUDED."storageEpoch"),
                       "coldStoredAt" = NULL,
                       "updatedAt" = EXCLUDED."updatedAt""#,
            )
            .bind(mission_id)
            .bind(display_id)
            .bind(timer)
            .bind(speed)
            .bind(pass)
            .bind(!reimport_local)
            .bind(new_epoch)
            .bind(created_at)
            .bind(svc::now_naive())
            .execute(&s.db)
            .await;

            let local_res = if reimport_local {
                reimport_mission_locally(&s, mission_id).await.ok()
            } else {
                None
            };

            (
                StatusCode::OK,
                Json(json!({
                    "success": res.success,
                    "message": res.message,
                    "restoredGroups": res.restored_groups,
                    "restoredFods": res.restored_fods,
                    "restoredFrames": res.restored_frames,
                    "localReimport": local_res,
                })),
            )
                .into_response()
        }
        Err(e) => err_json(StatusCode::CONFLICT, json!({ "error": e.to_string() })),
    }
}

async fn car_drop(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Invalid mission ID" }));
    };
    let epoch: i64 = sqlx::query_scalar(
        r#"SELECT COALESCE("storageEpoch", 1) FROM "Mission" WHERE "id" = $1"#,
    )
    .bind(mission_id)
    .fetch_optional(&s.db)
    .await
    .ok()
    .flatten()
    .unwrap_or(1);

    match svc::atc_drop_car_hot_data(&s, mission_id, epoch + 1).await {
        Ok(res) => (
            StatusCode::OK,
            Json(json!({
                "success": res.success,
                "message": res.message,
                "bytesFreed": res.bytes_freed,
                "framesRemoved": res.frames_removed,
            })),
        )
            .into_response(),
        Err(e) => err_json(StatusCode::CONFLICT, json!({ "error": e.to_string() })),
    }
}

async fn build_local_archive_bytes(s: &AppState, mission_id: i64) -> anyhow::Result<Vec<u8>> {
    let mission: Mission = sqlx::query_as(r#"SELECT * FROM "Mission" WHERE "id" = $1"#)
        .bind(mission_id)
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| anyhow::anyhow!("Mission {mission_id} not found locally"))?;

    let groups: Vec<FodGroup> =
        sqlx::query_as(r#"SELECT * FROM "FodGroup" WHERE "missionId" = $1"#)
            .bind(mission_id)
            .fetch_all(&s.db)
            .await?;
    let fods: Vec<Fod> = sqlx::query_as(r#"SELECT * FROM "Fod" WHERE "missionId" = $1"#)
        .bind(mission_id)
        .fetch_all(&s.db)
        .await?;
    let cleared: Vec<ClearedFod> =
        sqlx::query_as(r#"SELECT * FROM "ClearedFod" WHERE "missionId" = $1"#)
            .bind(mission_id)
            .fetch_all(&s.db)
            .await?;

    let mut frames = std::collections::BTreeMap::new();
    let mut frame_bytes = 0u64;
    for f in &fods {
        let p = std::path::Path::new("fod-images/mission")
            .join(mission_id.to_string())
            .join(f.group_id.to_string())
            .join(format!("{}.jpg", f.id));
        if let Ok(bytes) = tokio::fs::read(&p).await {
            let sha = crate::archive::sha256_hex(&bytes);
            frame_bytes += bytes.len() as u64;
            frames.insert(sha, bytes);
        }
    }
    for c in &cleared {
        for sha in c.before_clear_img.iter().chain(c.after_clear_img.iter()) {
            if !sha.is_empty() && !frames.contains_key(sha) {
                let p = std::path::Path::new("fod-images/mission").join(format!("{sha}.jpg"));
                if let Ok(bytes) = tokio::fs::read(&p).await {
                    frame_bytes += bytes.len() as u64;
                    frames.insert(sha.clone(), bytes);
                }
            }
        }
    }

    // Serialize into backend-compatible JSON shapes
    let mission_json = serde_json::to_vec_pretty(&json!({
        "id": mission.id,
        "status": mission.status,
        "timer": mission.timer.round() as i64,
        "scan_status": mission.scan_status,
        "speed": mission.speed,
        "pass": mission.pass,
        "created_at": format!("{}Z", mission.created_at.format("%Y-%m-%dT%H:%M:%S%.3f")),
        "updated_at": format!("{}Z", mission.updated_at.format("%Y-%m-%dT%H:%M:%S%.3f")),
        "created_by": mission.created_by,
        "updated_by": mission.updated_by,
        "display_id": mission.display_id,
        "storage_tier": "HOT",
        "storage_epoch": mission.storage_epoch.unwrap_or(1),
    }))?;

    let groups_val: Vec<Value> = groups
        .iter()
        .map(|g| {
            let vv: Value = g
                .version_vector
                .as_deref()
                .and_then(|s| serde_json::from_str(s).ok())
                .unwrap_or_else(|| json!({}));
            json!({
                "id": 0,
                "mission_id": g.mission_id,
                "group_id": g.group_id as i64,
                "status": g.status,
                "version": g.version.unwrap_or(0),
                "biggest_fod": g.biggest_fod_id,
                "biggest_fod_size": g.biggest_fod_size.map(|v| v as f64),
                "created_at": format!("{}Z", g.created_at.format("%Y-%m-%dT%H:%M:%S%.3f")),
                "updated_at": format!("{}Z", g.updated_at.format("%Y-%m-%dT%H:%M:%S%.3f")),
                "vv": vv,
                "decided_at_ms": g.decided_at_ms.unwrap_or(0),
                "updated_by": g.updated_by.as_deref().unwrap_or(""),
                "dirty": false,
            })
        })
        .collect();
    let fod_groups_json = serde_json::to_vec_pretty(&groups_val)?;

    let fods_val: Vec<Value> = fods
        .iter()
        .map(|f| {
            let p = std::path::Path::new("fod-images/mission")
                .join(mission_id.to_string())
                .join(f.group_id.to_string())
                .join(format!("{}.jpg", f.id));
            let img_meta = std::fs::read(&p).ok().map(|b| (crate::archive::sha256_hex(&b), b.len() as i32));
            let loc = &f.location;
            let lat = loc.get("lat").and_then(Value::as_f64).unwrap_or(0.0);
            let lon = loc.get("lon").and_then(Value::as_f64).unwrap_or(0.0);
            let sd = loc.get("sd").and_then(Value::as_f64).unwrap_or(0.0);
            json!({
                "id": f.id,
                "mission_id": f.mission_id,
                "group_id": f.group_id as i64,
                "sysid": f.sysid,
                "cam_id": Value::Null,
                "lat": lat,
                "lon": lon,
                "sd": sd,
                "confidence": f.confidence,
                "class": f.class,
                "velocity": f.velocity,
                "size": f.size,
                "image_sha256": img_meta.as_ref().map(|x| x.0.clone()),
                "image_size": img_meta.as_ref().map(|x| x.1),
                "frame_missing": img_meta.is_none(),
                "captured_at": format!("{}Z", f.timestamp.format("%Y-%m-%dT%H:%M:%S%.3f")),
                "created_at": format!("{}Z", f.created_at.format("%Y-%m-%dT%H:%M:%S%.3f")),
            })
        })
        .collect();
    let fods_json = serde_json::to_vec_pretty(&fods_val)?;

    let cleared_val: Vec<Value> = cleared
        .iter()
        .map(|c| {
            let lat = c.location.get("lat").and_then(Value::as_f64).unwrap_or(0.0);
            let lon = c.location.get("lon").and_then(Value::as_f64).unwrap_or(0.0);
            let sd = c.location.get("sd").and_then(Value::as_f64).unwrap_or(0.0);
            json!({
                "id": c.id,
                "mission_id": c.mission_id,
                "group_id": c.group_id as i64,
                "status": c.status,
                "before_image_sha256": c.before_clear_img,
                "after_image_sha256": c.after_clear_img,
                "lat": lat,
                "lon": lon,
                "sd": sd,
                "created_at": format!("{}Z", c.created_at.format("%Y-%m-%dT%H:%M:%S%.3f")),
                "created_by": c.created_by,
            })
        })
        .collect();
    let cleared_fods_json = serde_json::to_vec_pretty(&cleared_val)?;
    let group_actions_json = b"[]".to_vec();

    let bundle_sha256 = crate::archive::compute_bundle_sha256(
        &mission_json,
        &fod_groups_json,
        &fods_json,
        &cleared_fods_json,
        &group_actions_json,
        &frames,
    );

    let bundle = crate::archive::MissionArchiveBundle {
        manifest: crate::archive::ArchiveManifest {
            format_version: crate::archive::ARCHIVE_FORMAT_VERSION,
            mission_id: mission.id,
            display_id: mission.display_id,
            exported_at_ms: chrono::Utc::now().timestamp_millis(),
            origin_node: "desktop-local".to_string(),
            group_count: groups.len(),
            fod_count: fods.len(),
            cleared_count: cleared.len(),
            action_count: 0,
            frame_count: frames.len(),
            frame_bytes,
            bundle_sha256,
        },
        mission_json,
        fod_groups_json,
        fods_json,
        cleared_fods_json,
        group_actions_json,
        frames,
    };

    tokio::task::spawn_blocking(move || crate::archive::encode_archive_bytes(&bundle)).await?
}

async fn archive_export(
    method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let Some(mission_id) = svc::js_parse_int(&id) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Invalid mission ID" }));
    };
    let body = parse_body(&bytes);
    let dest_path = body
        .get("path")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .map(std::path::PathBuf::from);
    let source = body
        .get("source")
        .and_then(Value::as_str)
        .unwrap_or("atc");

    let archive_bytes = if source == "local" {
        match build_local_archive_bytes(&s, mission_id).await {
            Ok(b) => b,
            Err(e) => return err_json(StatusCode::BAD_REQUEST, json!({ "error": e.to_string() })),
        }
    } else {
        match svc::export_mission_archive_from_upstream(&s, mission_id).await {
            Ok((_fname, b)) => b,
            Err(upstream_err) => match build_local_archive_bytes(&s, mission_id).await {
                Ok(b) => b,
                Err(_) => {
                    return err_json(
                        StatusCode::BAD_GATEWAY,
                        json!({ "error": format!("Archive export failed: {upstream_err}") }),
                    );
                }
            },
        }
    };

    let target = match dest_path {
        Some(p) => p,
        None => {
            let dir = std::path::PathBuf::from("fod-images/exports");
            let _ = tokio::fs::create_dir_all(&dir).await;
            dir.join(format!("mission-{mission_id}.zoidpack"))
        }
    };

    if let Some(parent) = target.parent() {
        let _ = tokio::fs::create_dir_all(parent).await;
    }
    if let Err(e) = tokio::fs::write(&target, &archive_bytes).await {
        return err500(&format!("Failed to write archive to disk: {e}"));
    }

    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "missionId": mission_id,
            "path": target.to_string_lossy(),
            "sizeBytes": archive_bytes.len(),
        })),
    )
        .into_response()
}

async fn archive_import(
    method: Method,
    State(s): State<AppState>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("POST"));
    }
    let body = parse_body(&bytes);
    let Some(path_str) = body.get("path").and_then(Value::as_str).map(str::trim).filter(|p| !p.is_empty()) else {
        return err_json(StatusCode::BAD_REQUEST, json!({ "error": "Archive file path is required" }));
    };
    let target = body
        .get("target")
        .and_then(Value::as_str)
        .unwrap_or("atc");
    let import_local_after_atc = body
        .get("reimportLocal")
        .and_then(Value::as_bool)
        .unwrap_or(true);

    let file_path = std::path::PathBuf::from(path_str);
    let raw = match tokio::fs::read(&file_path).await {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode::BAD_REQUEST, json!({ "error": format!("Failed to read archive file: {e}") })),
    };

    if target == "local" {
        let bundle = match tokio::task::spawn_blocking(move || crate::archive::decode_archive_bytes(&raw)).await {
            Ok(Ok(b)) => b,
            Ok(Err(e)) => return err_json(StatusCode::BAD_REQUEST, json!({ "error": format!("Invalid archive: {e}") })),
            Err(e) => return err500(&e.to_string()),
        };
        let mission_val: Value = match serde_json::from_slice(&bundle.mission_json) {
            Ok(v) => v,
            Err(e) => return err_json(StatusCode::BAD_REQUEST, json!({ "error": format!("Invalid mission.json: {e}") })),
        };
        let groups_val: Vec<Value> = serde_json::from_slice(&bundle.fod_groups_json).unwrap_or_default();
        let fods_val: Vec<Value> = serde_json::from_slice(&bundle.fods_json).unwrap_or_default();
        let cleared_val: Vec<Value> = serde_json::from_slice(&bundle.cleared_fods_json).unwrap_or_default();

        let mission_id = bundle.manifest.mission_id;
        let now = svc::now_naive();
        let created_at = mission_val
            .get("created_at")
            .or_else(|| mission_val.get("createdAt"))
            .and_then(svc::parse_js_date)
            .unwrap_or(now);
        let timer = mission_val.get("timer").and_then(Value::as_f64).unwrap_or(0.0);
        let speed = mission_val.get("speed").and_then(Value::as_i64).map(|v| v as i32);
        let pass = mission_val.get("pass").and_then(Value::as_i64).map(|v| v as i32);
        let display_id = mission_val
            .get("display_id")
            .or_else(|| mission_val.get("displayId"))
            .and_then(Value::as_i64)
            .or(bundle.manifest.display_id);

        let _ = sqlx::query(
            r#"INSERT INTO "Mission" ("id","displayId","status","timer","scanStatus","speed","pass","localEvicted","storageTier","createdAt","updatedAt")
               VALUES ($1,$2,'TERMINATED',$3,'PAUSE',$4,$5,0,'HOT',$6,$7)
               ON CONFLICT ("id") DO UPDATE SET
                 "localEvicted" = 0,
                 "storageTier" = 'HOT',
                 "displayId" = COALESCE(EXCLUDED."displayId", "Mission"."displayId"),
                 "updatedAt" = EXCLUDED."updatedAt""#,
        )
        .bind(mission_id)
        .bind(display_id)
        .bind(timer)
        .bind(speed)
        .bind(pass)
        .bind(created_at)
        .bind(now)
        .execute(&s.db)
        .await;

        for g in &groups_val {
            let gid = g.get("group_id").or_else(|| g.get("groupId")).and_then(Value::as_i64).unwrap_or(0) as i32;
            let st = g.get("status").and_then(Value::as_str).unwrap_or("NEW");
            let ver = g.get("version").and_then(Value::as_i64).unwrap_or(0);
            let vv = g.get("vv").or_else(|| g.get("versionVector")).map(|v| v.to_string()).unwrap_or_else(|| "{}".to_string());
            let decided_at = g.get("decided_at_ms").or_else(|| g.get("decidedAtMs")).and_then(Value::as_i64).unwrap_or(0);
            let updated_by = g.get("updated_by").or_else(|| g.get("updatedBy")).and_then(Value::as_str).unwrap_or("");
            let bfod = g.get("biggest_fod").or_else(|| g.get("biggestFodId")).and_then(Value::as_str);
            let bsize = g.get("biggest_fod_size").or_else(|| g.get("biggestFodSize")).and_then(Value::as_f64).map(|v| v as i32);
            let _ = sqlx::query(
                r#"INSERT INTO "FodGroup" ("id","groupId","missionId","dirty","status","version","versionVector","decidedAtMs","updatedBy","biggestFodId","biggestFodSize","createdAt","updatedAt")
                   VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9,$10,$11,$11)
                   ON CONFLICT ("missionId","groupId") DO NOTHING"#,
            )
            .bind(uuid::Uuid::new_v4().to_string())
            .bind(gid)
            .bind(mission_id)
            .bind(st)
            .bind(ver)
            .bind(&vv)
            .bind(decided_at)
            .bind(updated_by)
            .bind(bfod)
            .bind(bsize)
            .bind(now)
            .execute(&s.db)
            .await;
        }

        let mut restored_frames = 0usize;
        for f in &fods_val {
            let fid = f.get("id").and_then(Value::as_str).unwrap_or("");
            if fid.is_empty() {
                continue;
            }
            let gid = f.get("group_id").or_else(|| f.get("groupId")).and_then(Value::as_i64).unwrap_or(0) as i32;
            let lat = f.get("lat").and_then(Value::as_f64).unwrap_or(0.0);
            let lon = f.get("lon").and_then(Value::as_f64).unwrap_or(0.0);
            let sd = f.get("sd").and_then(Value::as_f64).unwrap_or(0.0);
            let loc = json!({ "lat": lat, "lon": lon, "sd": sd });
            let ts = f.get("captured_at").or_else(|| f.get("timestamp")).and_then(svc::parse_js_date).unwrap_or(now);
            let _ = sqlx::query(
                r#"INSERT INTO "Fod" ("id","missionId","groupId","sysid","location","confidence","class","velocity","size","timestamp","createdAt","updatedAt","dirty")
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11,false)
                   ON CONFLICT ("id") DO NOTHING"#,
            )
            .bind(fid)
            .bind(mission_id)
            .bind(gid)
            .bind(f.get("sysid").and_then(Value::as_str))
            .bind(loc)
            .bind(f.get("confidence").and_then(Value::as_f64))
            .bind(f.get("class").and_then(Value::as_str))
            .bind(f.get("velocity").and_then(Value::as_f64).unwrap_or(0.0))
            .bind(f.get("size").and_then(Value::as_f64).unwrap_or(0.0))
            .bind(ts)
            .bind(now)
            .execute(&s.db)
            .await;

            if let Some(sha) = f.get("image_sha256").and_then(Value::as_str) {
                if let Some(img_bytes) = bundle.frames.get(sha) {
                    if crate::imagewriter::write_fod_jpeg(&mission_id.to_string(), &gid.to_string(), fid, img_bytes).await.is_ok() {
                        restored_frames += 1;
                    }
                }
            }
        }

        for c in &cleared_val {
            let cid = c.get("id").and_then(Value::as_str).unwrap_or("");
            let gid = c.get("group_id").or_else(|| c.get("groupId")).and_then(Value::as_i64).unwrap_or(0) as i32;
            let st = c.get("status").and_then(Value::as_str).unwrap_or("found");
            let before: Vec<String> = c.get("before_image_sha256").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            let after: Vec<String> = c.get("after_image_sha256").and_then(Value::as_array).map(|a| a.iter().filter_map(|v| v.as_str().map(str::to_string)).collect()).unwrap_or_default();
            let lat = c.get("lat").and_then(Value::as_f64).unwrap_or(0.0);
            let lon = c.get("lon").and_then(Value::as_f64).unwrap_or(0.0);
            let sd = c.get("sd").and_then(Value::as_f64).unwrap_or(0.0);
            let _ = sqlx::query(
                r#"INSERT INTO "ClearedFod" ("id","status","beforeClearImg","afterClearImg","location","groupId","missionId","createdAt","updatedAt","dirty")
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,false)
                   ON CONFLICT ("groupId","missionId") DO NOTHING"#,
            )
            .bind(cid)
            .bind(st)
            .bind(sqlx::types::Json(&before))
            .bind(sqlx::types::Json(&after))
            .bind(json!({ "lat": lat, "lon": lon, "sd": sd }))
            .bind(gid)
            .bind(mission_id)
            .bind(now)
            .execute(&s.db)
            .await;

            for sha in before.iter().chain(after.iter()) {
                if let Some(img_bytes) = bundle.frames.get(sha) {
                    let cached = std::path::Path::new("fod-images/mission").join(format!("{sha}.jpg"));
                    if let Some(parent) = cached.parent() {
                        let _ = tokio::fs::create_dir_all(parent).await;
                    }
                    let _ = tokio::fs::write(&cached, img_bytes).await;
                }
            }
        }

        return (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "target": "local",
                "missionId": mission_id,
                "restoredGroups": groups_val.len(),
                "restoredFods": fods_val.len(),
                "restoredFrames": restored_frames,
                "message": format!("Imported mission #{} locally from archive", display_id.unwrap_or(mission_id)),
            })),
        )
            .into_response();
    }

    // Default target: import onto ATC and distribute to fleet
    let filename = file_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("mission.zoidpack")
        .to_string();
    match svc::import_mission_archive_to_atc(&s, filename, raw, true).await {
        Ok(res) => {
            if let Some(ref m) = res.mission {
                let _ = sqlx::query(
                    r#"INSERT INTO "Mission" ("id","displayId","status","timer","scanStatus","localEvicted","storageTier","storageEpoch","createdAt","updatedAt")
                       VALUES ($1,$2,'TERMINATED',$3,'PAUSE',0,'HOT',$4,$5,$5)
                       ON CONFLICT ("id") DO UPDATE SET
                         "storageTier" = 'HOT',
                         "storageEpoch" = MAX(COALESCE("Mission"."storageEpoch", 1), EXCLUDED."storageEpoch"),
                         "coldStoredAt" = NULL,
                         "updatedAt" = EXCLUDED."updatedAt""#,
                )
                .bind(m.id)
                .bind(m.display_id)
                .bind(m.timer as f64)
                .bind(m.storage_epoch)
                .bind(svc::now_naive())
                .execute(&s.db)
                .await;

                if import_local_after_atc {
                    let _ = reimport_mission_locally(&s, m.id).await;
                }
            }
            (
                StatusCode::OK,
                Json(json!({
                    "success": res.success,
                    "target": "atc",
                    "missionId": res.mission.as_ref().map(|m| m.id),
                    "restoredGroups": res.restored_groups,
                    "restoredFods": res.restored_fods,
                    "restoredFrames": res.restored_frames,
                    "message": res.message,
                })),
            )
                .into_response()
        }
        Err(e) => err_json(StatusCode::BAD_GATEWAY, json!({ "error": e.to_string() })),
    }
}
