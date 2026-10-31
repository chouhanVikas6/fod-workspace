//! Background schedulers — OWNED BY AGENT R4.
//! Ports of src/schedular/primarySchedular.ts and src/services/syncing.ts.
//!
//! MAPPING (see AGENTS.md; parity-over-polish):
//!   spawn_primary_schedular  → primarySchedular.ts `resolveFodGroup` loop
//!                              (dirty "FodGroup" rows pushed to car-backend;
//!                              dirty cleared ONLY after a successful push).
//!   spawn_sync_service       → primarySchedular.ts `syncMission` loop
//!                              (periodic mission-list re-sync + `syncFod`
//!                              fod-group reconciliation).
//!   sync(state,"missionList") → syncing.ts SyncProcess.`syncMissionList`
//!                              (connect-triggered; activeMission reconcile +
//!                              mission upsert).
//!   sync(state,"dirty")      → syncing.ts `case "dirty"` is a no-op in the
//!                              Node source (syncMissionDirty() is commented
//!                              out), so this is a no-op here too.
//!
//! Cadence: the Node loops self-reschedule with setTimeout(fn, 1000) AFTER each
//! run completes. We use tokio interval @1s with MissedTickBehavior::Delay so a
//! slow tick (e.g. a 10s car-backend timeout) never causes overlapping runs.
//!
//! All car-backend calls go through car_call(): parity with apiToMain's default
//! 10s axios timeout (src/utils/apiMain.ts), wrapped in tokio::time::timeout so
//! a wedged car-backend can never hang a scheduler task. On any failure we log
//! and continue — the next tick retries (dirty flags survive the failure).
//!The Big Picture: Unified Architecture
When you combine:

Merging backend-rs into src-tauri (in-process Axum on Tokio)
Replacing PostgreSQL with SQLite (client.db in app data)
You get:

Single executable: One binary for desktop, one .apk for Android.
No external servers needed: No local Postgres daemon, no port conflicts, no sidecar process monitors.
100% Mobile Ready: The exact same Rust and React codebase builds and runs directly on an Android tablet or phone.
//! NOT ported (documented dependency): syncFod's `createFodBatch([primaryPacket])`
//! writes Fod rows + JPEG frames — that is R1's fod-ingest / imagewriter domain
//! and has no frozen cross-module signature in services.rs. We log when a
//! primaryPacket is present and defer it. Everything else in syncFod (FodGroup
//! create/update, ClearedFod upsert) is plain table work and is ported.

use crate::models::{ClearedFod, FodGroup, FodGroupStatus};
use crate::state::AppState;
use serde_json::{json, Value};
use sqlx::types::chrono::NaiveDateTime;
use std::time::Duration;
use tokio::time::MissedTickBehavior;

/// Prisma ISO-8601 with millis + trailing Z (mirrors models::iso_millis).
fn iso(dt: NaiveDateTime) -> String {
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// One car-backend call routed through api_to_main (which handles gRPC endpoints).
/// Returns (200, body) or None on error/timeout.
async fn car_call(
    state: &AppState,
    method: reqwest::Method,
    path: &str,
    body: Option<Value>,
) -> Option<(u16, Value)> {
    match tokio::time::timeout(
        Duration::from_secs(10),
        crate::services::api_to_main(state, method, path, body, Some(10_000)),
    )
    .await
    {
        Ok(Some(res)) => Some((200, res)),
        Ok(None) => None,
        Err(_) => {
            tracing::warn!("car-backend {path} timed out (10s)");
            None
        }
    }
}

fn is_2xx(status: u16) -> bool {
    (200..300).contains(&status)
}

// ─────────────────────────── spawn entry points ───────────────────────────

/// primarySchedular.ts `resolveFodGroup`: dirty "FodGroup" resolution pushed to
/// car-backend on an interval. Dirty is cleared ONLY after a successful push.
pub fn spawn_primary_schedular(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(1));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            if let Err(e) = resolve_fod_group(&state).await {
                tracing::warn!("resolveFodGroup tick error: {e}");
            }
        }
    });
}

/// primarySchedular.ts `syncMission`: periodic mission-list re-sync (the
/// "source of truth" reconciliation, ~1s) plus `syncFod` fod-group sync.
pub fn spawn_sync_service(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(1));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            if let Err(e) = sync_mission(&state).await {
                tracing::warn!("syncMission tick error: {e}");
            }
        }
    });
}

