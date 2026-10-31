use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "mission_status", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MissionStatus {
    Active,
    Inactive,
    Terminated,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "mission_scan_status", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MissionScanStatus {
    Play,
    Pause,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "fod_group_status", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FodGroupStatus {
    New,
    Accepted,
    Rejected,
    Cleared,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "cleared_fod_status", rename_all = "snake_case")]
pub enum ClearedFodStatus {
    Found,
    NotFound,
    FalsePositive,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, sqlx::Type)]
#[sqlx(type_name = "user_role", rename_all = "snake_case")]
pub enum UserRole {
    Admin,
    Collector,
    Driver,
    Guest,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct MissionRow {
    pub id: i64,
    pub status: MissionStatus,
    pub timer: i64,
    pub scan_status: MissionScanStatus,
    pub speed: Option<i32>,
    pub pass: Option<i32>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub created_by: Option<String>,
    pub updated_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FodGroupRow {
    pub id: i64,
    pub mission_id: i64,
    pub group_id: i64,
    pub status: FodGroupStatus,
    pub version: i64,
    pub biggest_fod: Option<Uuid>,
    pub biggest_fod_size: Option<f64>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    /// Per-node version vector; `version` == sum(vv).
    pub vv: sqlx::types::Json<zoid_replication::VersionVector>,
    pub decided_at_ms: i64,
    pub updated_by: String,
    /// Replica-only: local change not yet acknowledged by the primary.
    pub dirty: bool,
}

/// A versioned state to persist for a group (see `Db::mutate_fod_group`).
#[derive(Debug, Clone)]
pub struct GroupWrite {
    pub state: zoid_replication::VersionedGroup,
    pub dirty: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FodRow {
    pub id: Uuid,
    pub mission_id: i64,
    pub group_id: i64,
    pub sysid: Option<String>,
    pub cam_id: Option<String>,
    pub lat: f64,
    pub lon: f64,
    pub sd: f64,
    pub confidence: Option<f64>,
    pub class: Option<String>,
    pub velocity: f64,
    pub size: f64,
    pub image_sha256: Option<String>,
    pub image_size: Option<i32>,
    pub frame_missing: bool,
    pub captured_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ClearedFodRow {
    pub id: Uuid,
    pub mission_id: i64,
    pub group_id: i64,
    pub status: ClearedFodStatus,
    pub before_image_sha256: Vec<String>,
    pub after_image_sha256: Vec<String>,
    pub lat: f64,
    pub lon: f64,
    pub sd: f64,
    pub created_at: DateTime<Utc>,
    pub created_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ChangeLogRow {
    pub seq: i64,
    pub entity: i16,
    pub entity_key: String,
    pub committed_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AppliedCommandRow {
    pub command_id: Uuid,
    pub outcome: i16,
    pub group_version: i64,
    pub applied_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PendingCommandRow {
    pub command_id: Uuid,
    pub mission_id: i64,
    pub group_id: i64,
    pub desired_status: FodGroupStatus,
    pub base_version: i64,
    pub operator_id: String,
    pub payload: Option<Vec<u8>>,
    pub state: i16,
    pub created_at: DateTime<Utc>,
}

// ----------------- Proto Conversion Implementations -----------------

impl From<MissionStatus> for proto_defination::common::MissionStatus {
    fn from(s: MissionStatus) -> Self {
        match s {
            MissionStatus::Active => proto_defination::common::MissionStatus::Active,
            MissionStatus::Inactive => proto_defination::common::MissionStatus::Inactive,
            MissionStatus::Terminated => proto_defination::common::MissionStatus::Terminated,
        }
    }
}

impl From<proto_defination::common::MissionStatus> for MissionStatus {
    fn from(s: proto_defination::common::MissionStatus) -> Self {
        match s {
            proto_defination::common::MissionStatus::Active => MissionStatus::Active,
            proto_defination::common::MissionStatus::Inactive => MissionStatus::Inactive,
            proto_defination::common::MissionStatus::Terminated => MissionStatus::Terminated,
            proto_defination::common::MissionStatus::Unspecified => MissionStatus::Active,
        }
    }
}

impl From<MissionScanStatus> for proto_defination::common::MissionScanStatus {
    fn from(s: MissionScanStatus) -> Self {
        match s {
            MissionScanStatus::Play => proto_defination::common::MissionScanStatus::Play,
            MissionScanStatus::Pause => proto_defination::common::MissionScanStatus::Pause,
        }
    }
}

impl From<proto_defination::common::MissionScanStatus> for MissionScanStatus {
    fn from(s: proto_defination::common::MissionScanStatus) -> Self {
        match s {
            proto_defination::common::MissionScanStatus::Play => MissionScanStatus::Play,
            proto_defination::common::MissionScanStatus::Pause => MissionScanStatus::Pause,
            proto_defination::common::MissionScanStatus::ScanStatusUnspecified => MissionScanStatus::Pause,
        }
    }
}

impl From<FodGroupStatus> for proto_defination::common::FodGroupStatus {
    fn from(s: FodGroupStatus) -> Self {
        match s {
            FodGroupStatus::New => proto_defination::common::FodGroupStatus::New,
            FodGroupStatus::Accepted => proto_defination::common::FodGroupStatus::Accepted,
            FodGroupStatus::Rejected => proto_defination::common::FodGroupStatus::Rejected,
            FodGroupStatus::Cleared => proto_defination::common::FodGroupStatus::Cleared,
        }
    }
}

impl From<proto_defination::common::FodGroupStatus> for FodGroupStatus {
    fn from(s: proto_defination::common::FodGroupStatus) -> Self {
        match s {
            proto_defination::common::FodGroupStatus::New => FodGroupStatus::New,
            proto_defination::common::FodGroupStatus::Accepted => FodGroupStatus::Accepted,
            proto_defination::common::FodGroupStatus::Rejected => FodGroupStatus::Rejected,
            proto_defination::common::FodGroupStatus::Cleared => FodGroupStatus::Cleared,
            proto_defination::common::FodGroupStatus::GroupStatusUnspecified => FodGroupStatus::New,
        }
    }
}

impl From<ClearedFodStatus> for proto_defination::common::ClearedFodStatus {
    fn from(s: ClearedFodStatus) -> Self {
        match s {
            ClearedFodStatus::Found => proto_defination::common::ClearedFodStatus::Found,
            ClearedFodStatus::NotFound => proto_defination::common::ClearedFodStatus::NotFound,
            ClearedFodStatus::FalsePositive => proto_defination::common::ClearedFodStatus::FalsePositive,
        }
    }
}

impl From<proto_defination::common::ClearedFodStatus> for ClearedFodStatus {
    fn from(s: proto_defination::common::ClearedFodStatus) -> Self {
        match s {
            proto_defination::common::ClearedFodStatus::Found => ClearedFodStatus::Found,
            proto_defination::common::ClearedFodStatus::NotFound => ClearedFodStatus::NotFound,
            proto_defination::common::ClearedFodStatus::FalsePositive => ClearedFodStatus::FalsePositive,
            proto_defination::common::ClearedFodStatus::ClearedStatusUnspecified => ClearedFodStatus::Found,
        }
    }
}

impl MissionRow {
    pub fn to_proto(&self) -> proto_defination::mission::MissionDetail {
        proto_defination::mission::MissionDetail {
            id: self.id,
            status: proto_defination::common::MissionStatus::from(self.status.clone()) as i32,
            timer: self.timer,
            scan_status: proto_defination::common::MissionScanStatus::from(self.scan_status.clone()) as i32,
            speed: self.speed,
            pass: self.pass,
            created_at: self.created_at.timestamp_millis(),
            updated_at: self.updated_at.timestamp_millis(),
            created_by: self.created_by.clone(),
            updated_by: self.updated_by.clone(),
        }
    }
}

impl FodGroupRow {
    pub fn to_proto(&self) -> proto_defination::fod_group::FodGroupEntity {
        proto_defination::fod_group::FodGroupEntity {
            id: self.id,
            group_id: self.group_id,
            mission_id: self.mission_id,
            status: proto_defination::common::FodGroupStatus::from(self.status.clone()) as i32,
            biggest_fod: self.biggest_fod.map(|u| u.to_string()),
            biggest_fod_size: self.biggest_fod_size,
            version: self.version,
            created_at: self.created_at.timestamp_millis(),
            updated_at: self.updated_at.timestamp_millis(),
            pending_command_id: None,
            version_vector: zoid_replication::vv_to_map(&self.vv.0),
            decided_at_ms: self.decided_at_ms,
            updated_by: self.updated_by.clone(),
        }
    }

    pub fn versioned(&self) -> zoid_replication::VersionedGroup {
        zoid_replication::VersionedGroup {
            status: proto_defination::common::FodGroupStatus::from(self.status.clone()),
            vv: self.vv.0.clone(),
            decided_at_ms: self.decided_at_ms,
            updated_by: self.updated_by.clone(),
        }
    }
}

/// Versioned view of a group received over the wire.
pub fn versioned_from_proto(
    g: &proto_defination::fod_group::FodGroupEntity,
) -> zoid_replication::VersionedGroup {
    let mut vv = zoid_replication::vv_from_map(&g.version_vector);
    // Peer still on the old (scalar-only) protocol: file it under "legacy".
    if vv.is_empty() && g.version > 0 {
        vv.insert("legacy".to_string(), g.version);
    }
    zoid_replication::VersionedGroup {
        status: proto_defination::common::FodGroupStatus::try_from(g.status)
            .unwrap_or(proto_defination::common::FodGroupStatus::New),
        vv,
        decided_at_ms: g.decided_at_ms,
        updated_by: g.updated_by.clone(),
    }
}

impl FodRow {
    pub fn to_proto(&self) -> proto_defination::fod::FodEntity {
        proto_defination::fod::FodEntity {
            id: self.id.to_string(),
            mission_id: self.mission_id,
            group_id: self.group_id,
            sysid: self.sysid.clone().unwrap_or_default(),
            location: Some(proto_defination::common::LatLon {
                lat: self.lat,
                lon: self.lon,
                sd: self.sd,
            }),
            confidence: self.confidence.unwrap_or(0.0),
            class_name: self.class.clone().unwrap_or_default(),
            velocity: self.velocity,
            size: self.size,
            timestamp: self.captured_at.timestamp_millis(),
            image_sha256: self.image_sha256.clone().unwrap_or_default(),
            image_size: self.image_size.map(|s| s as i64).unwrap_or(0),
            frame_missing: self.frame_missing,
            created_at: self.created_at.timestamp_millis(),
        }
    }
}

impl ClearedFodRow {
    pub fn to_proto(&self) -> proto_defination::cleared_fod::ClearedFodEntity {
        proto_defination::cleared_fod::ClearedFodEntity {
            id: self.id.to_string(),
            mission_id: self.mission_id,
            group_id: self.group_id,
            status: proto_defination::common::ClearedFodStatus::from(self.status.clone()) as i32,
            before_image_sha256: self.before_image_sha256.clone(),
            after_image_sha256: self.after_image_sha256.clone(),
            location: Some(proto_defination::common::LatLon {
                lat: self.lat,
                lon: self.lon,
                sd: self.sd,
            }),
            created_at: self.created_at.timestamp_millis(),
            created_by: self.created_by.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct UserRow {
    pub id: Uuid,
    pub username: String,
    pub first_name: String,
    pub last_name: String,
    pub password_hash: String,
    pub is_active: bool,
    pub role: UserRole,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UserRow {
    pub fn to_proto(&self) -> proto_defination::user::UserEntity {
        let role = match self.role {
            UserRole::Admin => proto_defination::user::UserRole::Admin as i32,
            UserRole::Collector => proto_defination::user::UserRole::Collector as i32,
            UserRole::Driver => proto_defination::user::UserRole::Driver as i32,
            UserRole::Guest => proto_defination::user::UserRole::Guest as i32,
        };
        proto_defination::user::UserEntity {
            id: self.id.to_string(),
            username: self.username.clone(),
            first_name: self.first_name.clone(),
            last_name: self.last_name.clone(),
            password_hash: self.password_hash.clone(),
            is_active: self.is_active,
            role,
            created_at_ms: self.created_at.timestamp_millis(),
            updated_at_ms: self.updated_at.timestamp_millis(),
        }
    }
}
