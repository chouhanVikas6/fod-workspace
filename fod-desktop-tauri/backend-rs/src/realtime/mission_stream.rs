//! Car backend mission event subscriber via gRPC StreamMissionEvents.
//! Listens for mission lifecycle events (start, terminate, scan pause/play)
//! and keeps local DB and GUI socket.io clients immediately synchronized.

use std::time::Duration;
use proto_defination::mission_control::mission_control_service_client::MissionControlServiceClient;
use proto_defination::mission_control::{MissionEvent, MissionSubscriptionRequest};
use serde_json::json;
use tokio_stream::StreamExt;
use tonic::Request;

use crate::state::AppState;

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        let mut backoff = Duration::from_secs(1);
        loop {
            let endpoint_str = state.cfg.car_backend_url.clone();
            tracing::info!(endpoint = %endpoint_str, "Connecting to Car backend gRPC StreamMissionEvents");

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

            match MissionControlServiceClient::connect(endpoint).await {
                Ok(mut client) => {
                    tracing::info!(endpoint = %endpoint_str, "Connected to Car StreamMissionEvents");
                    backoff = Duration::from_secs(1);

                    match client.stream_mission_events(Request::new(MissionSubscriptionRequest { mission_id: 0 })).await {
                        Ok(resp) => {
                            let mut stream = resp.into_inner();
                            while let Some(item_res) = stream.next().await {
                                match item_res {
                                    Ok(event) => {
                                        if let Err(e) = handle_mission_event(&state, event).await {
                                            tracing::warn!("Failed to handle streamed mission event: {e}");
                                        }
                                    }
                                    Err(e) => {
                                        tracing::warn!("StreamMissionEvents stream error: {e}");
                                        break;
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to subscribe to StreamMissionEvents: {e}");
                        }
                    }
                }
                Err(e) => {
                    tracing::debug!("StreamMissionEvents connect failed: {e}");
                }
            }

            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(10));
        }
    });
}

async fn handle_mission_event(state: &AppState, event: MissionEvent) -> anyhow::Result<()> {
    let mid = event.mission_id;
    match event.event {
        Some(proto_defination::mission_control::mission_event::Event::RawCommand(cmd)) => {
            if cmd.starts_with("terminate") {
                tracing::info!(mission_id = mid, cmd = %cmd, "Streamed terminate command received");
                let _ = sqlx::query(
                    r#"UPDATE "Mission" SET "status" = 'INACTIVE', "scanStatus" = 'PAUSE', "updatedAt" = now() WHERE "id" = $1 OR "status" = 'ACTIVE'"#,
                )
                .bind(mid)
                .execute(&state.db)
                .await;

                if let Some(io) = state.io() {
                    if let Some(gui_ns) = io.of("/gui") {
                        let _ = gui_ns.emit("update", &json!({
                            "type": "terminate",
                            "missionNumber": mid
                        })).await;
                    }
                }
            }
        }
        Some(proto_defination::mission_control::mission_event::Event::StatusChanged(st)) => {
            let is_terminated = st == proto_defination::common::MissionStatus::Terminated as i32
                || st == proto_defination::common::MissionStatus::Inactive as i32;
            let is_active = st == proto_defination::common::MissionStatus::Active as i32;

            if is_terminated {
                tracing::info!(mission_id = mid, status = st, "Streamed mission status changed to terminated");
                let _ = sqlx::query(
                    r#"UPDATE "Mission" SET "status" = 'INACTIVE', "scanStatus" = 'PAUSE', "updatedAt" = now() WHERE "id" = $1 OR "status" = 'ACTIVE'"#,
                )
                .bind(mid)
                .execute(&state.db)
                .await;

                if let Some(io) = state.io() {
                    if let Some(gui_ns) = io.of("/gui") {
                        let _ = gui_ns.emit("update", &json!({
                            "type": "terminate",
                            "missionNumber": mid
                        })).await;
                    }
                }
            } else if is_active {
                tracing::info!(mission_id = mid, "Streamed mission status changed to active");
                let _ = sqlx::query(
                    r#"UPDATE "Mission" SET "status" = 'INACTIVE', "updatedAt" = now() WHERE "id" != $1 AND "status" = 'ACTIVE'"#,
                )
                .bind(mid)
                .execute(&state.db)
                .await;

                let _ = sqlx::query(
                    r#"INSERT INTO "Mission" ("id", "status", "scanStatus", "createdAt", "updatedAt")
                       VALUES ($1, 'ACTIVE', 'PAUSE', now(), now())
                       ON CONFLICT ("id") DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = now()"#,
                )
                .bind(mid)
                .execute(&state.db)
                .await;

                if let Some(io) = state.io() {
                    if let Some(gui_ns) = io.of("/gui") {
                        let _ = gui_ns.emit("update", &json!({
                            "type": "mission",
                            "data": { "id": mid, "status": "ACTIVE" }
                        })).await;
                    }
                }
            }
        }
        Some(proto_defination::mission_control::mission_event::Event::ScanChanged(sc)) => {
            let scan_str = match proto_defination::common::MissionScanStatus::try_from(sc) {
                Ok(proto_defination::common::MissionScanStatus::Play) => "PLAY",
                _ => "PAUSE",
            };
            let _ = sqlx::query(
                r#"UPDATE "Mission" SET "scanStatus" = $1::"MissionScanStatus", "updatedAt" = now() WHERE "id" = $2"#,
            )
            .bind(scan_str)
            .bind(mid)
            .execute(&state.db)
            .await;
        }
        _ => {}
    }

    Ok(())
}