/// syncService.sync(kind) — kind ∈ {"missionList", "dirty"}.
/// SIGNATURE FROZEN: called by realtime::backend_link on every (re)connect to
/// the car-backend socket.
pub async fn sync(state: &AppState, kind: &str) -> anyhow::Result<()> {
    match kind {
        "missionList" => sync_mission_list(state).await,
        "dirty" => {
            // PARITY: syncing.ts `case "dirty": // await this.syncMissionDirty();`
            // is commented out — the connect-triggered dirty sync is a no-op.
            // (The live dirty push lives in spawn_primary_schedular instead.)
            tracing::debug!("sync(dirty): no-op (Node syncMissionDirty is commented out)");
            Ok(())
        }
        other => {
            // Node's default case throws, caught by the surrounding try/catch and
            // logged. The only callers pass missionList/dirty, so just log.
            tracing::warn!("sync({other}): unknown kind, ignoring");
            Ok(())
        }
    }
}

// ─────────────────────── primary: resolveFodGroup ───────────────────────

pub async fn resolve_fod_group(state: &AppState) -> anyhow::Result<()> {
    let dirty_rows = sqlx::query_as::<_, FodGroup>(r#"SELECT * FROM "FodGroup" WHERE "dirty" = true"#)
        .fetch_all(&state.db)
        .await?;
    if dirty_rows.is_empty() {
        return Ok(());
    }

    // ── undo rows (status == NEW): POST /api/fod-group/update/{groupId} ──
    for row in dirty_rows.iter().filter(|r| r.status == FodGroupStatus::New) {
        let body = json!({
            "missionId": row.mission_id,
            "groupId": row.group_id,
            "status": "NEW",
        });
        let path = format!("/api/fod-group/update/{}", row.group_id);
        if let Some((status, data)) = car_call(state, reqwest::Method::POST, &path, Some(body)).await {
            // PARITY: apiToMain returns the response BODY; the Node code then
            // checks `res?.status == 200` — i.e. the BODY's `status` field, not
            // the HTTP status. Reproduce that literal check.
            let ok = is_2xx(status)
                && data
                    .get("status")
                    .and_then(|s| s.as_i64().or_else(|| s.as_str().and_then(|t| t.parse().ok())))
                    == Some(200);
            if ok {
                sqlx::query(
                    r#"UPDATE "FodGroup" SET "dirty" = false, "updatedAt" = now() WHERE "groupId" = $1 AND "missionId" = $2"#,
                )
                .bind(row.group_id)
                .bind(row.mission_id)
                .execute(&state.db)
                .await?;
            }
        }
    }

    // ── resolve rows (status != NEW): POST /api/fod-group/resolve ──
    let others: Vec<&FodGroup> = dirty_rows
        .iter()
        .filter(|r| r.status != FodGroupStatus::New)
        .collect();
    if others.is_empty() {
        return Ok(());
    }

    let mut payload: Vec<Value> = Vec::with_capacity(others.len());
    for g in &others {
        // clearedFod is only fetched for CLEARED groups (Prisma findFirst).
        let cleared = if g.status == FodGroupStatus::Cleared {
            fetch_cleared_fod_json(state, g.mission_id, g.group_id).await?
        } else {
            Value::Null
        };
        // Field order mirrors the Node object literal. NOTE the shipped bug:
        // Node reads `fodGroup.biggestFod` which is undefined on a Prisma row
        // (the column is `biggestFodId`) → JSON.stringify omits it. We omit the
        // `biggestFod` key too, and send the real `biggestFodSize`. (PARITY)
        let mut obj = serde_json::Map::new();
        obj.insert("groupId".into(), json!(g.group_id));
        obj.insert("missionId".into(), json!(g.mission_id));
        obj.insert("status".into(), json!(g.status));
        obj.insert("version".into(), json!(g.version.unwrap_or(0)));
        obj.insert("updatedAt".into(), json!(iso(g.updated_at)));
        obj.insert("dirty".into(), json!(g.dirty.unwrap_or(false)));
        obj.insert("biggestFodSize".into(), json!(g.biggest_fod_size));
        obj.insert("clearedFod".into(), cleared);
        payload.push(Value::Object(obj));
    }

    let payload = Value::Array(payload);
    tracing::info!(
        "resolveFodGroup → POST /api/fod-group/resolve ({} group(s)): {}",
        others.len(),
        payload
    );

    let resolved: Vec<Value> = match car_call(
        state,
        reqwest::Method::POST,
        "/api/fod-group/resolve",
        Some(payload),
    )
    .await
    {
        Some((status, Value::Array(arr))) if is_2xx(status) => arr,
        Some((status, _)) => {
            // Non-2xx or non-array body → push not applied; dirty flags retained.
            tracing::warn!("resolve push returned status {status}; dirty flags retained");
            return Ok(());
        }
        None => {
            // Timeout / transport error → dirty flags retained, retry next tick.
            tracing::warn!("resolve push failed/timed out; dirty flags retained");
            return Ok(());
        }
    };

    // Upsert ClearedFod for CLEARED results (create-on-conflict-do-nothing).
    for data in &resolved {
        if data.get("status").and_then(|s| s.as_str()) == Some("CLEARED")
            && let Some(cf) = data.get("clearedFod")
            && cf.is_object()
            && let Err(e) = upsert_cleared_fod(state, cf).await
        {
            tracing::warn!("clearedFod upsert (resolve) failed: {e}");
        }
    }

    // Successful push: apply resolved status + clear dirty for each row.
    for data in &resolved {
        let (Some(gid), Some(mid), Some(st)) = (
            data.get("groupId").and_then(Value::as_i64),
            data.get("missionId").and_then(Value::as_i64),
            data.get("status").and_then(Value::as_str),
        ) else {
            continue;
        };
        let ver = data.get("version").and_then(Value::as_i64).unwrap_or(0);
        if let Err(e) = sqlx::query(
            r#"UPDATE "FodGroup" SET "status" = $1::"FodGroupStatus", "version" = $4, "dirty" = false, "updatedAt" = now() WHERE "groupId" = $2 AND "missionId" = $3"#,
        )
        .bind(st)
        .bind(gid as i32)
        .bind(mid)
        .bind(ver)
        .execute(&state.db)
        .await
        {
            tracing::warn!("FodGroup resolve-update failed (group {gid}/mission {mid}): {e}");
        } else if let Some(io) = state.io() {
            if let Some(gui_ns) = io.of("/gui") {
                let _ = gui_ns
                    .emit(
                        "update",
                        &json!({
                            "type": "fodGroup",
                            "message": {
                                "groupId": gid,
                                "missionId": mid,
                                "status": st
                            }
                        }),
                    )
                    .await;
            }
        }
    }

    Ok(())
}

// ─────────────────────── sync_service: syncMission ───────────────────────

async fn sync_mission(state: &AppState) -> anyhow::Result<()> {
    let ids: Vec<i64> = sqlx::query_scalar(r#"SELECT "id" FROM "Mission""#)
        .fetch_all(&state.db)
        .await?;

    // GET /api/mission/exclude { missionList: [ids] } — car returns missions the
    // local DB does not yet have. Node uses `create`; excluded ⇒ non-existent, so
    // ON CONFLICT DO NOTHING is behaviourally identical and race-safe.
    if let Some((status, data)) =
        car_call(state, reqwest::Method::GET, "/api/mission/exclude", Some(json!({ "missionList": ids })))
            .await
        && is_2xx(status)
    {
        if let Err(e) = reconcile_active_mission(state, &data).await {
            tracing::warn!("activeMission reconciliation failed in sync_mission: {e}");
        }

        if let Some(list) = data.get("missionList").and_then(Value::as_array) {
            for m in list {
                if let Err(e) = insert_mission_full(state, m).await {
                    tracing::warn!("mission create failed: {e}");
                }
            }
        }
    }

    // Active mission if any, otherwise latest mission by createdAt (fallback 1)
    let active_id: Option<i64> = sqlx::query_scalar(
        r#"SELECT "id" FROM "Mission" WHERE "status" = 'ACTIVE' ORDER BY "createdAt" DESC LIMIT 1"#,
    )
    .fetch_optional(&state.db)
    .await?;

    let mission_id = match active_id {
        Some(id) => id,
        None => {
            let latest: Option<i64> = sqlx::query_scalar(
                r#"SELECT "id" FROM "Mission" ORDER BY "createdAt" DESC LIMIT 1"#,
            )
            .fetch_optional(&state.db)
            .await?;
            latest.unwrap_or(1)
        }
    };
    sync_fod(state, mission_id).await?;
    Ok(())
}

pub async fn sync_fod(state: &AppState, mission_id: i64) -> anyhow::Result<()> {
    let groups = sqlx::query_as::<_, FodGroup>(r#"SELECT * FROM "FodGroup" WHERE "missionId" = $1"#)
        .bind(mission_id)
        .fetch_all(&state.db)
        .await?;

    // Node maps biggestFodId → `biggestFod` in this payload (unlike resolveFodGroup).
    let fod_list: Vec<Value> = groups
        .iter()
        .map(|g| {
            json!({
                "groupId": g.group_id,
                "missionId": g.mission_id,
                "status": g.status,
                "updatedAt": iso(g.updated_at),
                "biggestFod": g.biggest_fod_id,
                "biggestFodSize": g.biggest_fod_size,
            })
        })
        .collect();

    let body = json!({ "missionId": mission_id, "fodList": fod_list });
    let Some((status, data)) =
        car_call(state, reqwest::Method::POST, "/api/fod-group/sync/groups", Some(body)).await
    else {
        return Ok(());
    };
    if !is_2xx(status) {
        return Ok(());
    }
    let Some(updated) = data.get("fodGroups").and_then(Value::as_array) else {
        return Ok(());
    };
    if updated.is_empty() {
        return Ok(());
    }

    for g in updated {
        let Some(gid) = g.get("groupId").and_then(Value::as_i64) else {
            continue;
        };
        let gid = gid as i32;
        let new_status = g.get("status").and_then(Value::as_str);
        let biggest_fod = g.get("biggestFod").and_then(Value::as_str);
        let biggest_fod_size = g.get("biggestFodSize").and_then(Value::as_f64).map(|s| s as i32);

        let id = uuid::Uuid::new_v4().to_string();
        let st = new_status.unwrap_or("NEW");
        let created = g.get("createdAt").and_then(Value::as_str);
        let updated_at = g.get("updatedAt").and_then(Value::as_str);

        let group_mission_id = g.get("missionId").and_then(Value::as_i64).unwrap_or(mission_id);

        let incoming_ver = g.get("version").and_then(Value::as_i64).unwrap_or(0);

        let local: Option<FodGroup> = match sqlx::query_as::<_, FodGroup>(
            r#"SELECT * FROM "FodGroup" WHERE "groupId" = $1 AND "missionId" = $2"#,
        )
        .bind(gid)
        .bind(group_mission_id)
        .fetch_optional(&state.db)
        .await
        {
            Ok(opt) => opt,
            Err(e) => {
                tracing::warn!("sync_fod check local group error: {e}");
                None
            }
        };

        let mut should_emit = false;
        match local {
            None => {
                let insert_res = sqlx::query(
                    r#"INSERT INTO "FodGroup" ("id","groupId","missionId","dirty","status","version","biggestFodId","biggestFodSize","createdAt","updatedAt")
                       VALUES ($1,$2,$3,false,$4::"FodGroupStatus",$5,$6,$7, COALESCE($8::timestamp, now()), COALESCE($9::timestamp, now()))"#,
                )
                .bind(id)
                .bind(gid)
                .bind(group_mission_id)
                .bind(st)
                .bind(incoming_ver)
                .bind(biggest_fod)
                .bind(biggest_fod_size)
                .bind(created)
                .bind(updated_at)
                .execute(&state.db)
                .await;

                if let Err(e) = insert_res {
                    tracing::warn!("sync_fod insert FodGroup {gid} error: {e}");
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
                        r#"UPDATE "FodGroup" SET "status" = 'CLEARED'::"FodGroupStatus", "version" = $1, "dirty" = false, "updatedAt" = now() WHERE "groupId" = $2 AND "missionId" = $3"#,
                    )
                    .bind(incoming_ver)
                    .bind(gid)
                    .bind(group_mission_id)
                    .execute(&state.db)
                    .await;

                    if local_g.status != FodGroupStatus::Cleared {
                        should_emit = true;
                    }
                } else if local_dirty {
                    // Local operator decision in progress; retain local until resolved with upstream.
                } else if local_ver > incoming_ver {
                    // Collector is ahead of upstream (e.g. resolved on ATC, now reconnected to Car).
                    // Retain local status and version, and mark dirty so resolve_fod_group pushes to Car.
                    let _ = sqlx::query(
                        r#"UPDATE "FodGroup" SET "dirty" = true, "updatedAt" = now() WHERE "groupId" = $1 AND "missionId" = $2 AND "dirty" IS NOT TRUE"#,
                    )
                    .bind(gid)
                    .bind(group_mission_id)
                    .execute(&state.db)
                    .await;
                } else {
                    // incoming_ver >= local_ver: upstream has matching or newer authoritative version.
                    let status_changed = local_g.status.to_string() != st;
                    let _ = sqlx::query(
                        r#"UPDATE "FodGroup" SET
                            "status" = $1::"FodGroupStatus",
                            "version" = $2,
                            "dirty" = false,
                            "biggestFodId" = COALESCE($3, "FodGroup"."biggestFodId"),
                            "biggestFodSize" = COALESCE($4, "FodGroup"."biggestFodSize"),
                            "updatedAt" = now()
                        WHERE "groupId" = $5 AND "missionId" = $6"#,
                    )
                    .bind(st)
                    .bind(incoming_ver)
                    .bind(biggest_fod)
                    .bind(biggest_fod_size)
                    .bind(gid)
                    .bind(group_mission_id)
                    .execute(&state.db)
                    .await;

                    if status_changed {
                        should_emit = true;
                    }
                }
            }
        }

        // primaryPacket → createFodBatch (R1's fod-ingest + imagewriter; the
        // fn ignores its missionId arg for parity — each fod carries its own).
        if let Some(packet) = g.get("primaryPacket").filter(|v| !v.is_null()) {
            crate::services::create_fod_batch(state, vec![packet.clone()], group_mission_id.into())
                .await;
        }

        if let Some(cf) = g.get("clearedFod")
            && cf.is_object()
            && let Err(e) = upsert_cleared_fod(state, cf).await
        {
            tracing::warn!("clearedFod upsert (syncFod) failed: {e}");
        }

        if should_emit {
            if let Some(io) = state.io() {
                if let Some(gui_ns) = io.of("/gui") {
                    let _ = gui_ns
                        .emit(
                            "update",
                            &json!({
                                "type": "fodGroup",
                                "message": {
                                    "groupId": gid,
                                    "missionId": group_mission_id,
                                    "status": st
                                }
                            }),
                        )
                        .await;
                }
            }
        }
    }

    // Sync biggest FOD entities from Car backend into Fod table
    let biggest_fods = crate::services::fetch_biggest_fods_for_mission(state, mission_id).await;
    for f in biggest_fods {
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

        let res = sqlx::query(
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

        if let Err(e) = res {
            tracing::warn!("Failed to upsert FOD {}: {e}", f.id);
        } else {
            let _ = sqlx::query(
                r#"UPDATE "FodGroup" SET "biggestFodId" = $1, "biggestFodSize" = $2, "updatedAt" = now()
                   WHERE "groupId" = $3 AND "missionId" = $4
                     AND ("biggestFodId" IS DISTINCT FROM $1 OR "biggestFodSize" IS DISTINCT FROM $2)"#
            )
            .bind(&f.id)
            .bind(f.size as i32)
            .bind(f.group_id as i32)
            .bind(f.mission_id)
            .execute(&state.db)
            .await;
        }

        // Cache frame image locally if available
        if !f.image_sha256.is_empty() {
            let m_str = f.mission_id.to_string();
            let g_str = f.group_id.to_string();
            let img_file = std::path::Path::new("fod-images/mission")
                .join(&m_str)
                .join(&g_str)
                .join(format!("{}.jpg", f.id));
            if !img_file.exists() {
                if let Some(bytes) = crate::services::fetch_image_from_car(state, &f.image_sha256, false).await {
                    let _ = crate::imagewriter::write_fod_jpeg(&m_str, &g_str, &f.id, &bytes).await;
                }
            }
        }
    }

    Ok(())
}

// ──────────────────── sync("missionList") : syncMissionList ────────────────────

async fn sync_mission_list(state: &AppState) -> anyhow::Result<()> {
    let ids: Vec<i64> = sqlx::query_scalar(r#"SELECT "id" FROM "Mission""#)
        .fetch_all(&state.db)
        .await?;

    let Some((status, data)) =
        car_call(state, reqwest::Method::GET, "/api/mission/exclude", Some(json!({ "missionList": ids })))
            .await
    else {
        return Ok(()); // Node catches the error, logs, returns.
    };
    if !is_2xx(status) {
        return Ok(());
    }

    // ── activeMission reconciliation ──
    if let Err(e) = reconcile_active_mission(state, &data).await {
        tracing::warn!("activeMission reconciliation failed: {e}");
    }

    // ── upsert each excluded mission: create {...mission}, update {} ──
    if let Some(list) = data.get("missionList").and_then(Value::as_array) {
        for m in list {
            if let Err(e) = insert_mission_full(state, m).await {
                tracing::warn!("mission upsert failed: {e}");
            }
        }
    }
    // PARITY: Node's `if (newMissions?.MissionList?.length)` createMany is dead
    // code (the response key is `missionList`, lowercase m) — intentionally omitted.
    Ok(())
}

// ─────────────────────────── shared table helpers ───────────────────────────

/// Reconcile active mission state with the upstream car backend.
/// If upstream has no active mission (or the active mission was terminated),
/// any locally ACTIVE mission is immediately demoted to INACTIVE.
pub async fn reconcile_active_mission(state: &AppState, data: &Value) -> anyhow::Result<()> {
    let current_active_id: Option<i64> =
        sqlx::query_scalar(r#"SELECT "id" FROM "Mission" WHERE "status" = 'ACTIVE' LIMIT 1"#)
            .fetch_optional(&state.db)
            .await?;

    let upstream_active = data.get("activeMission").and_then(|v| v.as_object());
    let upstream_active_id = upstream_active.and_then(|am| am.get("id")).and_then(Value::as_i64);
    let upstream_status = upstream_active
        .and_then(|am| am.get("status"))
        .and_then(Value::as_str)
        .unwrap_or("ACTIVE");

    match (current_active_id, upstream_active_id) {
        (Some(cur), Some(aid)) if cur != aid || upstream_status != "ACTIVE" => {
            // Local active differs or upstream active mission is no longer ACTIVE
            sqlx::query(r#"UPDATE "Mission" SET "status" = 'INACTIVE', "updatedAt" = now() WHERE "id" = $1"#)
                .bind(cur)
                .execute(&state.db)
                .await?;
        }
        (Some(cur), None) => {
            // Upstream has NO active mission (e.g. terminated from another instance),
            // demote any local active mission.
            sqlx::query(r#"UPDATE "Mission" SET "status" = 'INACTIVE', "updatedAt" = now() WHERE "id" = $1"#)
                .bind(cur)
                .execute(&state.db)
                .await?;
        }
        _ => {}
    }

    if let (Some(am), Some(aid)) = (upstream_active, upstream_active_id) {
        if upstream_status == "ACTIVE" {
            let created = am.get("createdAt").and_then(Value::as_str);
            sqlx::query(
                r#"INSERT INTO "Mission" ("id","createdAt","updatedAt")
                   VALUES ($1, COALESCE($2::timestamp, now()), now())
                   ON CONFLICT ("id") DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = now()"#,
            )
            .bind(aid)
            .bind(created)
            .execute(&state.db)
            .await?;
        }
    }

    Ok(())
}

/// Prisma `mission.create({data: mission})` / `upsert({create:{...mission}, update:{}})`.
/// Full mission row from car-backend JSON; ON CONFLICT DO NOTHING (empty update).
async fn insert_mission_full(state: &AppState, m: &Value) -> anyhow::Result<()> {
    let Some(id) = m.get("id").and_then(Value::as_i64) else {
        return Ok(());
    };
    let status = m.get("status").and_then(Value::as_str).unwrap_or("ACTIVE");
    let scan_status = m.get("scanStatus").and_then(Value::as_str).unwrap_or("PAUSE");
    let timer = m.get("timer").and_then(Value::as_f64).unwrap_or(0.0);
    let pass = m.get("pass").and_then(Value::as_i64).map(|v| v as i32);
    let speed = m.get("speed").and_then(Value::as_i64).map(|v| v as i32);
    let created_at = m.get("createdAt").and_then(Value::as_str);
    let updated_at = m.get("updatedAt").and_then(Value::as_str);
    let created_by = m.get("createdBy").and_then(Value::as_str);
    let updated_by = m.get("updatedBy").and_then(Value::as_str);
    let dirty = m.get("dirty").and_then(Value::as_bool).unwrap_or(false);
    let previous_time = m.get("previousTime").and_then(Value::as_str);

    sqlx::query(
        r#"INSERT INTO "Mission"
           ("id","status","timer","scanStatus","pass","speed","createdAt","updatedAt","createdBy","updatedBy","dirty","previousTime")
           VALUES ($1, $2::"MissionStatus", $3, $4::"MissionScanStatus", $5, $6,
                   COALESCE($7::timestamp, now()), COALESCE($8::timestamp, now()), $9, $10, $11, COALESCE($12::timestamp, now()))
           ON CONFLICT ("id") DO NOTHING"#,
    )
    .bind(id)
    .bind(status)
    .bind(timer)
    .bind(scan_status)
    .bind(pass)
    .bind(speed)
    .bind(created_at)
    .bind(updated_at)
    .bind(created_by)
    .bind(updated_by)
    .bind(dirty)
    .bind(previous_time)
    .execute(&state.db)
    .await?;
    Ok(())
}

/// Prisma `clearedFod.findFirst({where:{missionId, groupId}})` serialized to JSON
/// (camelCase + iso millis, via the ClearedFod Serialize impl), or null.
async fn fetch_cleared_fod_json(
    state: &AppState,
    mission_id: i64,
    group_id: i32,
) -> anyhow::Result<Value> {
    let row = sqlx::query_as::<_, ClearedFod>(
        r#"SELECT * FROM "ClearedFod" WHERE "missionId" = $1 AND "groupId" = $2 LIMIT 1"#,
    )
    .bind(mission_id)
    .bind(group_id)
    .fetch_optional(&state.db)
    .await?;
    Ok(match row {
        Some(c) => serde_json::to_value(c)?,
        None => Value::Null,
    })
}

/// Prisma `clearedFod.upsert({where:{groupId_missionId}, create: <json>, update: {}})`.
/// Defensive insert from a car-backend ClearedFod object; ON CONFLICT DO NOTHING.
async fn upsert_cleared_fod(state: &AppState, cf: &Value) -> anyhow::Result<()> {
    let (Some(gid), Some(mid)) = (
        cf.get("groupId").and_then(Value::as_i64),
        cf.get("missionId").and_then(Value::as_i64),
    ) else {
        return Ok(()); // missing keys → nothing to key on
    };
    let id = cf
        .get("id")
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let status = cf.get("status").and_then(Value::as_str).unwrap_or("found");
    let location = cf
        .get("location")
        .cloned()
        .unwrap_or(Value::Object(Default::default()));
    let before: Vec<String> = str_array(cf.get("beforeClearImg"));
    let after: Vec<String> = str_array(cf.get("afterClearImg"));
    let created_at = cf.get("createdAt").and_then(Value::as_str);
    let created_by = cf.get("createdBy").and_then(Value::as_str);
    let updated_by = cf.get("updatedBy").and_then(Value::as_str);

    sqlx::query(
        r#"INSERT INTO "ClearedFod"
           ("id","status","beforeClearImg","afterClearImg","location","groupId","missionId","createdAt","updatedAt","createdBy","updatedBy","dirty")
           VALUES ($1, $2::"ClearedFodStatus", $3, $4, $5, $6, $7, COALESCE($8::timestamp, now()), now(), $9, $10, false)
           ON CONFLICT ("groupId","missionId") DO NOTHING"#,
    )
    .bind(id)
    .bind(status)
    .bind(&before)
    .bind(&after)
    .bind(location)
    .bind(gid as i32)
    .bind(mid)
    .bind(created_at)
    .bind(created_by)
    .bind(updated_by)
    .execute(&state.db)
    .await?;
    Ok(())
}

fn str_array(v: Option<&Value>) -> Vec<String> {
    v.and_then(Value::as_array)
        .map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect())
        .unwrap_or_default()
}

pub fn spawn_user_sync_service(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(3));
        ticker.set_missed_tick_behavior(MissedTickBehavior::Delay);
        let mut cycle: u64 = 0;
        loop {
            ticker.tick().await;
            cycle = cycle.wrapping_add(1);
            let full_reconcile = cycle == 1 || (cycle % 5) == 0;
            if let Err(e) = sync_users_cycle(&state, full_reconcile).await {
                tracing::debug!("User sync cycle warning: {e}");
            }
        }
    });
}

async fn sync_users_cycle(state: &AppState, full_reconcile: bool) -> anyhow::Result<()> {
    // 1. Push any dirty users in zoid_client to upstream Car/ATC
    let dirty_users = sqlx::query_as::<_, crate::models::User>(
        r#"SELECT * FROM "User" WHERE "dirty" = true"#,
    )
    .fetch_all(&state.db)
    .await?;

    for user in dirty_users {
        if crate::services::push_user_to_upstream(state, &user).await {
            let _ = sqlx::query(r#"UPDATE "User" SET "dirty" = false WHERE "id" = $1"#)
                .bind(&user.id)
                .execute(&state.db)
                .await;
        }
    }

    // 2. Pull users from upstream Car/ATC
    let latest_ts: Option<sqlx::types::chrono::NaiveDateTime> = sqlx::query_scalar(
        r#"SELECT MAX("updatedAt") FROM "User""#,
    )
    .fetch_one(&state.db)
    .await?;

    let since_ms = latest_ts
        .map(|dt| dt.and_utc().timestamp_millis())
        .unwrap_or(0);

    let incoming = crate::services::pull_users_from_upstream(state, since_ms, full_reconcile).await;

    // Prune users identified as deleted in delta sync
    for del in incoming.deleted_usernames {
        let _ = sqlx::query(
            r#"DELETE FROM "User" WHERE ("username" = $1 OR LOWER("username") = LOWER($1)) AND ("dirty" IS NOT TRUE)"#,
        )
        .bind(&del)
        .execute(&state.db)
        .await;
    }

    // Full reconciliation: prune any local non-dirty user missing from upstream active users
    if let Some(active_names) = incoming.all_active_usernames {
        let local_users = sqlx::query_as::<_, (String, String)>(
            r#"SELECT "id", "username" FROM "User" WHERE "dirty" IS NOT TRUE"#,
        )
        .fetch_all(&state.db)
        .await
        .unwrap_or_default();

        for (local_id, local_name) in local_users {
            let exists_upstream = active_names.iter().any(|a| a.eq_ignore_ascii_case(&local_name));
            if !exists_upstream {
                tracing::info!("User '{}' ({}) deleted upstream; removing locally", local_name, local_id);
                let _ = sqlx::query(r#"DELETE FROM "User" WHERE "id" = $1"#)
                    .bind(&local_id)
                    .execute(&state.db)
                    .await;
            }
        }
    }

    for u in incoming.users {
        let role = match proto_defination::user::UserRole::try_from(u.role).unwrap_or(proto_defination::user::UserRole::Collector) {
            proto_defination::user::UserRole::Admin => "ADMIN",
            proto_defination::user::UserRole::Collector => "COLLECTOR",
            proto_defination::user::UserRole::Driver => "DRIVER",
            proto_defination::user::UserRole::Guest => "GUEST",
            _ => "COLLECTOR",
        };

        let created_at = if u.created_at_ms > 0 {
            chrono::DateTime::from_timestamp_millis(u.created_at_ms)
                .map(|dt| dt.naive_utc())
                .unwrap_or_else(|| chrono::Utc::now().naive_utc())
        } else {
            chrono::Utc::now().naive_utc()
        };
        let updated_at = if u.updated_at_ms > 0 {
            chrono::DateTime::from_timestamp_millis(u.updated_at_ms)
                .map(|dt| dt.naive_utc())
                .unwrap_or_else(|| chrono::Utc::now().naive_utc())
        } else {
            chrono::Utc::now().naive_utc()
        };

        let id = if u.id.is_empty() {
            uuid::Uuid::new_v4().to_string()
        } else {
            u.id
        };

        let _ = sqlx::query(
            r#"
            INSERT INTO "User" ("id", "username", "firstName", "lastName", "password", "isActive", "role", "dirty", "createdAt", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7::"Role", false, $8, $9)
            ON CONFLICT ("username") DO UPDATE
            SET "firstName" = EXCLUDED."firstName",
                "lastName" = EXCLUDED."lastName",
                "password" = CASE WHEN EXCLUDED."password" != '' THEN EXCLUDED."password" ELSE "User"."password" END,
                "isActive" = EXCLUDED."isActive",
                "role" = EXCLUDED."role",
                "updatedAt" = EXCLUDED."updatedAt"
            WHERE "User"."updatedAt" <= EXCLUDED."updatedAt" AND ("User"."dirty" IS NOT TRUE)
            "#,
        )
        .bind(id)
        .bind(&u.username)
        .bind(&u.first_name)
        .bind(&u.last_name)
        .bind(&u.password_hash)
        .bind(u.is_active)
        .bind(role)
        .bind(created_at)
        .bind(updated_at)
        .execute(&state.db)
        .await;
    }

    Ok(())
}
