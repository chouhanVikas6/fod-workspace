//! Zoid FOD Desktop — Tauri v2 library with integrated Rust backend & SQLite DB.
//!
//! All backend services, schedulers, gRPC telemetry streams, and SQLite persistence
//! run directly inside this process and communicate with the React frontend via
//! Tauri IPC commands and events.

pub mod config;
pub mod db;
pub mod error;
pub mod imagewriter;
pub mod models;
pub mod realtime;
pub mod routes;
pub mod scheduler;
pub mod services;
pub mod state;
pub mod upstream;

use std::collections::HashMap;
use std::sync::Arc;

use axum::body::Body;
use axum::http::{HeaderName, HeaderValue, Method, Request};
use base64::Engine;
use serde::Serialize;
use serde_json::{Value, json};
use tauri::Manager;
use tower::ServiceExt;

use crate::config::Config;
use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcResponse {
    pub status: u16,
    pub ok: bool,
    pub status_text: String,
    pub data: Value,
    pub text: String,
}

fn normalize_path_and_query(raw_url: &str) -> String {
    let trimmed = raw_url.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if let Some(idx) = trimmed.find("://") {
            let after_scheme = &trimmed[idx + 3..];
            if let Some(slash_idx) = after_scheme.find('/') {
                return after_scheme[slash_idx..].to_string();
            }
            return "/".to_string();
        }
    }
    if trimmed.starts_with('/') {
        trimmed.to_string()
    } else {
        format!("/{trimmed}")
    }
}

/// Dispatch any frontend API call in-process through the Axum router without HTTP/TCP.
#[tauri::command]
async fn api_request(
    state: tauri::State<'_, AppState>,
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<Value>,
) -> Result<IpcResponse, String> {
    let path_and_query = normalize_path_and_query(&url);
    let http_method = Method::from_bytes(method.trim().to_uppercase().as_bytes())
        .unwrap_or(Method::GET);

    let mut req_builder = Request::builder()
        .method(http_method.clone())
        .uri(&path_and_query);

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            if let (Ok(name), Ok(val)) = (
                HeaderName::from_bytes(k.as_bytes()),
                HeaderValue::from_str(&v),
            ) {
                req_builder = req_builder.header(name, val);
            }
        }
    }

    let body_bytes = match body {
        None | Some(Value::Null) if http_method == Method::GET || http_method == Method::HEAD => {
            Vec::new()
        }
        None => Vec::new(),
        Some(Value::String(s)) => s.into_bytes(),
        Some(v) => {
            req_builder = req_builder.header("content-type", "application/json");
            serde_json::to_vec(&v).unwrap_or_default()
        }
    };

    let req = req_builder
        .body(Body::from(body_bytes))
        .map_err(|e| format!("Failed to construct IPC request: {e}"))?;

    let router = routes::app_router((*state).clone());
    let resp = router
        .oneshot(req)
        .await
        .map_err(|e| format!("Router dispatch error: {e}"))?;

    let status = resp.status();
    let status_code = status.as_u16();
    let ok = status.is_success();
    let status_text = status
        .canonical_reason()
        .unwrap_or("OK")
        .to_string();

    let resp_bytes = axum::body::to_bytes(resp.into_body(), usize::MAX)
        .await
        .map_err(|e| format!("Failed to read response body: {e}"))?;

    let text = String::from_utf8_lossy(&resp_bytes).into_owned();
    let data = if text.trim().is_empty() {
        Value::Null
    } else {
        serde_json::from_str::<Value>(&text).unwrap_or_else(|_| Value::String(text.clone()))
    };

    Ok(IpcResponse {
        status: status_code,
        ok,
        status_text,
        data,
        text,
    })
}

