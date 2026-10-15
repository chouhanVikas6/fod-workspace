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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocationConfig {
    pub min_lat: f64,
    pub max_lat: f64,
    pub min_lon: f64,
    pub max_lon: f64,
    pub vehicle_speed_kmh: f64,
    pub sweep_passes: u32,
    pub lane_width_m: f64,
}

impl Default for LocationConfig {
    fn default() -> Self {
        Self {
            min_lat: 9.9400,
            max_lat: 9.9500,
            min_lon: 76.2700,
            max_lon: 76.2800,
            vehicle_speed_kmh: 25.0,
            sweep_passes: 3,
            lane_width_m: 10.0,
        }
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
        assert!(cfg.auto_react);
    }
}

