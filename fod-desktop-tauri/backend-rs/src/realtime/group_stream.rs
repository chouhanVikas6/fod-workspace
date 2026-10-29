//! Car backend FOD group subscriber via gRPC StreamGroups.
//! Streams new and updated FOD groups in real-time as they are clustered by the car.

use std::time::Duration;
use proto_defination::fod_group::fod_group_service_client::FodGroupServiceClient;
use proto_defination::fod_group::{FodGroupEntity, StreamGroupsRequest};
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

            let client_res = match connect_stream_client(&primary).await {
                Some(c) => Some((primary, c)),
                None => {
                    if secondary != primary {
                        connect_stream_client(&secondary).await.map(|c| (secondary, c))
                    } else {
                        None
                    }
                }
            };

            match client_res {
                Some((endpoint_str, mut client)) => {
                    tracing::info!(endpoint = %endpoint_str, "Connected to gRPC StreamGroups");
                    backoff = Duration::from_secs(1);

                    match client.stream_groups(Request::new(StreamGroupsRequest { mission_id: 0 })).await {
                        Ok(resp) => {
                            let mut stream = resp.into_inner();
                            while let Some(item_res) = stream.next().await {
                                match item_res {
                                    Ok(group) => {
                                        if let Err(e) = handle_group(&state, group).await {
                                            tracing::warn!("Failed to handle streamed group: {e}");
                                        }
                                    }
                                    Err(e) => {
                                        tracing::warn!("StreamGroups stream error: {e}");
                                        break;
                                    }
                                }
                            }
                        }
                        Err(e) => {
                            tracing::warn!("Failed to subscribe to StreamGroups on {endpoint_str}: {e}");
                        }
                    }
                }
                None => {
                    tracing::debug!("StreamGroups connect failed on both primary and secondary");
                }
            }

            tokio::time::sleep(backoff).await;
            backoff = (backoff * 2).min(Duration::from_secs(10));
        }
    });
}

async fn connect_stream_client(
    endpoint_str: &str,
) -> Option<FodGroupServiceClient<tonic::transport::Channel>> {
    let endpoint = tonic::transport::Endpoint::from_shared(endpoint_str.to_string()).ok()?
        .connect_timeout(Duration::from_millis(1500))
        .tcp_keepalive(Some(Duration::from_secs(5)))
        .http2_keep_alive_interval(Duration::from_secs(2))
        .keep_alive_while_idle(true);
    FodGroupServiceClient::connect(endpoint).await.ok()
}

async fn handle_group(state: &AppState, g: FodGroupEntity) -> anyhow::Result<()> {
    let id = uuid::Uuid::new_v4().to_string();
    let gid = g.group_id as i32;
    let mission_id = g.mission_id;
    let st = crate::services::proto_group_status_str(g.status);
    let biggest_fod = g.biggest_fod;
    let biggest_fod_size = g.biggest_fod_size.map(|s| s as i32);
    let created = chrono::DateTime::from_timestamp_millis(g.created_at).map(|dt| dt.naive_utc());

    sqlx::query(
        r#"INSERT INTO "FodGroup" ("id","groupId","missionId","dirty","status","biggestFodId","biggestFodSize","createdAt","updatedAt")
           VALUES ($1,$2,$3,false,$4::"FodGroupStatus",$5,$6, COALESCE($7, now()), now())
           ON CONFLICT ("groupId","missionId") DO UPDATE SET
               "status" = CASE WHEN "FodGroup"."dirty" = true THEN "FodGroup"."status" ELSE EXCLUDED."status" END,
               "biggestFodId" = COALESCE(EXCLUDED."biggestFodId", "FodGroup"."biggestFodId"),
               "biggestFodSize" = COALESCE(EXCLUDED."biggestFodSize", "FodGroup"."biggestFodSize"),
               "updatedAt" = now()"#,
    )
    .bind(id)
    .bind(gid)
    .bind(mission_id)
    .bind(st)
    .bind(biggest_fod.as_deref())
    .bind(biggest_fod_size)
    .bind(created)
    .execute(&state.db)
    .await?;

    if let Some(fod_id) = biggest_fod {
        if let Some(f) = crate::services::fetch_fod_from_car(state, &fod_id).await {
            let lat = f.location.as_ref().map(|l| l.lat).unwrap_or(0.0);
            let lon = f.location.as_ref().map(|l| l.lon).unwrap_or(0.0);
            let sd = f.location.as_ref().map(|l| l.sd).unwrap_or(0.0);
            let loc = json!({ "lat": lat, "lon": lon, "sd": sd });
            let ts = chrono::DateTime::from_timestamp_millis(f.timestamp)
                .map(|dt| dt.naive_utc())
                .unwrap_or_else(crate::services::now_naive);
            let created = chrono::DateTime::from_timestamp_millis(f.created_at)
                .map(|dt| dt.naive_utc())
                .unwrap_or(ts);

            let _ = sqlx::query(
                r#"INSERT INTO "Fod" (
                    "id", "missionId", "groupId", "sysid", "location", "confidence",
                    "class", "velocity", "size", "timestamp", "createdAt", "updatedAt", "dirty"
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now(), false)
                ON CONFLICT ("id") DO UPDATE SET
                    "location" = EXCLUDED."location",
                    "confidence" = EXCLUDED."confidence",
                    "class" = EXCLUDED."class",
                    "velocity" = EXCLUDED."velocity",
                    "size" = EXCLUDED."size",
                    "updatedAt" = now()"#,
            )
            .bind(&f.id)
            .bind(f.mission_id)
            .bind(f.group_id as i32)
            .bind(if f.sysid.is_empty() { None } else { Some(&f.sysid) })
            .bind(loc)
            .bind(f.confidence)
            .bind(if f.class_name.is_empty() { None } else { Some(&f.class_name) })
            .bind(f.velocity)
            .bind(f.size)
            .bind(ts)
            .bind(created)
            .execute(&state.db)
            .await;
        }
    }

    if let Some(io) = state.io() {
        if let Some(gui_ns) = io.of("/gui") {
            let _ = gui_ns
                .emit(
                    "update",
                    &json!({
                        "type": "fodGroup",
                        "message": {
                            "groupId": gid,
                            "missionId": mission_id,
                            "status": st
                        }
                    }),
                )
                .await;
        }
    }

    Ok(())
}