/// Resolve a FOD image or ClearedFod sha256 image via Tauri IPC and return a `data:image/jpeg;base64,...` URI.
#[tauri::command]
async fn get_fod_image(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Option<String>, String> {
    let clean = normalize_image_path(&path);
    if clean.is_empty() || clean.contains("..") {
        return Ok(None);
    }

    // 1. Check local fod-images/mission/<clean>
    let file = std::path::Path::new("fod-images/mission").join(&clean);
    if let Ok(bytes) = tokio::fs::read(&file).await {
        return Ok(Some(bytes_to_data_url(&bytes)));
    }

    // 2. If it's a 64-char hex sha256 (e.g. ClearedFod beforeClearImg / afterClearImg)
    let stem = clean.trim_end_matches(".jpg");
    if stem.len() == 64 && stem.chars().all(|c| c.is_ascii_hexdigit()) {
        if let Some(bytes) = services::fetch_image_from_car(&state, stem, false).await {
            return Ok(Some(bytes_to_data_url(&bytes)));
        }
    }

    // 3. On-demand fetch from Car backend: "<mission>/<group>/<fod>.jpg"
    let parts: Vec<&str> = clean.split('/').collect();
    if parts.len() >= 3 {
        let mission_seg = parts[0];
        let group_seg = parts[1];
        let fod_seg = parts[2].trim_end_matches(".jpg");

        if let Some(fod) = services::fetch_fod_from_car(&state, fod_seg).await {
            if !fod.image_sha256.is_empty() {
                if let Some(bytes) =
                    services::fetch_image_from_car(&state, &fod.image_sha256, false).await
                {
                    let _ =
                        imagewriter::write_fod_jpeg(mission_seg, group_seg, fod_seg, &bytes).await;
                    return Ok(Some(bytes_to_data_url(&bytes)));
                }
            }
        }
    }

    Ok(None)
}

fn normalize_image_path(raw: &str) -> String {
    let s = raw.trim();
    if let Some(idx) = s.find("/images/") {
        return s[idx + "/images/".len()..].trim_start_matches('/').to_string();
    }
    s.trim_start_matches('/').to_string()
}

fn bytes_to_data_url(bytes: &[u8]) -> String {
    // Handle both raw JPEG bytes and legacy base64-encoded UTF-8 files
    if let Ok(as_str) = std::str::from_utf8(bytes) {
        let trimmed = as_str.trim();
        if trimmed.starts_with("data:image/") {
            return trimmed.to_string();
        }
        if trimmed.starts_with("/9j/") {
            return format!("data:image/jpeg;base64,{trimmed}");
        }
    }
    let encoded = base64::engine::general_purpose::STANDARD.encode(bytes);
    format!("data:image/jpeg;base64,{encoded}")
}

/// Replace Socket.IO client `.emit(...)` with Tauri IPC command.
#[tauri::command]
async fn socket_emit(
    state: tauri::State<'_, AppState>,
    namespace: Option<String>,
    event: String,
    payload: Option<Value>,
) -> Result<(), String> {
    realtime::socketio::handle_socket_event(&state, namespace.as_deref(), &event, payload).await;
    Ok(())
}

/// Replace `/api/sse/health-data` initial fetch with a direct Tauri IPC command.
#[tauri::command]
async fn get_health_bite_state(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    Ok(realtime::sse::get_bite_state_once(&state)
        .await
        .unwrap_or_else(|| json!({})))
}

/// Start a Tauri IPC stream replacing `EventSource('/api/sse/retrive-data?id=...')`.
#[tauri::command]
async fn start_retrive_stream(
    state: tauri::State<'_, AppState>,
    sub_id: String,
    mission_id: Option<i64>,
) -> Result<(), String> {
    realtime::sse::start_retrive_ipc_stream((*state).clone(), sub_id, mission_id).await;
    Ok(())
}

/// Stop an active `retrive-data` Tauri IPC stream.
#[tauri::command]
async fn stop_retrive_stream(
    state: tauri::State<'_, AppState>,
    sub_id: String,
) -> Result<(), String> {
    realtime::sse::stop_retrive_ipc_stream(&state, &sub_id).await;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();
    let _ = tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "fod_desktop_lib=info,tower_http=info".into()),
        )
        .try_init();

    let cfg = Arc::new(Config::load());
    let db = tauri::async_runtime::block_on(async {
        db::init_db(&cfg.database_url)
            .await
            .expect("Failed to initialize SQLite database")
    });

    let app_state = AppState::new(cfg, db);

    tauri::Builder::default()
        .manage(app_state.clone())
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            api_request,
            get_fod_image,
            socket_emit,
            get_health_bite_state,
            start_retrive_stream,
            stop_retrive_stream,
        ])
        .setup(move |app| {
            app_state.set_app_handle(app.handle().clone());

            let st = app_state.clone();
            tauri::async_runtime::spawn(async move {
                // Ensure no dangling active mission on startup when car is not verified live yet
                let _ = sqlx::query(r#"UPDATE "Mission" SET "status" = 'INACTIVE', "scanStatus" = 'PAUSE', "updatedAt" = $1 WHERE "status" = 'ACTIVE'"#)
                    .bind(crate::services::now_naive())
                    .execute(&st.db)
                    .await;

                if let Err(e) = realtime::setup(st.clone()).await {
                    tracing::error!("realtime::setup error: {e}");
                }
                realtime::car_telemetry::spawn(st.clone());
                realtime::group_stream::spawn(st.clone());
                realtime::mission_stream::spawn(st.clone());
                scheduler::spawn_primary_schedular(st.clone());
                scheduler::spawn_sync_service(st.clone());
                scheduler::spawn_user_sync_service(st);
            });

            if let Some(w) = app.get_webview_window("main") {
                let _ = w.maximize();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zoid FOD Desktop");
}
