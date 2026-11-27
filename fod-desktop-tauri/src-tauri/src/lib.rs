//! Zoid FOD Desktop — Tauri v2 library with integrated Rust backend & SQLite DB.
//!
//! All backend services, schedulers, gRPC telemetry streams, and SQLite persistence
//! run directly inside this process and communicate with the React frontend via
//! Tauri IPC commands and events.

pub mod archive;
pub mod config;
pub mod db;
pub mod error;
pub mod imagewriter;
pub mod magnetometer_reader;
pub mod models;
pub mod realtime;
pub mod routes;
pub mod rtk_reader;
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

pub(crate) fn canonical_asset_path(path: &std::path::Path) -> Option<String> {
    let abs = std::fs::canonicalize(path).ok()?;
    let s = abs.to_string_lossy().to_string();
    // Strip Windows extended-length prefix so Tauri convertFileSrc produces a valid asset:// URL
    Some(s.strip_prefix(r"\\?\").unwrap_or(&s).to_string())
}

pub(crate) fn is_raw_image_header(header: &[u8], n: usize) -> bool {
    // JPEG (FF D8) or PNG (89 50 4E 47)
    (n >= 2 && header[0] == 0xFF && header[1] == 0xD8)
        || (n >= 4 && header[..4] == [0x89, 0x50, 0x4E, 0x47])
}

pub(crate) fn resolve_local_raw_image_path_sync(path: &std::path::Path) -> Option<String> {
    use std::io::Read;
    let mut f = std::fs::File::open(path).ok()?;
    let mut header = [0u8; 4];
    let n = f.read(&mut header).ok()?;
    if is_raw_image_header(&header, n) {
        canonical_asset_path(path)
    } else {
        None
    }
}

pub(crate) async fn is_raw_image_file(path: &std::path::Path) -> bool {
    let Ok(mut f) = tokio::fs::File::open(path).await else {
        return false;
    };
    use tokio::io::AsyncReadExt;
    let mut header = [0u8; 4];
    let Ok(n) = f.read(&mut header).await else {
        return false;
    };
    is_raw_image_header(&header, n)
}

pub(crate) async fn resolve_local_raw_image_path(path: &std::path::Path) -> Option<String> {
    if is_raw_image_file(path).await {
        canonical_asset_path(path)
    } else {
        None
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedFodImage {
    pub kind: &'static str,
    pub value: String,
}

/// Unified single-IPC FOD image resolver: prefers a local `asset://` file path
/// when available and falls back to an inline `data:image/jpeg;base64,...` URI
/// without ever issuing duplicate gRPC fetches (and works even if CWD is read-only).
#[tauri::command]
async fn resolve_fod_image(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Option<ResolvedFodImage>, String> {
    let clean = normalize_image_path(&path);
    if clean.is_empty() || clean.contains("..") {
        return Ok(None);
    }

    // 1. Check local fod-images/mission/<clean>
    let file = std::path::Path::new("fod-images/mission").join(&clean);
    if is_raw_image_file(&file).await {
        if let Some(p) = canonical_asset_path(&file) {
            return Ok(Some(ResolvedFodImage { kind: "path", value: p }));
        }
    }
    if let Ok(bytes) = tokio::fs::read(&file).await {
        if !bytes.is_empty() {
            return Ok(Some(ResolvedFodImage {
                kind: "dataUrl",
                value: bytes_to_data_url(&bytes),
            }));
        }
    }

    // 2. If it's a 64-char hex sha256 (e.g. ClearedFod beforeClearImg / afterClearImg)
    let stem = clean.trim_end_matches(".jpg");
    if stem.len() == 64 && stem.chars().all(|c| c.is_ascii_hexdigit()) {
        let cached = std::path::Path::new("fod-images/mission").join(format!("{stem}.jpg"));
        if is_raw_image_file(&cached).await {
            if let Some(p) = canonical_asset_path(&cached) {
                return Ok(Some(ResolvedFodImage { kind: "path", value: p }));
            }
        }
        if let Ok(bytes) = tokio::fs::read(&cached).await {
            if !bytes.is_empty() {
                return Ok(Some(ResolvedFodImage {
                    kind: "dataUrl",
                    value: bytes_to_data_url(&bytes),
                }));
            }
        }
        if let Some(bytes) = services::fetch_image_from_car(&state, stem, false).await {
            if let Some(parent) = cached.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            if tokio::fs::write(&cached, &bytes).await.is_ok() && is_raw_image_file(&cached).await {
                if let Some(p) = canonical_asset_path(&cached) {
                    return Ok(Some(ResolvedFodImage { kind: "path", value: p }));
                }
            }
            return Ok(Some(ResolvedFodImage {
                kind: "dataUrl",
                value: bytes_to_data_url(&bytes),
            }));
        }
        return Ok(None);
    }

    // 3. On-demand fetch from Car/ATC backend: "<mission>/<group>/<fod>.jpg"
    let parts: Vec<&str> = clean.split('/').collect();
    if parts.len() >= 3 {
        let mission_seg = parts[0];
        let group_seg = parts[1];
        let fod_seg = parts[2].trim_end_matches(".jpg");

        if let Ok(mid) = mission_seg.parse::<i64>() {
            if scheduler::is_mission_evicted_or_cold(&state, mid).await {
                return Ok(None);
            }
        }

        if let Some(bytes) = services::fetch_fod_image_bytes(&state, fod_seg).await {
            if imagewriter::write_fod_jpeg(mission_seg, group_seg, fod_seg, &bytes)
                .await
                .is_ok()
                && is_raw_image_file(&file).await
            {
                if let Some(p) = canonical_asset_path(&file) {
                    return Ok(Some(ResolvedFodImage { kind: "path", value: p }));
                }
            }
            return Ok(Some(ResolvedFodImage {
                kind: "dataUrl",
                value: bytes_to_data_url(&bytes),
            }));
        }
    }

    Ok(None)
}

/// Resolve a FOD image to a local filesystem path so the WebView can load it directly
/// via Tauri's `asset://` protocol (`convertFileSrc`) without base64 IPC overhead.
/// Returns `None` if the file is missing or stored in legacy UTF-8 base64 text format
/// (the frontend then falls back to `get_fod_image`).
#[tauri::command]
async fn resolve_fod_image_path(
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<Option<String>, String> {
    let clean = normalize_image_path(&path);
    if clean.is_empty() || clean.contains("..") {
        return Ok(None);
    }

    // 1. Check local fod-images/mission/<clean>
    let file = std::path::Path::new("fod-images/mission").join(&clean);
    if is_raw_image_file(&file).await {
        return Ok(canonical_asset_path(&file));
    }

    // 2. If it's a 64-char hex sha256 (e.g. ClearedFod beforeClearImg / afterClearImg)
    let stem = clean.trim_end_matches(".jpg");
    if stem.len() == 64 && stem.chars().all(|c| c.is_ascii_hexdigit()) {
        let cached = std::path::Path::new("fod-images/mission").join(format!("{stem}.jpg"));
        if is_raw_image_file(&cached).await {
            return Ok(canonical_asset_path(&cached));
        }
        if let Some(bytes) = services::fetch_image_from_car(&state, stem, false).await {
            if let Some(parent) = cached.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            if tokio::fs::write(&cached, &bytes).await.is_ok() && is_raw_image_file(&cached).await {
                return Ok(canonical_asset_path(&cached));
            }
        }
    }

    // 3. On-demand fetch from Car backend: "<mission>/<group>/<fod>.jpg"
    let parts: Vec<&str> = clean.split('/').collect();
    if parts.len() >= 3 {
        let mission_seg = parts[0];
        let group_seg = parts[1];
        let fod_seg = parts[2].trim_end_matches(".jpg");

        if let Ok(mid) = mission_seg.parse::<i64>() {
            if scheduler::is_mission_evicted_or_cold(&state, mid).await {
                return Ok(None);
            }
        }

        if let Some(bytes) = services::fetch_fod_image_bytes(&state, fod_seg).await {
            if imagewriter::write_fod_jpeg(mission_seg, group_seg, fod_seg, &bytes)
                .await
                .is_ok()
                && is_raw_image_file(&file).await
            {
                return Ok(canonical_asset_path(&file));
            }
        }
    }

    Ok(None)
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
        let cached = std::path::Path::new("fod-images/mission").join(format!("{stem}.jpg"));
        if let Ok(bytes) = tokio::fs::read(&cached).await {
            return Ok(Some(bytes_to_data_url(&bytes)));
        }
        if let Some(bytes) = services::fetch_image_from_car(&state, stem, false).await {
            if let Some(parent) = cached.parent() {
                let _ = tokio::fs::create_dir_all(parent).await;
            }
            let _ = tokio::fs::write(&cached, &bytes).await;
            return Ok(Some(bytes_to_data_url(&bytes)));
        }
    }

    // 3. On-demand fetch from Car backend: "<mission>/<group>/<fod>.jpg"
    let parts: Vec<&str> = clean.split('/').collect();
    if parts.len() >= 3 {
        let mission_seg = parts[0];
        let group_seg = parts[1];
        let fod_seg = parts[2].trim_end_matches(".jpg");

        if let Ok(mid) = mission_seg.parse::<i64>() {
            if scheduler::is_mission_evicted_or_cold(&state, mid).await {
                return Ok(None);
            }
        }

        if let Some(bytes) = services::fetch_fod_image_bytes(&state, fod_seg).await {
            let _ =
                imagewriter::write_fod_jpeg(mission_seg, group_seg, fod_seg, &bytes).await;
            return Ok(Some(bytes_to_data_url(&bytes)));
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

/// Read local tablet/host battery telemetry from OS power supply interfaces when available.
#[tauri::command]
async fn get_tablet_battery() -> Result<Value, String> {
    Ok(read_tablet_battery())
}

#[tauri::command]
async fn get_magnetometer_state(state: tauri::State<'_, AppState>) -> Result<Value, String> {
    let mag = state.health.read().await.magnetometer.clone();
    Ok(serde_json::to_value(mag).unwrap_or_else(|_| json!({})))
}

#[tauri::command]
async fn list_serial_ports() -> Result<Vec<Value>, String> {
    Ok(magnetometer_reader::list_available_serial_ports())
}

#[tauri::command]
async fn mag_set_port(
    state: tauri::State<'_, AppState>,
    port: Option<String>,
) -> Result<(), String> {
    state.mag_control.set_preferred_port(port).await;
    Ok(())
}

#[tauri::command]
async fn mag_start_calibration(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.mag_control.start_calibration().await;
    Ok(())
}

#[tauri::command]
async fn mag_finish_calibration(
    state: tauri::State<'_, AppState>,
) -> Result<magnetometer_reader::MagnetometerCalibration, String> {
    state.mag_control.finish_calibration().await
}

#[tauri::command]
async fn mag_cancel_calibration(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state.mag_control.cancel_calibration().await;
    Ok(())
}

#[tauri::command]
async fn mag_set_zero_north(
    state: tauri::State<'_, AppState>,
) -> Result<magnetometer_reader::MagnetometerCalibration, String> {
    state.mag_control.set_zero_north().await
}

#[tauri::command]
async fn mag_update_settings(
    state: tauri::State<'_, AppState>,
    heading_offset_deg: Option<f64>,
    declination_deg: Option<f64>,
    invert_direction: Option<bool>,
) -> Result<magnetometer_reader::MagnetometerCalibration, String> {
    Ok(state
        .mag_control
        .update_settings(heading_offset_deg, declination_deg, invert_direction)
        .await)
}

#[tauri::command]
async fn mag_reset_calibration(
    state: tauri::State<'_, AppState>,
) -> Result<magnetometer_reader::MagnetometerCalibration, String> {
    Ok(state.mag_control.reset_calibration().await)
}

#[tauri::command]
async fn pick_archive_save_path(
    app: tauri::AppHandle,
    default_name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let file_name = if default_name.trim().is_empty() {
        "mission-backup.zoidpack".to_string()
    } else {
        default_name
    };
    let path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("ZOID Mission Archive", &["zoidpack", "gz", "tar"])
            .set_file_name(&file_name)
            .blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(path.map(|fp| fp.to_string()))
}

#[tauri::command]
async fn pick_archive_open_path(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let path = tokio::task::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("ZOID Mission Archive", &["zoidpack", "gz", "tar"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(path.map(|fp| fp.to_string()))
}

#[cfg(target_os = "linux")]
fn read_tablet_battery() -> Value {
    let Ok(entries) = std::fs::read_dir("/sys/class/power_supply") else {
        return json!({ "available": false, "percentage": Value::Null, "charging": false, "status": "Unavailable" });
    };

    let mut weighted_energy_now: f64 = 0.0;
    let mut weighted_energy_full: f64 = 0.0;
    let mut capacities: Vec<f64> = Vec::new();
    let mut any_charging = false;
    let mut any_discharging = false;
    let mut any_full = false;

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(kind) = std::fs::read_to_string(path.join("type")) else {
            continue;
        };
        if kind.trim() != "Battery" {
            continue;
        }
        // Skip peripheral device batteries (e.g. stylus/mouse) when scope is explicitly Device.
        if let Ok(scope) = std::fs::read_to_string(path.join("scope")) {
            if scope.trim().eq_ignore_ascii_case("Device") {
                continue;
            }
        }
        if let Ok(present) = std::fs::read_to_string(path.join("present")) {
            if present.trim() == "0" {
                continue;
            }
        }

        let cap = std::fs::read_to_string(path.join("capacity"))
            .ok()
            .and_then(|s| s.trim().parse::<f64>().ok())
            .filter(|v| (0.0..=100.0).contains(v));

        let full = std::fs::read_to_string(path.join("energy_full"))
            .or_else(|_| std::fs::read_to_string(path.join("charge_full")))
            .ok()
            .and_then(|s| s.trim().parse::<f64>().ok())
            .filter(|&v| v > 0.0);

        let now = std::fs::read_to_string(path.join("energy_now"))
            .or_else(|_| std::fs::read_to_string(path.join("charge_now")))
            .ok()
            .and_then(|s| s.trim().parse::<f64>().ok())
            .filter(|&v| v >= 0.0);

        if let (Some(n), Some(f)) = (now, full) {
            weighted_energy_now += n.min(f);
            weighted_energy_full += f;
        } else if let Some(c) = cap {
            capacities.push(c);
        } else {
            continue;
        }

        if let Some(c) = cap {
            if capacities.is_empty() && now.is_none() {
                capacities.push(c);
            }
        }

        if let Ok(st) = std::fs::read_to_string(path.join("status")) {
            match st.trim() {
                "Charging" => any_charging = true,
                "Discharging" => any_discharging = true,
                "Full" => any_full = true,
                _ => {}
            }
        }
    }

    let pct_opt = if weighted_energy_full > 0.0 {
        Some(((weighted_energy_now / weighted_energy_full) * 100.0).round().clamp(0.0, 100.0) as u64)
    } else if !capacities.is_empty() {
        let avg = capacities.iter().sum::<f64>() / capacities.len() as f64;
        Some(avg.round().clamp(0.0, 100.0) as u64)
    } else {
        None
    };

    match pct_opt {
        Some(pct) => {
            let status = if any_charging {
                "Charging"
            } else if any_full || (!any_discharging && pct >= 99) {
                "Full"
            } else if any_discharging {
                "Discharging"
            } else {
                "AC Power"
            };
            json!({
                "available": true,
                "percentage": pct,
                "charging": any_charging,
                "status": status,
            })
        }
        None => json!({ "available": false, "percentage": Value::Null, "charging": false, "status": "Unavailable" }),
    }
}

#[cfg(target_os = "windows")]
fn read_tablet_battery() -> Value {
    #[repr(C)]
    struct SystemPowerStatus {
        ac_line_status: u8,
        battery_flag: u8,
        battery_life_percent: u8,
        system_status_flag: u8,
        battery_life_time: u32,
        battery_full_life_time: u32,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetSystemPowerStatus(lp_system_power_status: *mut SystemPowerStatus) -> i32;
    }

    let mut status = SystemPowerStatus {
        ac_line_status: 0,
        battery_flag: 255,
        battery_life_percent: 255,
        system_status_flag: 0,
        battery_life_time: u32::MAX,
        battery_full_life_time: u32::MAX,
    };
    let ok = unsafe { GetSystemPowerStatus(&mut status as *mut SystemPowerStatus) };
    if ok == 0 || status.battery_flag == 128 || status.battery_flag == 255 || status.battery_life_percent > 100 {
        return json!({ "available": false, "percentage": Value::Null, "charging": false, "status": "Unavailable" });
    }
    let charging = (status.battery_flag & 8) != 0 || status.ac_line_status == 1;
    let label = if (status.battery_flag & 8) != 0 {
        "Charging"
    } else if status.ac_line_status == 1 && status.battery_life_percent >= 99 {
        "Full"
    } else if status.ac_line_status == 1 {
        "AC Power"
    } else {
        "Discharging"
    };
    json!({
        "available": true,
        "percentage": status.battery_life_percent,
        "charging": charging,
        "status": label,
    })
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn read_tablet_battery() -> Value {
    json!({ "available": false, "percentage": Value::Null, "charging": false, "status": "Unavailable" })
}

const EMBEDDED_ENV: &str = include_str!(concat!(env!("OUT_DIR"), "/embedded.env"));

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    dotenvy::dotenv().ok();
    let _ = dotenvy::from_path("../.env");
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.join(".env"),
                dir.join("resources").join(".env"),
                dir.join("_up_").join(".env"),
            ] {
                if candidate.is_file() {
                    let _ = dotenvy::from_path(&candidate);
                }
            }
        }
    }
    if !EMBEDDED_ENV.is_empty() {
        let _ = dotenvy::from_read(EMBEDDED_ENV.as_bytes());
    }
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
            resolve_fod_image,
            resolve_fod_image_path,
            socket_emit,
            get_health_bite_state,
            start_retrive_stream,
            stop_retrive_stream,
            get_tablet_battery,
            get_magnetometer_state,
            list_serial_ports,
            mag_set_port,
            mag_start_calibration,
            mag_finish_calibration,
            mag_cancel_calibration,
            mag_set_zero_north,
            mag_update_settings,
            mag_reset_calibration,
            pick_archive_save_path,
            pick_archive_open_path,
        ])
        .setup(move |app| {
            app_state.set_app_handle(app.handle().clone());
            let app_data_dir = app.path().app_data_dir().ok();

            let st = app_state.clone();
            tauri::async_runtime::spawn(async move {
                if let Some(dir) = app_data_dir {
                    st.mag_control.init_storage_dir(dir).await;
                }

                // Ensure no dangling active mission on startup when car is not verified live yet
                let _ = sqlx::query(r#"UPDATE "Mission" SET "status" = 'INACTIVE', "scanStatus" = 'PAUSE', "updatedAt" = $1 WHERE "status" = 'ACTIVE'"#)
                    .bind(crate::services::now_naive())
                    .execute(&st.db)
                    .await;

                scheduler::cleanup_evicted_missions_on_startup(&st).await;

                if let Err(e) = realtime::setup(st.clone()).await {
                    tracing::error!("realtime::setup error: {e}");
                }
                realtime::car_telemetry::spawn(st.clone());
                realtime::group_stream::spawn(st.clone());
                realtime::mission_stream::spawn(st.clone());
                magnetometer_reader::spawn(st.clone());
                rtk_reader::spawn(st.clone());
                scheduler::spawn_primary_schedular(st.clone());
                scheduler::spawn_sync_service(st.clone());
                scheduler::spawn_user_sync_service(st.clone());
                scheduler::spawn_desktop_auto_storage_daemon(st);
            });

            if let Some(w) = app.get_webview_window("main") {
                let _ = w.maximize();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Zoid FOD Desktop");
}
