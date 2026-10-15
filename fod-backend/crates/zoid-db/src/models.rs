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
        }
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
