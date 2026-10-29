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
    if let Ok(Some(cleared)) = row {
        return (StatusCode::OK, Json(cleared)).into_response();
    }

    // Try fetching from Car/ATC gRPC ClearedFodService
    if let Some(mut client) = svc::connect_cleared_fod_client(&s).await {
        if let Ok(resp) = client.find_cleared_fod(tonic::Request::new(
            proto_defination::cleared_fod::FindClearedFodRequest {
                mission_id,
                group_id: group_id as i64,
            }
        )).await {
            let entity = resp.into_inner();
            let before_img = entity.before_image_sha256;
            let after_img = entity.after_image_sha256;
            let lat = entity.location.as_ref().map(|l| l.lat).unwrap_or(0.0);
            let lon = entity.location.as_ref().map(|l| l.lon).unwrap_or(0.0);
            let sd = entity.location.as_ref().map(|l| l.sd).unwrap_or(0.0);
            let loc = json!({ "lat": lat, "lon": lon, "sd": sd });
            let created = chrono::DateTime::from_timestamp_millis(entity.created_at)
                .map(|dt| dt.naive_utc())
                .unwrap_or_else(svc::now_naive);
            let st = match proto_defination::common::ClearedFodStatus::try_from(entity.status) {
                Ok(proto_defination::common::ClearedFodStatus::Found) => crate::models::ClearedFodStatus::Found,
                Ok(proto_defination::common::ClearedFodStatus::NotFound) => crate::models::ClearedFodStatus::NotFound,
                _ => crate::models::ClearedFodStatus::Found,
            };
            let created_by = entity.created_by;

            let _ = sqlx::query(
                r#"INSERT INTO "ClearedFod" ("id", "missionId", "groupId", "status", "beforeClearImg", "afterClearImg", "location", "createdAt", "updatedAt", "createdBy", "dirty")
                   VALUES ($1, $2, $3, $4::"ClearedFodStatus", $5, $6, $7, $8, now(), $9, false)
                   ON CONFLICT ("groupId", "missionId") DO NOTHING"#
            )
            .bind(&entity.id)
            .bind(mission_id)
            .bind(group_id)
            .bind(format!("{st:?}").to_uppercase())
            .bind(&before_img)
            .bind(&after_img)
            .bind(&loc)
            .bind(created)
            .bind(&created_by)
            .execute(&s.db)
            .await;

            return (StatusCode::OK, Json(ClearedFod {
                id: entity.id,
                status: st,
                before_clear_img: before_img,
                after_clear_img: after_img,
                location: loc,
                group_id,
                mission_id,
                created_at: created,
                updated_at: created,
                created_by,
                updated_by: None,
                dirty: Some(false),
            })).into_response();
        }
    }

    (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({}))).into_response()
}
