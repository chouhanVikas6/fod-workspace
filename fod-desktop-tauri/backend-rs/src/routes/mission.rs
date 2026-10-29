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
        Some(v) if svc::js_truthy(&v) => (StatusCode::OK, Json(v)).into_response(),
        _ => match sqlx::query_as::<_, Mission>("SELECT * FROM \"Mission\"")
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
         COUNT(fg.id) AS "total"
       FROM "Mission" m
       LEFT JOIN "FodGroup" fg ON m.id = fg."missionId"
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
    let mut out: Vec<Value> = Vec::with_capacity(rows.len());
    for row in rows {
        let mission = match Mission::from_row(&row) {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("{e}");
                return err500("Failed to retrieve missions");
            }
        };
        let mut v = svc::to_value(&mission);
        let o = v.as_object_mut().unwrap();
        for key in ["accepted", "rejected", "cleared", "newFodGroups", "total"] {
            let n: i64 = row.try_get(key).unwrap_or(0);
            o.insert(key.to_string(), json!(n));
        }
        o.insert("mission_id".to_string(), json!(mission.id));
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
                "UPDATE \"Mission\" SET \"scanStatus\" = $1::\"MissionScanStatus\", \"updatedAt\" = $2 WHERE \"status\" = 'ACTIVE'",
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
      SELECT DISTINCT ON ("f"."groupId")
            "f"."id",
            "f"."size",
            "f"."groupId",
            "f"."timestamp",
            "f"."location",
            "f"."class",
            "f"."velocity",
            "f"."sysid",
            "maxFod"."maxSize" AS "biggestSize",
            fg."status"::text AS "groupStatus"
        FROM
            Public."Fod" f
        INNER JOIN (
            SELECT
                "groupId",
                MAX("size") AS "maxSize"
            FROM
                Public."Fod"
            WHERE
                "missionId" = $1
            GROUP BY
                "groupId"
        ) AS "maxFod" ON f."groupId" = "maxFod"."groupId" AND f."size" = "maxFod"."maxSize"
        LEFT JOIN
            Public."FodGroup" fg ON f."groupId" = fg."groupId" AND f."missionId" = fg."missionId"
        WHERE
            f."missionId" = $1
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
        "SELECT \"scanStatus\"::text FROM \"Mission\" WHERE \"status\" = 'ACTIVE' LIMIT 1",
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
    let _ = sqlx::query("UPDATE \"Mission\" SET \"status\" = 'INACTIVE', \"scanStatus\" = 'PAUSE', \"updatedAt\" = $1 WHERE \"id\" = $2 OR \"status\" = 'ACTIVE'")
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
