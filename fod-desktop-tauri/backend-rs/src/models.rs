//! DB row types mirroring prisma/schema.prisma (database `zoid_client`).
//!
//! PARITY RULES (all agents):
//! - Prisma created tables named after the models VERBATIM: "Mission",
//!   "FodGroup", "Fod", "ClearedFod", "User" — and camelCase columns
//!   ("createdAt", "scanStatus", …). ALL identifiers must be double-quoted in
//!   SQL: `SELECT * FROM "Mission" WHERE "scanStatus" = $1`.
//! - Enums are real Postgres enum types named "MissionStatus",
//!   "MissionScanStatus", "FodGroupStatus", "ClearedFodStatus", "Role".
//! - String ids (Fod, FodGroup, ClearedFod, User) are TEXT columns holding
//!   uuids generated APP-SIDE (Prisma @default(uuid()) is client-side):
//!   generate with `uuid::Uuid::new_v4().to_string()` on insert.
//! - Prisma DateTime maps to `timestamp(3)` WITHOUT time zone → chrono
//!   `NaiveDateTime` here. JSON output must match Prisma's ISO format
//!   `2026-08-12T10:00:00.000Z` → use the `iso_millis` serializers below.
//! - `@updatedAt` is client-maintained: set "updatedAt" = now() on every
//!   UPDATE yourself; the DB does NOT do it.
//! - Use runtime sqlx (`sqlx::query`, `sqlx::query_as`) — NOT the compile-time
//!   `query!` macros (no offline prepare data in this repo).

use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::types::chrono::NaiveDateTime;

pub mod iso_millis {
    use serde::Serializer;
    use sqlx::types::chrono::NaiveDateTime;

    pub fn serialize<S: Serializer>(dt: &NaiveDateTime, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
    }
}

pub mod iso_millis_opt {
    use serde::Serializer;
    use sqlx::types::chrono::NaiveDateTime;

    pub fn serialize<S: Serializer>(
        dt: &Option<NaiveDateTime>,
        s: S,
    ) -> Result<S::Ok, S::Error> {
        match dt {
            Some(dt) => s.serialize_str(&dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()),
            None => s.serialize_none(),
        }
    }
}

#[derive(sqlx::Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[sqlx(type_name = "MissionStatus")]
pub enum MissionStatus {
    #[sqlx(rename = "ACTIVE")]
    #[serde(rename = "ACTIVE")]
    Active,
    #[sqlx(rename = "INACTIVE")]
    #[serde(rename = "INACTIVE")]
    Inactive,
    #[sqlx(rename = "TERMINATED")]
    #[serde(rename = "TERMINATED")]
    Terminated,
}

#[derive(sqlx::Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[sqlx(type_name = "MissionScanStatus")]
pub enum MissionScanStatus {
    #[sqlx(rename = "PLAY")]
    #[serde(rename = "PLAY")]
    Play,
    #[sqlx(rename = "PAUSE")]
    #[serde(rename = "PAUSE")]
    Pause,
}

#[derive(sqlx::Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[sqlx(type_name = "FodGroupStatus")]
pub enum FodGroupStatus {
    #[sqlx(rename = "NEW")]
    #[serde(rename = "NEW")]
    New,
    #[sqlx(rename = "ACCEPTED")]
    #[serde(rename = "ACCEPTED")]
    Accepted,
    #[sqlx(rename = "REJECTED")]
    #[serde(rename = "REJECTED")]
    Rejected,
    #[sqlx(rename = "CLEARED")]
    #[serde(rename = "CLEARED")]
    Cleared,
}

#[derive(sqlx::Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[sqlx(type_name = "ClearedFodStatus")]
pub enum ClearedFodStatus {
    #[sqlx(rename = "found")]
    #[serde(rename = "found")]
    Found,
    #[sqlx(rename = "not_found")]
    #[serde(rename = "not_found")]
    NotFound,
    #[sqlx(rename = "false_positive")]
    #[serde(rename = "false_positive")]
    FalsePositive,
}

#[derive(sqlx::Type, Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[sqlx(type_name = "Role")]
pub enum Role {
    #[sqlx(rename = "ADMIN")]
    #[serde(rename = "ADMIN")]
    Admin,
    #[sqlx(rename = "GUEST")]
    #[serde(rename = "GUEST")]
    Guest,
    #[sqlx(rename = "COLLECTOR")]
    #[serde(rename = "COLLECTOR")]
    Collector,
}

#[derive(sqlx::FromRow, Serialize, Clone, Debug)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Mission {
    pub id: i64,
    pub status: MissionStatus,
    pub timer: f64,
    pub scan_status: MissionScanStatus,
    pub pass: Option<i32>,
    pub speed: Option<i32>,
    #[serde(with = "iso_millis")]
    pub created_at: NaiveDateTime,
    #[serde(with = "iso_millis")]
    pub updated_at: NaiveDateTime,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub dirty: Option<bool>,
    #[serde(with = "iso_millis_opt")]
    pub previous_time: Option<NaiveDateTime>,
}

#[derive(sqlx::FromRow, Serialize, Clone, Debug)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct FodGroup {
    pub id: String,
    pub group_id: i32,
    pub mission_id: i64,
    pub status: FodGroupStatus,
    pub biggest_fod_id: Option<String>,
    pub biggest_fod_size: Option<i32>,
    pub dirty: Option<bool>,
    #[serde(with = "iso_millis")]
    pub created_at: NaiveDateTime,
    #[serde(with = "iso_millis")]
    pub updated_at: NaiveDateTime,
}

#[derive(sqlx::FromRow, Serialize, Clone, Debug)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct Fod {
    pub id: String,
    pub sysid: Option<String>,
    pub location: Value,
    pub confidence: Option<f64>,
    #[serde(with = "iso_millis")]
    pub timestamp: NaiveDateTime,
    pub class: Option<String>,
    pub velocity: f64,
    pub size: f64,
    pub mission_id: i64,
    pub group_id: i32,
    pub dirty: Option<bool>,
    #[serde(with = "iso_millis")]
    pub created_at: NaiveDateTime,
    #[serde(with = "iso_millis")]
    pub updated_at: NaiveDateTime,
    pub fod_group_id: Option<String>,
}

#[derive(sqlx::FromRow, Serialize, Clone, Debug)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct ClearedFod {
    pub id: String,
    pub status: ClearedFodStatus,
    pub before_clear_img: Vec<String>,
    pub after_clear_img: Vec<String>,
    pub location: Value,
    pub group_id: i32,
    pub mission_id: i64,
    #[serde(with = "iso_millis")]
    pub created_at: NaiveDateTime,
    #[serde(with = "iso_millis")]
    pub updated_at: NaiveDateTime,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
    pub dirty: Option<bool>,
}

#[derive(sqlx::FromRow, Serialize, Clone, Debug)]
#[sqlx(rename_all = "camelCase")]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub username: String,
    pub first_name: String,
    pub last_name: String,
    /// bcrypt hash — NEVER serialize this out of an API response without
    /// stripping it first (check what the Node handlers return).
    pub password: String,
    pub is_active: bool,
    pub role: Role,
    #[serde(with = "iso_millis")]
    pub created_at: NaiveDateTime,
    #[serde(with = "iso_millis")]
    pub updated_at: NaiveDateTime,
}
