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
            let primary = state.cfg.car_backend_url.clone();
            let secondary = state.cfg.atc_backend_url.clone();

            let client_res = match connect_mission_stream_client(&primary).await {
                Some(c) => Some((primary, c)),
                None => {
                    if secondary != primary {
                        connect_mission_stream_client(&secondary).await.map(|c| (secondary, c))
                    } else {
                        None
                    }
                }
            };

            match client_res {
                Some((endpoint_str, mut client)) => {
                    tracing::info!(endpoint = %endpoint_str, "Connected to StreamMissionEvents");
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
                            tracing::warn!("Failed to subscribe to StreamMissionEvents on {endpoint_str}: {e}");
                        }
                    }
                }
                None => {
                    tracing::debug!("StreamMissionEvents connect failed on both primary and secondary");
                }
            }

            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(10));
        }
    });
}

async fn connect_mission_stream_client(
    endpoint_str: &str,
) -> Option<MissionControlServiceClient<tonic::transport::Channel>> {
    let endpoint = tonic::transport::Endpoint::from_shared(endpoint_str.to_string()).ok()?
        .connect_timeout(Duration::from_millis(1500))
        .tcp_keepalive(Some(Duration::from_secs(5)))
        .http2_keep_alive_interval(Duration::from_secs(2))
        .keep_alive_while_idle(true);
    MissionControlServiceClient::connect(endpoint).await.ok()
}

async fn handle_mission_event(state: &AppState, event: MissionEvent) -> anyhow::Result<()> {
    let mid = event.mission_id;
    let display_id = event.display_id;
    let now = crate::services::now_naive();
    match event.event {
        Some(proto_defination::mission_control::mission_event::Event::RawCommand(cmd)) => {
            if cmd.starts_with("terminate") {
                tracing::info!(mission_id = mid, cmd = %cmd, "Streamed terminate command received");
                let _ = sqlx::query(
                    r#"UPDATE "Mission" SET "status" = 'INACTIVE', "scanStatus" = 'PAUSE', "updatedAt" = $2 WHERE "id" = $1 OR "status" = 'ACTIVE'"#,
                )
                .bind(mid)
                .bind(now)
                .execute(&state.db)
                .await;

                state.emit_gui(
                    "update",
                    &json!({
                        "type": "terminate",
                        "missionNumber": mid
                    }),
                );
            }
        }
        Some(proto_defination::mission_control::mission_event::Event::StatusChanged(st)) => {
            let is_terminated = st == proto_defination::common::MissionStatus::Terminated as i32
                || st == proto_defination::common::MissionStatus::Inactive as i32;
            let is_active = st == proto_defination::common::MissionStatus::Active as i32;

            if is_terminated {
                tracing::info!(mission_id = mid, status = st, "Streamed mission status changed to terminated");
                let _ = sqlx::query(
                    r#"UPDATE "Mission" SET "status" = 'INACTIVE', "scanStatus" = 'PAUSE', "updatedAt" = $2 WHERE "id" = $1 OR "status" = 'ACTIVE'"#,
                )
                .bind(mid)
                .bind(now)
                .execute(&state.db)
                .await;

                state.emit_gui(
                    "update",
                    &json!({
                        "type": "terminate",
                        "missionNumber": mid
                    }),
                );
            } else if is_active {
                tracing::info!(mission_id = mid, "Streamed mission status changed to active");
                let _ = sqlx::query(
                    r#"UPDATE "Mission" SET "status" = 'INACTIVE', "updatedAt" = $2 WHERE "id" != $1 AND "status" = 'ACTIVE'"#,
                )
                .bind(mid)
                .bind(now)
                .execute(&state.db)
                .await;

                let _ = sqlx::query(
                    r#"INSERT INTO "Mission" ("id", "displayId", "status", "scanStatus", "createdAt", "updatedAt")
                       VALUES ($1, $2, 'ACTIVE', 'PAUSE', $3, $3)
                       ON CONFLICT ("id") DO UPDATE SET
                         "status" = 'ACTIVE',
                         "displayId" = COALESCE(EXCLUDED."displayId", "Mission"."displayId"),
                         "updatedAt" = $3"#,
                )
                .bind(mid)
                .bind(display_id)
                .bind(now)
                .execute(&state.db)
                .await;

                state.emit_gui(
                    "update",
                    &json!({
                        "type": "mission",
                        "data": { "id": mid, "displayId": display_id, "status": "ACTIVE" }
                    }),
                );
            }
        }
        Some(proto_defination::mission_control::mission_event::Event::ScanChanged(sc)) => {
            let scan_str = match proto_defination::common::MissionScanStatus::try_from(sc) {
                Ok(proto_defination::common::MissionScanStatus::Play) => "PLAY",
                _ => "PAUSE",
            };
            let _ = sqlx::query(
                r#"UPDATE "Mission" SET "scanStatus" = $1, "updatedAt" = $3 WHERE "id" = $2"#,
            )
            .bind(scan_str)
            .bind(mid)
            .bind(now)
            .execute(&state.db)
            .await;
        }
        _ => {}
    }

    Ok(())
}
