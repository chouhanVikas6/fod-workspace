//! Router assembly. This file is FROZEN — every API path from the migration
//! plan Appendix A is pre-mounted; agents implement handlers inside their own
//! route modules and refine methods there (stubs use `any()`).

pub mod auth;
pub mod camera_feed;
pub mod cleared_fod;
pub mod command;
pub mod fod_group;
pub mod health;
pub mod mission;

use axum::extract::{Path, State};
use axum::http::{header, StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde_json::json;

use crate::error::ApiError;
use crate::state::AppState;

pub fn app_router(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(healthz))
        .nest("/api/auth", auth::router())
        .nest("/api/mission", mission::router())
        .nest("/api/camera-feed", camera_feed::router())
        .nest("/api/cleared-fod", cleared_fod::router())
        .nest("/api/command", command::router())
        .nest("/api/fod-group", fod_group::router())
        .nest("/api/health", health::router())
        .route("/api/sse/health-data", get(crate::realtime::sse::health_data))
        .route(
            "/api/sse/retrive-data",
            get(crate::realtime::sse::retrive_data),
        )
        .route("/images/{*path}", get(images))
        .fallback(fallback_404)
        .with_state(state)
}

async fn healthz(State(s): State<AppState>) -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "version": env!("CARGO_PKG_VERSION"),
        "port": s.cfg.gui_server_port,
        "startedBy": s.started_by.as_str(),
    }))
}

/// Serves FOD images: first looks under ./fod-images/mission/{path},
/// and if not found, retrieves the frame on-demand from the Car backend
/// and caches it locally under ./fod-images/mission/{path}.
async fn images(State(state): State<AppState>, Path(path): Path<String>) -> Response {
    if path.contains("..") {
        return StatusCode::NOT_FOUND.into_response();
    }
    let file = std::path::Path::new("fod-images/mission").join(&path);
    if let Ok(bytes) = tokio::fs::read(&file).await {
        return ([(header::CONTENT_TYPE, "image/jpeg")], bytes).into_response();
    }

    // On-demand fetch from Car backend: path format is "<mission>/<group>/<fod>.jpg"
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() >= 3 {
        let mission_seg = parts[0];
        let group_seg = parts[1];
        let fod_seg = parts[2].trim_end_matches(".jpg");

        if let Some(fod) = crate::services::fetch_fod_from_car(&state, fod_seg).await {
            if !fod.image_sha256.is_empty() {
                if let Some(bytes) = crate::services::fetch_image_from_car(&state, &fod.image_sha256, false).await {
                    let _ = crate::imagewriter::write_fod_jpeg(mission_seg, group_seg, fod_seg, &bytes).await;
                    return ([(header::CONTENT_TYPE, "image/jpeg")], bytes).into_response();
                }
            }
        }
    }

    StatusCode::NOT_FOUND.into_response()
}

/// Parity with mainApiRouter's unknown-route response.
async fn fallback_404(uri: Uri) -> ApiError {
    ApiError::new(404, json!({ "error": format!("Not Found: {uri}") }))
}
