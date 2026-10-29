//! Car backend telemetry subscriber via gRPC BiteService.
//! Replaces both the legacy Kafka consumer and the dead socket.io /client link.

use proto_defination::bite::bite_service_client::BiteServiceClient;
use proto_defination::bite::{BiteState, BiteStreamSubscription, GetBiteStateRequest};
use serde_json::{json, Value};
use std::time::Duration;
use tokio_stream::StreamExt;
use tonic::Request;

use crate::state::AppState;

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        let mut backoff = Duration::from_secs(1);
        loop {
            let endpoint_str = state.cfg.car_backend_url.clone();
            tracing::info!(endpoint = %endpoint_str, "Connecting to Car backend gRPC for telemetry");

            let endpoint = match tonic::transport::Endpoint::from_shared(endpoint_str.clone()) {
                Ok(ep) => ep
                    .connect_timeout(Duration::from_millis(1500))
                    .tcp_keepalive(Some(Duration::from_secs(5)))
                    .http2_keep_alive_interval(Duration::from_secs(2))
                    .keep_alive_while_idle(true),
                Err(e) => {
                    tracing::warn!("Invalid car endpoint: {e}");
                    tokio::time::sleep(backoff).await;
                    continue;
                }
            };

            match BiteServiceClient::connect(endpoint).await {
                Ok(mut client) => {
                    tracing::info!(endpoint = %endpoint_str, "Connected to Car BiteService");
                    backoff = Duration::from_secs(1);

                    // Continuous polling + stream subscription
                    let mut stream_opt = match client
                        .stream_bite_health(Request::new(BiteStreamSubscription {
                            interval_ms: 1000,
                        }))
                        .await
                    {
                        Ok(resp) => Some(resp.into_inner()),
                        Err(e) => {
                            tracing::debug!(error = %e, "stream_bite_health unavailable, falling back to polling");
                            None
                        }
                    };

                    let mut poll_interval = tokio::time::interval(Duration::from_millis(1000));
                    poll_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

                    loop {
                        tokio::select! {
                            _ = poll_interval.tick() => {
                                let t0 = std::time::Instant::now();
                                match tokio::time::timeout(Duration::from_secs(2), client.get_bite_state(Request::new(GetBiteStateRequest {}))).await {
                                    Ok(Ok(resp)) => {
                                        let ping_ms = t0.elapsed().as_millis() as u32;
                                        apply_bite_state(&state, resp.into_inner(), ping_ms).await;
                                    }
                                    Ok(Err(e)) => {
                                        tracing::warn!(error = %e, "Car gRPC get_bite_state poll failed");
                                        break;
                                    }
                                    Err(_) => {
                                        tracing::warn!("Car gRPC get_bite_state poll timed out");
                                        break;
                                    }
                                }
                            }
                            item = async {
                                match &mut stream_opt {
                                    Some(st) => st.next().await,
                                    None => std::future::pending().await,
                                }
                            } => {
                                match item {
                                    Some(Ok(bite)) => {
                                        apply_bite_state(&state, bite, 0).await;
                                    }
                                    Some(Err(e)) => {
                                        tracing::debug!(error = %e, "Bite stream closed/errored");
                                        stream_opt = None;
                                    }
                                    None => {
                                        stream_opt = None;
                                    }
                                }
                            }
                        }
                    }

                    {
                        let mut h = state.health.write().await;
                        h.latency.connected = false;
                        h.available_communication.clear();
                    }
                }
                Err(e) => {
                    tracing::debug!(error = %e, endpoint = %endpoint_str, "Car gRPC connection failed (will retry)");
                    let mut h = state.health.write().await;
                    h.latency.connected = false;
                    h.available_communication.clear();
                }
            }

            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(10));
        }
    });
}

async fn apply_bite_state(state: &AppState, bite: BiteState, ping_ms: u32) {
    let now = chrono::Utc::now().timestamp_millis();
    let mut h = state.health.write().await;
    h.latency.connected = true;
    h.latency.ping = if ping_ms > 0 { ping_ms } else { bite.ping_latency_ms.max(0) as u32 };

    // 1. Primary & Secondary GPS
    let mut car_map = serde_json::Map::new();
    if let Some(p) = bite.primary_gps {
        car_map.insert(
            "primary_data".into(),
            json!({
                "fix": if p.fix.is_empty() { "RTK" } else { &p.fix },
                "lat": p.lat,
                "lon": p.lon,
                "heading": p.heading,
                "sd": if p.sd < 0.0 { 0.1 } else { p.sd },
                "vel": p.velocity,
            }),
        );
    }
    if let Some(s) = bite.secondary_gps {
        car_map.insert(
            "secondary_data".into(),
            json!({
                "fix": if s.fix.is_empty() { "RTK" } else { &s.fix },
                "lat": s.lat,
                "lon": s.lon,
                "heading": s.heading,
                "sd": if s.sd < 0.0 { 0.1 } else { s.sd },
                "vel": s.velocity,
            }),
        );
    }
    h.car_data.data = Value::Object(car_map);
    h.car_data.event_status = true;
    h.car_data.data_status = true;
    h.rtk_data.event_status = true;
    h.rtk_data.data_status = true;

    // 2. Camera health
    let mut data_list = Vec::with_capacity(bite.cameras.len());
    for cam in bite.cameras {
        let entry = json!({
            "CAM_ID": cam.cam_id,
            "sysid": cam.cam_id,
            "CAMERA_CONNECTION": cam.camera_connection,
            "connected": cam.camera_connection,
            "INTR_FPS": cam.intr_fps,
            "intr_fps": cam.intr_fps,
            "VG_FPS": cam.vg_fps,
            "vg_fps": cam.vg_fps,
            "MS_FPS": cam.ms_fps,
            "ms_fps": cam.ms_fps,
            "pause": cam.pause,
            "PAUSE": cam.pause,
            "timestamp": if cam.timestamp > 0 { cam.timestamp } else { now },
            "updatedAt": if cam.timestamp > 0 { cam.timestamp } else { now }
        });
        h.ai_health
            .health
            .insert(cam.cam_id.clone(), entry.clone());
        data_list.push(entry);
    }
    h.ai_health.data = data_list;
    h.ai_health.event_status = true;
    h.ai_health.data_status = true;

    // 3. Available communication devices
    let mut comms: Vec<Value> = Vec::new();
    comms.push(json!({
        "type": "car",
        "sysId": state.cfg.sys_id,
        "timestamp": now,
        "updatedAt": now
    }));

    for dev in bite.available_devices {
        if dev != "car" && dev != "car_01" {
            comms.push(json!({
                "type": dev,
                "sysId": state.cfg.sys_id,
                "timestamp": now,
                "updatedAt": now
            }));
        }
    }
    h.available_communication = comms;
}
