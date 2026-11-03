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
    let now = crate::services::now_naive();
    let created = chrono::DateTime::from_timestamp_millis(g.created_at)
        .map(|dt| dt.naive_utc())
        .unwrap_or(now);

    let incoming_ver = g.version;

    let local: Option<crate::models::FodGroup> = match sqlx::query_as::<_, crate::models::FodGroup>(
        r#"SELECT * FROM "FodGroup" WHERE "groupId" = $1 AND "missionId" = $2"#,
    )
    .bind(gid)
    .bind(mission_id)
    .fetch_optional(&state.db)
    .await
    {
        Ok(opt) => opt,
        Err(e) => {
            tracing::warn!("handle_group check local group error: {e}");
            None
        }
    };

    let mut should_emit = false;
    let biggest_fod_changed = match &local {
        None => biggest_fod.is_some(),
        Some(local_g) => biggest_fod.is_some() && local_g.biggest_fod_id != biggest_fod,
    };
    match local {
        None => {
            let insert_res = sqlx::query(
                r#"INSERT INTO "FodGroup" ("id","groupId","missionId","dirty","status","version","biggestFodId","biggestFodSize","createdAt","updatedAt")
                   VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8,$9)"#,
            )
            .bind(id)
            .bind(gid)
            .bind(mission_id)
            .bind(st)
            .bind(incoming_ver)
            .bind(biggest_fod.as_deref())
            .bind(biggest_fod_size)
            .bind(created)
            .bind(now)
            .execute(&state.db)
            .await;

            if let Err(e) = insert_res {
                tracing::warn!("handle_group insert FodGroup {gid} error: {e}");
            } else {
                should_emit = true;
            }
        }
        Some(local_g) => {
            let local_ver = local_g.version.unwrap_or(0);
            let local_dirty = local_g.dirty.unwrap_or(false);
            let incoming_is_cleared = st == "CLEARED";

            if incoming_is_cleared {
                let _ = sqlx::query(
                    r#"UPDATE "FodGroup" SET "status" = 'CLEARED', "version" = $1, "dirty" = false, "updatedAt" = $4 WHERE "groupId" = $2 AND "missionId" = $3"#,
                )
                .bind(incoming_ver)
                .bind(gid)
                .bind(mission_id)
                .bind(now)
                .execute(&state.db)
                .await;

                if local_g.status != crate::models::FodGroupStatus::Cleared {
                    should_emit = true;
                }
            } else if local_dirty {
                // Local operator decision in progress; retain local.
            } else if local_ver > incoming_ver {
                // Collector has higher version than upstream; retain local and mark dirty so resolve pushes to upstream.
                let _ = sqlx::query(
                    r#"UPDATE "FodGroup" SET "dirty" = true, "updatedAt" = $3 WHERE "groupId" = $1 AND "missionId" = $2 AND COALESCE("dirty", 0) = 0"#,
                )
                .bind(gid)
                .bind(mission_id)
                .bind(now)
                .execute(&state.db)
                .await;
            } else {
                let status_changed = local_g.status.to_string() != st;
                let _ = sqlx::query(
                    r#"UPDATE "FodGroup" SET
                        "status" = $1,
                        "version" = $2,
                        "dirty" = false,
                        "biggestFodId" = COALESCE($3, "FodGroup"."biggestFodId"),
                        "biggestFodSize" = COALESCE($4, "FodGroup"."biggestFodSize"),
                        "updatedAt" = $7
                    WHERE "groupId" = $5 AND "missionId" = $6"#,
                )
                .bind(st)
                .bind(incoming_ver)
                .bind(biggest_fod.as_deref())
                .bind(biggest_fod_size)
                .bind(gid)
                .bind(mission_id)
                .bind(now)
                .execute(&state.db)
                .await;

                if status_changed {
                    should_emit = true;
                }
            }
        }
    }

    if should_emit {
        state.emit_gui(
            "update",
            &json!({
                "type": "fodGroup",
                "message": {
                    "groupId": gid,
                    "missionId": mission_id,
                    "status": st
                }
            }),
        );
    }

    if biggest_fod_changed {
        if let Some(fod_id) = biggest_fod {
            let state_clone = state.clone();
            tokio::spawn(async move {
                if let Some(f) = crate::services::fetch_fod_from_car(&state_clone, &fod_id).await {
                    let now = crate::services::now_naive();
                    let lat = f.location.as_ref().map(|l| l.lat).unwrap_or(0.0);
                    let lon = f.location.as_ref().map(|l| l.lon).unwrap_or(0.0);
                    let sd = f.location.as_ref().map(|l| l.sd).unwrap_or(0.0);
                    let loc = json!({ "lat": lat, "lon": lon, "sd": sd });
                    let ts = chrono::DateTime::from_timestamp_millis(f.timestamp)
                        .map(|dt| dt.naive_utc())
                        .unwrap_or(now);
                    let created = chrono::DateTime::from_timestamp_millis(f.created_at)
                        .map(|dt| dt.naive_utc())
                        .unwrap_or(ts);

                    let _ = sqlx::query(
                        r#"INSERT INTO "Fod" (
                            "id", "missionId", "groupId", "sysid", "location", "confidence",
                            "class", "velocity", "size", "timestamp", "createdAt", "updatedAt", "dirty"
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, false)
                        ON CONFLICT ("id") DO UPDATE SET
                            "location" = EXCLUDED."location",
                            "confidence" = EXCLUDED."confidence",
                            "class" = EXCLUDED."class",
                            "velocity" = EXCLUDED."velocity",
                            "size" = EXCLUDED."size",
                            "updatedAt" = $12"#,
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
                    .bind(now)
                    .execute(&state_clone.db)
                    .await;
                }
            });
        }
    }

    Ok(())
}
