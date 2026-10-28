use crate::models::{
    AppliedCommandRow, ChangeLogRow, ClearedFodRow, FodGroupRow, FodGroupStatus, FodRow,
    MissionRow, MissionScanStatus, MissionStatus, UserRole, UserRow,
};
use crate::Db;
use uuid::Uuid;
use zoid_core::{Result, ZoidError};

impl Db {
    // ----------------- Mission Queries -----------------

    pub async fn get_mission(&self, id: i64) -> Result<Option<MissionRow>> {
        sqlx::query_as::<_, MissionRow>("SELECT * FROM missions WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_active_mission(&self) -> Result<Option<MissionRow>> {
        sqlx::query_as::<_, MissionRow>(
            "SELECT * FROM missions WHERE status = 'ACTIVE' ORDER BY created_at DESC LIMIT 1",
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn create_mission(
        &self,
        id: i64,
        speed: Option<i32>,
        pass: Option<i32>,
    ) -> Result<MissionRow> {
        sqlx::query_as::<_, MissionRow>(
            r#"
            INSERT INTO missions (id, status, scan_status, speed, pass)
            VALUES ($1, 'ACTIVE', 'PAUSE', $2, $3)
            RETURNING *
            "#,
        )
        .bind(id)
        .bind(speed)
        .bind(pass)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn update_mission(
        &self,
        mission_id: i64,
        status: Option<MissionStatus>,
        scan_status: Option<MissionScanStatus>,
        timer: Option<i64>,
        speed: Option<i32>,
        pass: Option<i32>,
    ) -> Result<MissionRow> {
        sqlx::query_as::<_, MissionRow>(
            r#"
            UPDATE missions
            SET
                status = COALESCE($2, status),
                scan_status = COALESCE($3, scan_status),
                timer = COALESCE($4, timer),
                speed = COALESCE($5, speed),
                pass = COALESCE($6, pass),
                updated_at = now()
            WHERE id = $1
            RETURNING *
            "#,
        )
        .bind(mission_id)
        .bind(status)
        .bind(scan_status)
        .bind(timer)
        .bind(speed)
        .bind(pass)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn update_scan_status(
        &self,
        mission_id: i64,
        status: MissionScanStatus,
    ) -> Result<()> {
        sqlx::query("UPDATE missions SET scan_status = $1, updated_at = now() WHERE id = $2")
            .bind(status)
            .bind(mission_id)
            .execute(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn terminate_mission(&self, mission_id: i64) -> Result<()> {
        sqlx::query(
            "UPDATE missions SET status = 'TERMINATED', scan_status = 'PAUSE', updated_at = now() WHERE id = $1",
        )
        .bind(mission_id)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;
        Ok(())
    }

    pub async fn list_missions(&self, limit: i64, offset: i64) -> Result<(Vec<MissionRow>, i64)> {
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM missions")
            .fetch_one(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))?;

        let rows = sqlx::query_as::<_, MissionRow>(
            "SELECT * FROM missions ORDER BY created_at DESC LIMIT $1 OFFSET $2",
        )
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok((rows, total.0))
    }

    pub async fn get_mission_stats(&self, mission_id: i64) -> Result<(i64, i64)> {
        let group_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM fod_groups WHERE mission_id = $1")
                .bind(mission_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| ZoidError::Database(e.to_string()))?;

        let fod_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM fods WHERE mission_id = $1")
            .bind(mission_id)
            .fetch_one(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok((group_count.0, fod_count.0))
    }

    // ----------------- FOD Group Queries -----------------

    pub async fn get_fod_group(
        &self,
        mission_id: i64,
        group_id: i64,
    ) -> Result<Option<FodGroupRow>> {
        sqlx::query_as::<_, FodGroupRow>(
            "SELECT * FROM fod_groups WHERE mission_id = $1 AND group_id = $2",
        )
        .bind(mission_id)
        .bind(group_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_group_count(&self, mission_id: i64) -> Result<i64> {
        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM fod_groups WHERE mission_id = $1")
                .bind(mission_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| ZoidError::Database(e.to_string()))?;
        Ok(count.0)
    }

    pub async fn list_fod_groups(
        &self,
        mission_id: i64,
        limit: i64,
        offset: i64,
    ) -> Result<(Vec<FodGroupRow>, i64)> {
        let total: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM fod_groups WHERE mission_id = $1")
                .bind(mission_id)
                .fetch_one(&self.pool)
                .await
                .map_err(|e| ZoidError::Database(e.to_string()))?;

        let rows = sqlx::query_as::<_, FodGroupRow>(
            "SELECT * FROM fod_groups WHERE mission_id = $1 ORDER BY group_id ASC LIMIT $2 OFFSET $3",
        )
        .bind(mission_id)
        .bind(limit)
        .bind(offset)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok((rows, total.0))
    }

    pub async fn upsert_fod_group(
        &self,
        mission_id: i64,
        group_id: i64,
        biggest_fod: Option<Uuid>,
        biggest_fod_size: Option<f64>,
    ) -> Result<FodGroupRow> {
        sqlx::query_as::<_, FodGroupRow>(
            r#"
            INSERT INTO fod_groups (mission_id, group_id, status, version, biggest_fod, biggest_fod_size)
            VALUES ($1, $2, 'NEW', 0, $3, $4)
            ON CONFLICT (mission_id, group_id) DO UPDATE
            SET
                biggest_fod = CASE
                    WHEN EXCLUDED.biggest_fod_size > COALESCE(fod_groups.biggest_fod_size, 0)
                    THEN EXCLUDED.biggest_fod
                    ELSE fod_groups.biggest_fod
                END,
                biggest_fod_size = CASE
                    WHEN EXCLUDED.biggest_fod_size > COALESCE(fod_groups.biggest_fod_size, 0)
                    THEN EXCLUDED.biggest_fod_size
                    ELSE fod_groups.biggest_fod_size
                END,
                updated_at = now()
            RETURNING *
            "#,
        )
        .bind(mission_id)
        .bind(group_id)
        .bind(biggest_fod)
        .bind(biggest_fod_size)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn update_fod_group_status(
        &self,
        mission_id: i64,
        group_id: i64,
        desired_status: FodGroupStatus,
        expected_version: i64,
    ) -> Result<Option<FodGroupRow>> {
        sqlx::query_as::<_, FodGroupRow>(
            r#"
            UPDATE fod_groups
            SET status = $1, version = version + 1, updated_at = now()
            WHERE mission_id = $2 AND group_id = $3 AND version = $4
            RETURNING *
            "#,
        )
        .bind(desired_status)
        .bind(mission_id)
        .bind(group_id)
        .bind(expected_version)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    // ----------------- FOD Queries -----------------

    pub async fn get_fod(&self, id: Uuid) -> Result<Option<FodRow>> {
        sqlx::query_as::<_, FodRow>("SELECT * FROM fods WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_fods_for_group(
        &self,
        mission_id: i64,
        group_id: i64,
        excluded_ids: &[Uuid],
    ) -> Result<Vec<FodRow>> {
        if excluded_ids.is_empty() {
            sqlx::query_as::<_, FodRow>(
                "SELECT * FROM fods WHERE mission_id = $1 AND group_id = $2 ORDER BY captured_at ASC",
            )
            .bind(mission_id)
            .bind(group_id)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
        } else {
            sqlx::query_as::<_, FodRow>(
                "SELECT * FROM fods WHERE mission_id = $1 AND group_id = $2 AND id != ALL($3) ORDER BY captured_at ASC",
            )
            .bind(mission_id)
            .bind(group_id)
            .bind(excluded_ids)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
        }
    }

    pub async fn get_biggest_fods_for_mission(&self, mission_id: i64) -> Result<Vec<FodRow>> {
        sqlx::query_as::<_, FodRow>(
            r#"
            SELECT DISTINCT ON (group_id) *
            FROM fods
            WHERE mission_id = $1
            ORDER BY group_id, size DESC, captured_at ASC
            "#,
        )
        .bind(mission_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn insert_fod(&self, fod: &FodRow) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO fods (
                id, mission_id, group_id, sysid, cam_id,
                lat, lon, sd, confidence, class,
                velocity, size, image_sha256, image_size,
                frame_missing, captured_at, created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(fod.id)
        .bind(fod.mission_id)
        .bind(fod.group_id)
        .bind(&fod.sysid)
        .bind(&fod.cam_id)
        .bind(fod.lat)
        .bind(fod.lon)
        .bind(fod.sd)
        .bind(fod.confidence)
        .bind(&fod.class)
        .bind(fod.velocity)
        .bind(fod.size)
        .bind(&fod.image_sha256)
        .bind(fod.image_size)
        .bind(fod.frame_missing)
        .bind(fod.captured_at)
        .bind(fod.created_at)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    // ----------------- Cleared FOD Queries -----------------

    pub async fn get_cleared_fod(
        &self,
        mission_id: i64,
        group_id: i64,
    ) -> Result<Option<ClearedFodRow>> {
        sqlx::query_as::<_, ClearedFodRow>(
            "SELECT * FROM cleared_fods WHERE mission_id = $1 AND group_id = $2",
        )
        .bind(mission_id)
        .bind(group_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn insert_cleared_fod(&self, cleared: &ClearedFodRow) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO cleared_fods (
                id, mission_id, group_id, status,
                before_image_sha256, after_image_sha256,
                lat, lon, sd, created_at, created_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(cleared.id)
        .bind(cleared.mission_id)
        .bind(cleared.group_id)
        .bind(&cleared.status)
        .bind(&cleared.before_image_sha256)
        .bind(&cleared.after_image_sha256)
        .bind(cleared.lat)
        .bind(cleared.lon)
        .bind(cleared.sd)
        .bind(cleared.created_at)
        .bind(&cleared.created_by)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    // ----------------- Replication & Change Log -----------------

    pub async fn append_change(&self, entity: i16, entity_key: &str) -> Result<i64> {
        let row: (i64,) = sqlx::query_as(
            r#"
            INSERT INTO change_log (seq, entity, entity_key)
            VALUES (nextval('change_seq'), $1, $2)
            RETURNING seq
            "#,
        )
        .bind(entity)
        .bind(entity_key)
        .fetch_one(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(row.0)
    }

    pub async fn get_changes_since(&self, since_seq: i64, limit: i64) -> Result<Vec<ChangeLogRow>> {
        sqlx::query_as::<_, ChangeLogRow>(
            "SELECT * FROM change_log WHERE seq > $1 ORDER BY seq ASC LIMIT $2",
        )
        .bind(since_seq)
        .bind(limit)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_head_seq(&self) -> Result<i64> {
        let row: Option<(Option<i64>,)> = sqlx::query_as("SELECT MAX(seq) FROM change_log")
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(row.and_then(|r| r.0).unwrap_or(0))
    }

    pub async fn record_applied_command(
        &self,
        cmd_id: Uuid,
        outcome: i16,
        group_version: i64,
    ) -> Result<()> {
        sqlx::query(
            "INSERT INTO applied_commands (command_id, outcome, group_version) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        )
        .bind(cmd_id)
        .bind(outcome)
        .bind(group_version)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn get_applied_command(&self, cmd_id: Uuid) -> Result<Option<AppliedCommandRow>> {
        sqlx::query_as::<_, AppliedCommandRow>(
            "SELECT * FROM applied_commands WHERE command_id = $1",
        )
        .bind(cmd_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))
    }

    // ----------------- Replica Helpers -----------------

    pub async fn get_upstream_cursor(&self, node_id: &str) -> Result<i64> {
        let row: Option<(i64,)> = sqlx::query_as(
            "SELECT cursor FROM upstream_cursor WHERE upstream_node_id = $1",
        )
        .bind(node_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(row.map(|r| r.0).unwrap_or(0))
    }

    pub async fn update_upstream_cursor(&self, node_id: &str, cursor: i64) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO upstream_cursor (upstream_node_id, cursor, updated_at)
            VALUES ($1, $2, now())
            ON CONFLICT (upstream_node_id) DO UPDATE
            SET cursor = EXCLUDED.cursor, updated_at = now()
            "#,
        )
        .bind(node_id)
        .bind(cursor)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn upsert_replicated_mission(
        &self,
        m: &proto_defination::mission::MissionDetail,
    ) -> Result<()> {
        let status = proto_defination::common::MissionStatus::try_from(m.status)
            .map(MissionStatus::from)
            .unwrap_or(MissionStatus::Active);
        let scan = proto_defination::common::MissionScanStatus::try_from(m.scan_status)
            .map(MissionScanStatus::from)
            .unwrap_or(MissionScanStatus::Pause);

        sqlx::query(
            r#"
            INSERT INTO missions (id, status, scan_status, timer, speed, pass)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE
            SET status = EXCLUDED.status, scan_status = EXCLUDED.scan_status,
                timer = EXCLUDED.timer, speed = EXCLUDED.speed, pass = EXCLUDED.pass,
                updated_at = now()
            "#,
        )
        .bind(m.id)
        .bind(status)
        .bind(scan)
        .bind(m.timer)
        .bind(m.speed)
        .bind(m.pass)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn ensure_mission_exists(&self, id: i64) -> Result<()> {
        sqlx::query(
            r#"
            INSERT INTO missions (id, status, scan_status, timer, speed, pass)
            VALUES ($1, 'ACTIVE', 'PAUSE', 0, 20, 1)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(id)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn upsert_replicated_fod_group(
        &self,
        g: &proto_defination::fod_group::FodGroupEntity,
    ) -> Result<()> {
        let status = proto_defination::common::FodGroupStatus::try_from(g.status)
            .map(FodGroupStatus::from)
            .unwrap_or(FodGroupStatus::New);
        let biggest_fod = g
            .biggest_fod
            .as_ref()
            .and_then(|u| Uuid::parse_str(u).ok());

        sqlx::query(
            r#"
            INSERT INTO fod_groups (mission_id, group_id, status, version, biggest_fod, biggest_fod_size)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (mission_id, group_id) DO UPDATE
            SET status = EXCLUDED.status, version = EXCLUDED.version,
                biggest_fod = EXCLUDED.biggest_fod, biggest_fod_size = EXCLUDED.biggest_fod_size,
                updated_at = now()
            "#,
        )
        .bind(g.mission_id)
        .bind(g.group_id)
        .bind(status)
        .bind(g.version)
        .bind(biggest_fod)
        .bind(g.biggest_fod_size)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    pub async fn upsert_replicated_fod(&self, f: &proto_defination::fod::FodEntity) -> Result<()> {
        let id = Uuid::parse_str(&f.id).unwrap_or_else(|_| Uuid::new_v4());
        let (lat, lon, sd) = f
            .location
            .as_ref()
            .map(|l| (l.lat, l.lon, l.sd))
            .unwrap_or((0.0, 0.0, 0.0));
        let captured_at =
            chrono::DateTime::from_timestamp_millis(f.timestamp).unwrap_or_else(chrono::Utc::now);

        sqlx::query(
            r#"
            INSERT INTO fods (
                id, mission_id, group_id, sysid,
                lat, lon, sd, confidence, class,
                velocity, size, image_sha256, image_size,
                frame_missing, captured_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
            ON CONFLICT (id) DO NOTHING
            "#,
        )
        .bind(id)
        .bind(f.mission_id)
        .bind(f.group_id)
        .bind(&f.sysid)
        .bind(lat)
        .bind(lon)
        .bind(sd)
        .bind(f.confidence)
        .bind(&f.class_name)
        .bind(f.velocity)
        .bind(f.size)
        .bind(&f.image_sha256)
        .bind(f.image_size as i32)
        .bind(f.frame_missing)
        .bind(captured_at)
        .execute(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        Ok(())
    }

    // ----------------- User Queries & Sync -----------------

    pub async fn get_user(&self, id: Uuid) -> Result<Option<UserRow>> {
        sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_user_by_username(&self, username: &str) -> Result<Option<UserRow>> {
        sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE username = $1")
            .bind(username)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_all_users(&self) -> Result<Vec<UserRow>> {
        sqlx::query_as::<_, UserRow>("SELECT * FROM users ORDER BY created_at ASC")
            .fetch_all(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn get_users_since(&self, since: chrono::DateTime<chrono::Utc>) -> Result<Vec<UserRow>> {
        sqlx::query_as::<_, UserRow>("SELECT * FROM users WHERE updated_at >= $1 ORDER BY updated_at ASC")
            .bind(since)
            .fetch_all(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))
    }

    pub async fn upsert_replicated_user(&self, u: &proto_defination::user::UserEntity) -> Result<UserRow> {
        let id = Uuid::parse_str(&u.id).unwrap_or_else(|_| Uuid::new_v4());
        let role = match proto_defination::user::UserRole::try_from(u.role).unwrap_or(proto_defination::user::UserRole::Collector) {
            proto_defination::user::UserRole::Admin => UserRole::Admin,
            proto_defination::user::UserRole::Collector => UserRole::Collector,
            proto_defination::user::UserRole::Driver => UserRole::Driver,
            proto_defination::user::UserRole::Guest => UserRole::Guest,
            _ => UserRole::Collector,
        };
        let created_at = if u.created_at_ms > 0 {
            chrono::DateTime::from_timestamp_millis(u.created_at_ms).unwrap_or_else(chrono::Utc::now)
        } else {
            chrono::Utc::now()
        };
        let updated_at = if u.updated_at_ms > 0 {
            chrono::DateTime::from_timestamp_millis(u.updated_at_ms).unwrap_or_else(chrono::Utc::now)
        } else {
            chrono::Utc::now()
        };

        let row = sqlx::query_as::<_, UserRow>(
            r#"
            INSERT INTO users (id, username, first_name, last_name, password_hash, is_active, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (username) DO UPDATE
            SET first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                password_hash = CASE WHEN EXCLUDED.password_hash != '' THEN EXCLUDED.password_hash ELSE users.password_hash END,
                is_active = EXCLUDED.is_active,
                role = EXCLUDED.role,
                updated_at = EXCLUDED.updated_at
            WHERE users.updated_at <= EXCLUDED.updated_at
            RETURNING *
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
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| ZoidError::Database(e.to_string()))?;

        if let Some(r) = row {
            Ok(r)
        } else {
            // Already newer in DB
            self.get_user_by_username(&u.username)
                .await?
                .ok_or_else(|| ZoidError::Database("User not found after upsert".to_string()))
        }
    }

    pub async fn delete_user_by_username(&self, username: &str) -> Result<bool> {
        let res = sqlx::query("DELETE FROM users WHERE username = $1")
            .bind(username)
            .execute(&self.pool)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))?;
        Ok(res.rows_affected() > 0)
    }
}

