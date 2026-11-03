//! HTTP calls to car-backend / atc-backend (port of src/utils/apiMain.ts usage).
//! All plain localhost HTTP. Returns (status, body-json-or-null) so callers can
//! propagate upstream failures with parity (e.g. 502 toasts when car-backend
//! is down — check how the Node handlers wrapped these before copying codes).

use crate::state::AppState;
use serde_json::Value;

pub fn car_url(state: &AppState, path: &str) -> String {
    format!("{}{}", state.cfg.car_backend_url.trim_end_matches('/'), path)
}

pub fn atc_url(state: &AppState, path: &str) -> String {
    format!("{}{}", state.cfg.atc_backend_url.trim_end_matches('/'), path)
}

pub async fn request(
    state: &AppState,
    method: reqwest::Method,
    url: &str,
    body: Option<Value>,
) -> anyhow::Result<(u16, Value)> {
    let mut req = state.http.request(method, url);
    if let Some(b) = body {
        req = req.json(&b);
    }
    let resp = req.send().await?;
    let status = resp.status().as_u16();
    let value = resp.json::<Value>().await.unwrap_or(Value::Null);
    Ok((status, value))
}
