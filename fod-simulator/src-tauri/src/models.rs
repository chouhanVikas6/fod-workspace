use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulatorConfig {
    pub grpc_endpoint: String,
    pub throughput_hz: f64,
    pub batch_size: usize,
    pub total_target_count: Option<u64>,
    pub mission_id: i64,
    pub sysid: String,
    pub auto_react: bool,
    #[serde(default = "default_device_count")]
    pub device_count: usize,
}

fn default_device_count() -> usize {
    1
}

impl Default for SimulatorConfig {
    fn default() -> Self {
        Self {
            grpc_endpoint: "http://127.0.0.1:50051".to_string(),
            throughput_hz: 5.0,
            batch_size: 5,
            total_target_count: Some(2000),
            mission_id: 1,
            sysid: "sim-vehicle-01".to_string(),
            auto_react: true,
            device_count: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CameraConfig {
    pub cam_id: String,
    pub enabled: bool,
    pub connected: bool,
    pub paused: bool,
    pub intr_fps: f64,
    pub vg_fps: f64,
    pub ms_fps: f64,
    pub lateral_offset_m: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct GeoPoint {
    pub lat: f64,
    pub lon: f64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PathKind {
    AutoSweep,
    Waypoint,
    Freehand,
}

fn default_path_kind() -> PathKind {
    PathKind::Waypoint
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Pathway {
    pub id: String,
    pub name: String,
    #[serde(default = "default_path_kind")]
    pub kind: PathKind,
    pub points: Vec<GeoPoint>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub reversed: bool,
    #[serde(default)]
    pub speed_kmh: Option<f64>,
    #[serde(default)]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PathMode {
    AutoSweep,
    CustomSequence,
}

fn default_path_mode() -> PathMode {
    PathMode::AutoSweep
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LoopMode {
    Loop,
    PingPong,
    Once,
}

fn default_loop_mode() -> LoopMode {
    LoopMode::Loop
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HumanDriveConfig {
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default = "default_corner_smoothness")]
    pub corner_smoothness: f64,
    #[serde(default = "default_lateral_weave")]
    pub lateral_weave_m: f64,
    #[serde(default = "default_speed_variance")]
    pub speed_variance_pct: f64,
    #[serde(default = "default_true")]
    pub smooth_curves: bool,
}

fn default_corner_smoothness() -> f64 {
    0.7
}
fn default_lateral_weave() -> f64 {
    0.35
}
fn default_speed_variance() -> f64 {
    6.0
}

impl Default for HumanDriveConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            corner_smoothness: default_corner_smoothness(),
            lateral_weave_m: default_lateral_weave(),
            speed_variance_pct: default_speed_variance(),
            smooth_curves: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledSegmentPreview {
    pub pathway_id: String,
    pub pathway_name: String,
    pub pathway_index: usize,
    pub is_transit: bool,
    pub color: Option<String>,
    pub points: Vec<GeoPoint>,
    pub length_m: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompiledRoutePreview {
    pub segments: Vec<CompiledSegmentPreview>,
    pub total_length_m: f64,
    pub estimated_duration_secs: f64,
    pub boundary_area_m2: f64,
    pub boundary_perimeter_m: f64,
    pub auto_sweep_lanes: Vec<Vec<GeoPoint>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTilesInfo {
    pub available: bool,
    pub base_url: String,
    pub min_zoom: u8,
    pub max_zoom: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationConfig {
    #[serde(default = "default_boundary_points")]
    pub boundary_points: Vec<GeoPoint>,
    #[serde(default = "default_true")]
    pub enforce_boundary: bool,
    #[serde(default = "default_vehicle_speed")]
    pub vehicle_speed_kmh: f64,
    #[serde(default = "default_sweep_passes")]
    pub sweep_passes: u32,
    #[serde(default = "default_lane_width")]
    pub lane_width_m: f64,
    #[serde(default)]
    pub sweep_angle_deg: Option<f64>,
    #[serde(default)]
    pub reverse_sweep: bool,
    #[serde(default = "default_true")]
    pub serpentine_sweep: bool,
    #[serde(default = "default_path_mode")]
    pub path_mode: PathMode,
    #[serde(default)]
    pub pathways: Vec<Pathway>,
    #[serde(default = "default_true")]
    pub connect_pathways: bool,
    #[serde(default = "default_loop_mode")]
    pub loop_mode: LoopMode,
    #[serde(default)]
    pub human_drive: HumanDriveConfig,
}

fn default_boundary_points() -> Vec<GeoPoint> {
    vec![
        GeoPoint { lat: 9.9400, lon: 76.2700 },
        GeoPoint { lat: 9.9400, lon: 76.2800 },
        GeoPoint { lat: 9.9500, lon: 76.2800 },
        GeoPoint { lat: 9.9500, lon: 76.2700 },
    ]
}

fn default_vehicle_speed() -> f64 {
    25.0
}
fn default_sweep_passes() -> u32 {
    3
}
fn default_lane_width() -> f64 {
    10.0
}

impl Default for LocationConfig {
    fn default() -> Self {
        Self {
            boundary_points: default_boundary_points(),
            enforce_boundary: true,
            vehicle_speed_kmh: default_vehicle_speed(),
            sweep_passes: default_sweep_passes(),
            lane_width_m: default_lane_width(),
            sweep_angle_deg: None,
            reverse_sweep: false,
            serpentine_sweep: true,
            path_mode: PathMode::AutoSweep,
            pathways: Vec::new(),
            connect_pathways: true,
            loop_mode: LoopMode::Loop,
            human_drive: HumanDriveConfig::default(),
        }
    }
}

#[allow(dead_code)]
impl LocationConfig {
    pub fn polygon(&self) -> Vec<(f64, f64)> {
        self.boundary_points
            .iter()
            .map(|p| (p.lat, p.lon))
            .collect()
    }

    pub fn centroid(&self) -> (f64, f64) {
        if self.boundary_points.is_empty() {
            return (9.9450, 76.2750);
        }
        let n = self.boundary_points.len() as f64;
        let sum_lat: f64 = self.boundary_points.iter().map(|p| p.lat).sum();
        let sum_lon: f64 = self.boundary_points.iter().map(|p| p.lon).sum();
        (sum_lat / n, sum_lon / n)
    }

    pub fn min_lat(&self) -> f64 {
        self.boundary_points
            .iter()
            .map(|p| p.lat)
            .fold(f64::INFINITY, f64::min)
    }

    pub fn max_lat(&self) -> f64 {
        self.boundary_points
            .iter()
            .map(|p| p.lat)
            .fold(f64::NEG_INFINITY, f64::max)
    }

    pub fn min_lon(&self) -> f64 {
        self.boundary_points
            .iter()
            .map(|p| p.lon)
            .fold(f64::INFINITY, f64::min)
    }

    pub fn max_lon(&self) -> f64 {
        self.boundary_points
            .iter()
            .map(|p| p.lon)
            .fold(f64::NEG_INFINITY, f64::max)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HealthConfig {
    pub cpu_pct: f64,
    pub mem_pct: f64,
    pub disk_pct: f64,
    pub temp_c: f64,
    pub gnss_fix: String,
    pub gnss_sd: f64,
    pub voltage: f64,
    pub ping_latency_ms: i32,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            cpu_pct: 35.0,
            mem_pct: 42.0,
            disk_pct: 68.0,
            temp_c: 54.0,
            gnss_fix: "RTK".to_string(),
            gnss_sd: 0.015,
            voltage: 12.6,
            ping_latency_ms: 12,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RandomizationConfig {
    pub min_size_cm: f64,
    pub max_size_cm: f64,
    pub min_confidence: f64,
    pub max_confidence: f64,
    pub weight_metallic: f64,
    pub weight_non_metallic: f64,
    pub weight_organic: f64,
    pub weight_rock: f64,
    pub cluster_probability: f64,
}

impl Default for RandomizationConfig {
    fn default() -> Self {
        Self {
            min_size_cm: 1.0,
            max_size_cm: 20.0,
            min_confidence: 0.80,
            max_confidence: 0.99,
            weight_metallic: 40.0,
            weight_non_metallic: 30.0,
            weight_organic: 20.0,
            weight_rock: 10.0,
            cluster_probability: 0.25,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CustomPayloadConfig {
    pub use_custom: bool,
    pub custom_class: Option<String>,
    pub corrupt_image: bool,
    pub force_invalid_coords: bool,
    pub duplicate_uuid: Option<String>,
    pub extra_metadata: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImageFolderItem {
    pub path: String,
    pub filename: String,
    pub size_bytes: u64,
    pub thumbnail_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceStreamStatus {
    pub device_id: String,
    pub node_name: String,
    pub connected: bool,
    pub sent: u64,
    pub accepted: u64,
    pub rejected: u64,
    pub duplicate: u64,
}

pub fn device_identity(base_sysid: &str, index: usize, total_devices: usize) -> (String, String) {
    let trimmed = base_sysid.trim();
    let base = if trimmed.is_empty() {
        "sim-vehicle"
    } else {
        trimmed
    };
    let node_name = format!("sim-pc-node-{:02}", index + 1);
    let device_id = if total_devices <= 1 {
        base.to_string()
    } else {
        format!("{}-{:02}", base, index + 1)
    };
    (device_id, node_name)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SimulatorTelemetry {
    pub running: bool,
    pub paused: bool,
    pub total_sent: u64,
    pub total_accepted: u64,
    pub total_rejected: u64,
    pub total_duplicate: u64,
    pub current_hz: f64,
    pub current_lat: f64,
    pub current_lon: f64,
    pub current_heading: f64,
    pub current_speed_kmh: f64,
    pub active_camera_count: usize,
    pub last_status: String,
    pub uptime_secs: u64,
    #[serde(default)]
    pub connected_devices: usize,
    #[serde(default)]
    pub devices: Vec<DeviceStreamStatus>,
    #[serde(default)]
    pub active_path_index: Option<usize>,
    #[serde(default)]
    pub active_path_name: Option<String>,
    #[serde(default)]
    pub route_progress_pct: f64,
    #[serde(default)]
    pub route_distance_m: f64,
    #[serde(default)]
    pub total_route_length_m: f64,
    #[serde(default)]
    pub lap_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandLogEntry {
    pub id: String,
    pub timestamp: i64,
    pub raw_command: String,
    pub command_type: String,
    pub target_cam: Option<String>,
    pub mission_id: Option<i64>,
    pub status: String,
    pub auto_reacted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullStateResponse {
    pub config: SimulatorConfig,
    pub cameras: Vec<CameraConfig>,
    pub location: LocationConfig,
    pub health: HealthConfig,
    pub random: RandomizationConfig,
    pub custom: CustomPayloadConfig,
    pub command_logs: Vec<CommandLogEntry>,
}


pub fn default_cameras() -> Vec<CameraConfig> {
    let mut cams = Vec::with_capacity(26);

    // FLIR 00 to 07
    for i in 0..8 {
        let cam_id = format!("flir{:02}", i);
        let offset = match i {
            0 => 0.0,
            1 => -0.5,
            2 => 0.5,
            3 => -1.2,
            4 => 1.2,
            5 => -2.0,
            6 => 2.0,
            _ => 0.0,
        };
        cams.push(CameraConfig {
            cam_id,
            enabled: true,
            connected: true,
            paused: false,
            intr_fps: 30.0,
            vg_fps: 30.0,
            ms_fps: 15.0,
            lateral_offset_m: offset,
        });
    }

    // Lucid 08 to 25
    for i in 8..26 {
        let cam_id = format!("lucid{:02}", i);
        let offset = ((i as f64 - 16.0) / 10.0) * 2.0;
        cams.push(CameraConfig {
            cam_id,
            enabled: true,
            connected: true,
            paused: false,
            intr_fps: 25.0,
            vg_fps: 25.0,
            ms_fps: 12.0,
            lateral_offset_m: offset,
        });
    }

    cams
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_cameras_count_and_naming() {
        let cams = default_cameras();
        assert_eq!(cams.len(), 26, "Expected 26 camera slots");
        assert_eq!(cams[0].cam_id, "flir00");
        assert_eq!(cams[7].cam_id, "flir07");
        assert_eq!(cams[8].cam_id, "lucid08");
        assert_eq!(cams[25].cam_id, "lucid25");
    }

    #[test]
    fn test_simulator_config_defaults() {
        let cfg = SimulatorConfig::default();
        assert_eq!(cfg.throughput_hz, 5.0);
        assert_eq!(cfg.batch_size, 5);
        assert_eq!(cfg.total_target_count, Some(2000));
        assert_eq!(cfg.device_count, 1);
        assert!(cfg.auto_react);
    }

    #[test]
    fn test_device_identity_single_and_multi() {
        assert_eq!(
            device_identity("sim-vehicle-01", 0, 1),
            ("sim-vehicle-01".to_string(), "sim-pc-node-01".to_string())
        );
        assert_eq!(
            device_identity("sim-vehicle", 0, 3),
            ("sim-vehicle-01".to_string(), "sim-pc-node-01".to_string())
        );
        assert_eq!(
            device_identity("sim-vehicle", 2, 3),
            ("sim-vehicle-03".to_string(), "sim-pc-node-03".to_string())
        );
    }
}

