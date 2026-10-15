//! Cleared-FOD routes — OWNED BY AGENT R1.
//! Port of src/pages/api/cleared-fod/response.ts.

use axum::extract::{Query, State};
use axum::http::{Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::{Json, Router};
use serde_json::json;
use std::collections::HashMap;

use super::mission::{err_json, mna};
use crate::models::ClearedFod;
use crate::services as svc;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/response", any(response))
}

// ---------------------------------------------------------------------------
// GET /api/cleared-fod/response?groupId=&missionId=
// ---------------------------------------------------------------------------
async fn response(
    method: Method,
    State(s): State<AppState>,
    Query(q): Query<HashMap<String, String>>,
) -> Response {
    if method != Method::GET {
        return mna(&method, Some("GET"));
    }
    let group_id = q
        .get("groupId")
        .and_then(|v| svc::js_parse_int(v))
        .and_then(|v| i32::try_from(v).ok());
    let mission_id = q
        .get("missionId")
        .and_then(|v| svc::js_parse_int(v));
    let (Some(group_id), Some(mission_id)) = (group_id, mission_id) else {
        // parseInt NaN → Prisma validation error → catch → 500 {error}.
        return err_json(
            StatusCode::INTERNAL_SERVER_ERROR,
            json!({ "error": "Failed to retrieve cleared response" }),
        );
    };
    let row: Result<Option<ClearedFod>, sqlx::Error> = sqlx::query_as(
        "SELECT * FROM \"ClearedFod\" WHERE \"missionId\" = $1 AND \"groupId\" = $2 LIMIT 1",
    )
    .bind(mission_id)
    .bind(group_id)
    .fetch_optional(&s.db)
    .await;
    match row {
        Ok(Some(cleared)) => (StatusCode::OK, Json(cleared)).into_response(),
        // Node: no record → res.status(500).send({})
        Ok(None) => (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({}))).into_response(),
        Err(e) => {
            tracing::error!("{e}");
            err_json(
                StatusCode::INTERNAL_SERVER_ERROR,
                json!({ "error": "Failed to retrieve cleared response" }),
            )
        }
    }
}
