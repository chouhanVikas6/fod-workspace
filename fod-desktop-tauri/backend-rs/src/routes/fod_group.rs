//! FOD-group routes — OWNED BY AGENT R1.
//! Port of src/pages/api/fod-group/** (+ src/services/fod-group.ts).

use axum::extract::{Path, Query, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::{Json, Router};
use serde_json::{json, Value};
use std::collections::HashMap;

use super::mission::{err_json, mna};
use crate::models::Fod;
use crate::services::{self as svc};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/count/{id}", any(count))
        .route("/list-fod/{id}", any(list_fod))
        .route("/update/{id}", any(update))
}

fn err500(msg: &str) -> Response {
    err_json(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": msg }))
}

// ---------------------------------------------------------------------------
// GET /api/fod-group/count/{id} — pages/api/fod-group/count/[id].ts
// ---------------------------------------------------------------------------
async fn count(method: Method, State(s): State<AppState>, Path(id): Path<String>) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let v = svc::api_to_main(
        &s,
        reqwest::Method::GET,
        &format!("/api/fod-group/group-count/{id}"),
        Some(json!({ "missionId": id })),
        None,
    )
    .await;
    match v {
        // Node dereferences groupCount.statusCode unguarded — a null apiToMain
        // result throws into the catch → 500 {error}.
        None => err500("Failed to retrieve fod group"),
        Some(m) => {
            if svc::loose_eq_200(m.get("statusCode")) {
                (StatusCode::OK, Json(m.get("data").cloned().unwrap_or(Value::Null)))
                    .into_response()
            } else {
                // res.status(500).send(0)
                (StatusCode::INTERNAL_SERVER_ERROR, Json(json!(0))).into_response()
            }
        }
    }
}

// ---------------------------------------------------------------------------
// GET /api/fod-group/list-fod/{id}?missionId= — pages/api/fod-group/list-fod/[id].ts
// ---------------------------------------------------------------------------
async fn list_fod(method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let mission_id_raw = q.get("missionId").cloned().unwrap_or_default();
    let (Some(group_id), Some(mission_id)) = (
        svc::js_parse_int(&id).and_then(|v| i32::try_from(v).ok()),
        svc::js_parse_int(&mission_id_raw),
    ) else {
        // parseInt NaN (or out of Int range) → Prisma validation error → catch.
        return err500("Failed to retrieve fod group");
    };

    let existing: Vec<Fod> = match sqlx::query_as(
        "SELECT * FROM \"Fod\" WHERE \"missionId\" = $1 AND \"groupId\" = $2",
    )
    .bind(mission_id)
    .bind(group_id)
    .fetch_all(&s.db)
    .await
    {
        Ok(rows) => rows,
        Err(e) => {
            tracing::error!("{e}");
            return err500("Failed to retrieve fod group");
        }
    };
    let excluded_ids: Vec<&str> = existing.iter().map(|f| f.id.as_str()).collect();

    let incoming = svc::api_to_main(
        &s,
        reqwest::Method::GET,
        "/api/fod/mission-group",
        Some(json!({
            "groupId": id,
            "missionId": mission_id_raw,
            "excludedIds": excluded_ids,
        })),
        None,
    )
    .await;

    let mut result: Vec<Value> = existing.iter().map(svc::to_value).collect();
    let incoming_truthy = incoming.as_ref().map(svc::js_truthy).unwrap_or(false);
    if incoming_truthy {
        let arr = match incoming.as_ref().unwrap().as_array() {
            Some(a) => a.clone(),
            // Node `[...incomingFods]` of a non-iterable → TypeError → catch.
            None => return err500("Failed to retrieve fod group"),
        };
        if let Some(first) = arr.first() {
            tracing::info!("incoming fod: {first}");
        }
        result.extend(arr.iter().cloned());
        // createFodBatch(incomingFods, missionId) — fire and forget in Node.
        let state = s.clone();
        tokio::spawn(async move {
            svc::create_fod_batch(&state, arr, mission_id as i64).await;
        });
    }

    // result.sort((a, b) => b.size - a.size)
    result.sort_by(|a, b| {
        let sa = a.get("size").and_then(|v| v.as_f64());
        let sb = b.get("size").and_then(|v| v.as_f64());
        match (sa, sb) {
            (Some(x), Some(y)) => y.partial_cmp(&x).unwrap_or(std::cmp::Ordering::Equal),
            _ => std::cmp::Ordering::Equal, // NaN comparator → treated as 0
        }
    });

    // `if (incomingFods)` — an empty upstream array is still truthy → 'backend'.
    let origin = if incoming_truthy { "backend" } else { "self" };
    (StatusCode::OK, Json(json!({ "data": result, "origin": origin }))).into_response()
}

// ---------------------------------------------------------------------------
// POST /api/fod-group/update/{id} — pages/api/fod-group/update/[id].ts
// body: { missionId, status } — updates status and marks the group dirty.
// ---------------------------------------------------------------------------
async fn update(method: Method,
    State(s): State<AppState>,
    Path(id): Path<String>,
    bytes: axum::body::Bytes,
) -> Response {
    if method != Method::POST {
        return mna(&method, Some("GET")); // sic (Node)
    }
    let body: Value = serde_json::from_slice(&bytes).unwrap_or_else(|_| json!({}));
    tracing::info!("fod-group update id={id} body={body}");
    // Prisma validation: missionId must be an Int, status a valid enum,
    // groupId parseInt(id); anything off → the catch → 500 {error}.
    let (Some(group_id), Some(mission_id)) = (
        svc::js_parse_int(&id).and_then(|v| i32::try_from(v).ok()),
        body.get("missionId").and_then(svc::json_integer),
    ) else {
        return err500("Failed to retrieve fod group");
    };
    let status = match body.get("status").and_then(|v| v.as_str()) {
        Some(st) if svc::FOD_GROUP_STATUS.contains(&st) => st.to_string(),
        _ => return err500("Failed to retrieve fod group"),
    };
    let updated: Result<Option<crate::models::FodGroup>, sqlx::Error> = sqlx::query_as(
        "UPDATE \"FodGroup\" SET \"status\" = $1::\"FodGroupStatus\", \"dirty\" = true, \"updatedAt\" = $2 WHERE \"groupId\" = $3 AND \"missionId\" = $4 RETURNING *",
    )
    .bind(&status)
    .bind(svc::now_naive())
    .bind(group_id)
    .bind(mission_id)
    .fetch_optional(&s.db)
    .await;
    match updated {
        // Missing row → Prisma P2025 throw → catch → 500 (the Node 402 branch
        // is unreachable).
        Ok(Some(g)) => {
            let state = s.clone();
            tokio::spawn(async move {
                let _ = crate::scheduler::resolve_fod_group(&state).await;
            });
            (StatusCode::OK, Json(g)).into_response()
        }
        Ok(None) => err500("Failed to retrieve fod group"),
        Err(e) => {
            tracing::error!("{e}");
            err500("Failed to retrieve fod group")
        }
    }
}
