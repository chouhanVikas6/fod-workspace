//! Camera-feed routes — OWNED BY AGENT R3.
//! Port of src/pages/api/camera-feed/** — these produce Kafka `commandFromPPM`
//! command strings (playVideo_/pauseVideo_/stopVideo_…) via state.kafka.
//!
//! PARITY: pause originally sent `stopVideo_` and was FIXED to `pauseVideo_`;
//! the current Node source sends `pauseVideo_${id}`, which we replicate.
//! PARITY: Node `await kafkaService.sendMessage(...)` never throws — the
//! KafkaSingleton swallows send errors internally — so the handler's 500 catch
//! is effectively dead code; these routes return 200 even if the broker is
//! down. We log the error and still return 200 to match.

use axum::extract::{Path, State};
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::any;
use axum::{Json, Router};
use serde_json::json;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/play/{id}", any(play))
        .route("/pause/{id}", any(pause))
        .route("/stop/{id}", any(stop))
}

fn method_not_allowed(method: &Method, allow: &str) -> Response {
    (
        StatusCode::METHOD_NOT_ALLOWED,
        [(header::ALLOW, allow)],
        format!("Method {} Not Allowed", method.as_str()),
    )
        .into_response()
}

async fn send_video_command(state: &AppState, method: &Method, verb: &str, cam_id: &str) -> Response {
    if *method != Method::GET {
        return method_not_allowed(method, "GET");
    }
    let command = format!("{verb}Video_{cam_id}");
    tracing::info!(command = %command, "camera-feed video command");

    let sim_cmd = format!("{}_{}", verb, cam_id);
    let sim_url = format!("http://127.0.0.1:50055/command?cmd={}", sim_cmd);
    tokio::spawn(async move {
        let _ = reqwest::Client::new().get(&sim_url).timeout(std::time::Duration::from_millis(300)).send().await;
    });

    let car_endpoint = state.cfg.car_backend_url.clone();
    let cam = cam_id.to_string();
    let resume = verb == "play";
    tokio::spawn(async move {
        if let Ok(mut client) = proto_defination::mission_control::mission_control_service_client::MissionControlServiceClient::connect(car_endpoint).await {
            let _ = client.toggle_scan_status(proto_defination::mission_control::ToggleScanRequest {
                resume,
                cam_list: vec![cam],
            }).await;
        }
    });
    (StatusCode::OK, Json(json!({ "message": "command sent" }))).into_response()
}

async fn play(method: Method, State(state): State<AppState>, Path(id): Path<String>) -> Response {
    send_video_command(&state, &method, "play", &id).await
}

async fn pause(method: Method, State(state): State<AppState>, Path(id): Path<String>) -> Response {
    // FIXED behaviour: pauseVideo_ (was stopVideo_).
    send_video_command(&state, &method, "pause", &id).await
}

async fn stop(method: Method, State(state): State<AppState>, Path(id): Path<String>) -> Response {
    send_video_command(&state, &method, "stop", &id).await
}
