use crate::geo_engine::GeoEngine;
use crate::grpc_client::{GrpcClientManager, GrpcDispatchHandle};
use crate::image_feeder::ImageFeeder;
use crate::models::{
    default_cameras, CameraConfig, CommandLogEntry, CustomPayloadConfig, HealthConfig,
    LocationConfig, RandomizationConfig, SimulatorConfig, SimulatorTelemetry,
};
use proto_defination::ingest::{
    telemetry_frame::Kind, CameraHealth, CameraHealthBatch, CarData, Detection, DetectionBatch,
    GpsFix, PcHealth, TelemetryFrame,
};
use proto_defination::mission_control::mission_control_service_client::MissionControlServiceClient;
use proto_defination::mission_control::{MissionEvent, MissionSubscriptionRequest};
use rand::distributions::WeightedIndex;
use rand::prelude::*;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::{Mutex, RwLock};
use uuid::Uuid;

pub struct SimulatorEngine {
    app_handle: AppHandle,
    pub config: Arc<RwLock<SimulatorConfig>>,
    pub cameras: Arc<RwLock<Vec<CameraConfig>>>,
    pub location_config: Arc<RwLock<LocationConfig>>,
    pub health_config: Arc<RwLock<HealthConfig>>,
    pub random_config: Arc<RwLock<RandomizationConfig>>,
    pub custom_config: Arc<RwLock<CustomPayloadConfig>>,
    pub image_feeder: ImageFeeder,
    pub command_logs: Arc<RwLock<Vec<CommandLogEntry>>>,

    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    total_sent: Arc<AtomicU64>,
    batch_seq: Arc<AtomicU64>,
    grpc_handle: Arc<Mutex<Option<GrpcDispatchHandle>>>,
}

pub fn make_camera_health_list(cams: &[CameraConfig]) -> Vec<CameraHealth> {
    let now = chrono::Utc::now().timestamp_millis();
    cams.iter()
        .map(|c| {
            let is_active = c.enabled && c.connected;
            let is_paused = c.paused || !c.enabled;
            let fps = if is_active && !is_paused { c.intr_fps } else { 0.0 };
            let vg = if is_active && !is_paused { c.vg_fps } else { 0.0 };
            let ms = if is_active && !is_paused { c.ms_fps } else { 0.0 };
            CameraHealth {
                cam_id: c.cam_id.clone(),
                connected: is_active,
                intr_fps: fps,
                paused: is_paused,
                vg_fps: vg,
                ms_fps: ms,
                timestamp: now,
            }
        })
        .collect()
}

impl SimulatorEngine {
    pub fn new(app_handle: AppHandle) -> Self {
        Self {
            app_handle,
            config: Arc::new(RwLock::new(SimulatorConfig::default())),
            cameras: Arc::new(RwLock::new(default_cameras())),
            location_config: Arc::new(RwLock::new(LocationConfig::default())),
            health_config: Arc::new(RwLock::new(HealthConfig::default())),
            random_config: Arc::new(RwLock::new(RandomizationConfig::default())),
            custom_config: Arc::new(RwLock::new(CustomPayloadConfig::default())),
            image_feeder: ImageFeeder::new(),
            command_logs: Arc::new(RwLock::new(Vec::new())),
            running: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            total_sent: Arc::new(AtomicU64::new(0)),
            batch_seq: Arc::new(AtomicU64::new(1)),
            grpc_handle: Arc::new(Mutex::new(None)),
        }
    }

    pub async fn start(&self) -> Result<(), String> {
        if self.running.load(Ordering::SeqCst) {
            self.paused.store(false, Ordering::SeqCst);
            return Ok(());
        }

        let endpoint = self.config.read().await.grpc_endpoint.clone();
        let dispatch_handle = GrpcClientManager::start_streams(&endpoint).await?;
        *self.grpc_handle.lock().await = Some(dispatch_handle);

        self.running.store(true, Ordering::SeqCst);
        self.paused.store(false, Ordering::SeqCst);

        let running_flag = self.running.clone();
        let paused_flag = self.paused.clone();
        let config_arc = self.config.clone();
        let cameras_arc = self.cameras.clone();
        let loc_arc = self.location_config.clone();
        let health_arc = self.health_config.clone();
        let rand_arc = self.random_config.clone();
        let custom_arc = self.custom_config.clone();
        let feeder = self.image_feeder.clone();
        let grpc_lock = self.grpc_handle.clone();
        let total_sent_counter = self.total_sent.clone();
        let batch_seq_counter = self.batch_seq.clone();
        let app = self.app_handle.clone();

        tauri::async_runtime::spawn(async move {
            let start_time = Instant::now();
            let mut last_telemetry_tick = Instant::now();

            while running_flag.load(Ordering::SeqCst) {
                let is_paused = paused_flag.load(Ordering::SeqCst);

                let cfg = config_arc.read().await.clone();
                let loc_cfg = loc_arc.read().await.clone();
                let geo_engine = GeoEngine::new(&loc_cfg);

                // Check quota limit
                if let Some(target) = cfg.total_target_count {
                    if total_sent_counter.load(Ordering::Relaxed) >= target {
                        running_flag.store(false, Ordering::SeqCst);
                        let _ = app.emit("simulator-quota-reached", target);
                        break;
                    }
                }

                let hz = cfg.throughput_hz.clamp(0.1, 200.0);
                let batch_size = cfg.batch_size.clamp(1, 50);
                let interval_micros = ((1_000_000.0 / hz) as u64).max(500);

                let elapsed_secs = start_time.elapsed().as_secs_f64();
                let car_pos = geo_engine.get_position_at_time(elapsed_secs);

                // Collect active cameras
                let active_cameras: Vec<CameraConfig> = {
                    let cams = cameras_arc.read().await;
                    cams.iter()
                        .filter(|c| c.enabled && c.connected && !c.paused)
                        .cloned()
                        .collect()
                };

                let rand_cfg = rand_arc.read().await.clone();
                let custom_cfg = custom_arc.read().await.clone();

                if !is_paused && !active_cameras.is_empty() {
                    // Generate batch in scoped block so ThreadRng is dropped before any await
                    let batch = {
                        let mut rng = rand::thread_rng();
                        let mut detections = Vec::with_capacity(batch_size);

                        let weights = [
                            rand_cfg.weight_metallic.max(1.0),
                            rand_cfg.weight_non_metallic.max(1.0),
                            rand_cfg.weight_organic.max(1.0),
                            rand_cfg.weight_rock.max(1.0),
                        ];
                        let dist = WeightedIndex::new(&weights).unwrap_or_else(|_| WeightedIndex::new([1.0, 1.0, 1.0, 1.0]).unwrap());
                        let class_names = ["Metallic", "Non-Metallic", "Organic", "Rocks/Asphalt"];

                        for _ in 0..batch_size {
                            let cam = active_cameras.choose(&mut rng).unwrap();
                            let class_name = if let Some(ref c) = custom_cfg.custom_class {
                                c.clone()
                            } else {
                                class_names[dist.sample(&mut rng)].to_string()
                            };

                            let size = rng.gen_range(rand_cfg.min_size_cm..=rand_cfg.max_size_cm);
                            let confidence = rng.gen_range(rand_cfg.min_confidence..=rand_cfg.max_confidence);

                            let (det_lat, det_lon) = if custom_cfg.force_invalid_coords {
                                (-1.0, -1.0)
                            } else {
                                let forward_jitter = rng.gen_range(-1.0..=4.0);
                                let (cand_lat, cand_lon) = GeoEngine::offset_coordinate(
                                    car_pos.lat,
                                    car_pos.lon,
                                    car_pos.heading_deg,
                                    cam.lateral_offset_m,
                                    forward_jitter,
                                );
                                if geo_engine.is_inside_boundary(cand_lat, cand_lon) {
                                    (cand_lat, cand_lon)
                                } else {
                                    geo_engine.clamp_to_boundary(cand_lat, cand_lon, car_pos.lat, car_pos.lon)
                                }
                            };

                            let sample_idx = total_sent_counter.load(Ordering::Relaxed) as usize;
                            let (crop_jpeg, _sha) = feeder.get_sample_frame(sample_idx, custom_cfg.corrupt_image);

                            let uid = if let Some(ref dup) = custom_cfg.duplicate_uuid {
                                dup.clone()
                            } else {
                                Uuid::new_v4().to_string()
                            };

                            detections.push(Detection {
                                uid,
                                cam_id: cam.cam_id.clone(),
                                lat: det_lat,
                                lon: det_lon,
                                sd: 0.015,
                                confidence,
                                class_name,
                                velocity: car_pos.speed_kmh,
                                size,
                                captured_at_ms: chrono::Utc::now().timestamp_millis(),
                                crop_jpeg,
                                sysid: cfg.sysid.clone(),
                            });
                        }

                        DetectionBatch {
                            producer_id: cfg.sysid.clone(),
                            batch_seq: batch_seq_counter.fetch_add(1, Ordering::Relaxed),
                            detections,
                        }
                    };

                    let count = batch.detections.len() as u64;
                    let handle_opt = {
                        let guard = grpc_lock.lock().await;
                        guard.clone()
                    };

                    if let Some(handle) = handle_opt {
                        if handle.send_detection_batch(batch).await.is_ok() {
                            total_sent_counter.fetch_add(count, Ordering::Relaxed);
                        } else {
                            let endpoint = cfg.grpc_endpoint.clone();
                            if let Ok(new_handle) = GrpcClientManager::start_streams(&endpoint).await {
                                *grpc_lock.lock().await = Some(new_handle);
                            }
                        }
                    } else {
                        let endpoint = cfg.grpc_endpoint.clone();
                        if let Ok(new_handle) = GrpcClientManager::start_streams(&endpoint).await {
                            *grpc_lock.lock().await = Some(new_handle);
                        }
                    }
                }

                // 1 Hz Telemetry & GUI status broadcast
                if last_telemetry_tick.elapsed() >= Duration::from_secs(1) {
                    last_telemetry_tick = Instant::now();

                    let h_cfg = health_arc.read().await.clone();
                    let car_data = CarData {
                        primary: Some(GpsFix {
                            fix: h_cfg.gnss_fix.clone(),
                            sd: h_cfg.gnss_sd,
                            lat: car_pos.lat,
                            lon: car_pos.lon,
                            heading: car_pos.heading_deg,
                        }),
                        secondary: Some(GpsFix {
                            fix: h_cfg.gnss_fix.clone(),
                            sd: h_cfg.gnss_sd,
                            lat: car_pos.lat,
                            lon: car_pos.lon,
                            heading: car_pos.heading_deg,
                        }),
                        velocity: car_pos.speed_kmh,
                    };

                    let cam_health_list: Vec<CameraHealth> = {
                        let cams = cameras_arc.read().await;
                        make_camera_health_list(&cams)
                    };

                    let pc_health = PcHealth {
                        node: "sim-pc-node-01".to_string(),
                        cpu_pct: h_cfg.cpu_pct,
                        mem_pct: h_cfg.mem_pct,
                        disk_pct: h_cfg.disk_pct,
                        temp_c: h_cfg.temp_c,
                    };

                    let handle_opt = {
                        let guard = grpc_lock.lock().await;
                        guard.clone()
                    };

                    if let Some(handle) = handle_opt {
                        let now = chrono::Utc::now().timestamp_millis();
                        let r1 = handle.send_telemetry(TelemetryFrame {
                            sampled_at_ms: now,
                            kind: Some(Kind::Car(car_data)),
                        }).await;
                        let r2 = handle.send_telemetry(TelemetryFrame {
                            sampled_at_ms: now,
                            kind: Some(Kind::Cameras(CameraHealthBatch { cameras: cam_health_list })),
                        }).await;
                        let r3 = handle.send_telemetry(TelemetryFrame {
                            sampled_at_ms: now,
                            kind: Some(Kind::Pc(pc_health)),
                        }).await;
                        if r1.is_err() || r2.is_err() || r3.is_err() {
                            let endpoint = cfg.grpc_endpoint.clone();
                            if let Ok(new_handle) = GrpcClientManager::start_streams(&endpoint).await {
                                *grpc_lock.lock().await = Some(new_handle);
                            }
                        }
                    } else {
                        let endpoint = cfg.grpc_endpoint.clone();
                        if let Ok(new_handle) = GrpcClientManager::start_streams(&endpoint).await {
                            *grpc_lock.lock().await = Some(new_handle);
                        }
                    }

                    // Emit Telemetry to Tauri UI
                    let (acc, rej, dup) = {
                        let guard = grpc_lock.lock().await;
                        if let Some(ref h) = *guard {
                            (
                                h.accepted_count.load(Ordering::Relaxed),
                                h.rejected_count.load(Ordering::Relaxed),
                                h.duplicate_count.load(Ordering::Relaxed),
                            )
                        } else {
                            (0, 0, 0)
                        }
                    };

                    let status_str = if !running_flag.load(Ordering::SeqCst) {
                        "Idle".to_string()
                    } else if is_paused {
                        "Paused".to_string()
                    } else {
                        "Streaming".to_string()
                    };

                    let telemetry_ui = SimulatorTelemetry {
                        running: running_flag.load(Ordering::SeqCst),
                        paused: is_paused,
                        total_sent: total_sent_counter.load(Ordering::Relaxed),
                        total_accepted: acc,
                        total_rejected: rej,
                        total_duplicate: dup,
                        current_hz: hz,
                        current_lat: car_pos.lat,
                        current_lon: car_pos.lon,
                        current_heading: car_pos.heading_deg,
                        current_speed_kmh: car_pos.speed_kmh,
                        active_camera_count: active_cameras.len(),
                        last_status: status_str,
                        uptime_secs: start_time.elapsed().as_secs(),
                    };

                    let _ = app.emit("simulator-telemetry", telemetry_ui);
                }

                tokio::time::sleep(Duration::from_micros(interval_micros)).await;
            }
        });

        Ok(())
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::SeqCst);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::SeqCst);
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::SeqCst);
        self.paused.store(false, Ordering::SeqCst);
    }

    pub async fn emit_current_telemetry(&self) {
        let running = self.running.load(Ordering::SeqCst);
        let paused = self.paused.load(Ordering::SeqCst);
        let total_sent = self.total_sent.load(Ordering::Relaxed);
        let hz = self.config.read().await.throughput_hz;
        let loc = self.location_config.read().await;
        let cams = self.cameras.read().await;
        let active_count = cams.iter().filter(|c| c.enabled && c.connected && !c.paused).count();

        let (acc, rej, dup) = {
            let guard = self.grpc_handle.lock().await;
            if let Some(ref h) = *guard {
                (
                    h.accepted_count.load(Ordering::Relaxed),
                    h.rejected_count.load(Ordering::Relaxed),
                    h.duplicate_count.load(Ordering::Relaxed),
                )
            } else {
                (0, 0, 0)
            }
        };

        let last_status = if !running {
            "Idle".to_string()
        } else if paused {
            "Paused".to_string()
        } else {
            "Streaming".to_string()
        };

        let car_pos = GeoEngine::new(&loc).get_position_at_time(0.0);

        let telemetry_ui = SimulatorTelemetry {
            running,
            paused,
            total_sent,
            total_accepted: acc,
            total_rejected: rej,
            total_duplicate: dup,
            current_hz: hz,
            current_lat: car_pos.lat,
            current_lon: car_pos.lon,
            current_heading: car_pos.heading_deg,
            current_speed_kmh: loc.vehicle_speed_kmh,
            active_camera_count: active_count,
            last_status,
            uptime_secs: 0,
        };

        let _ = self.app_handle.emit("simulator-telemetry", telemetry_ui);
    }

    pub async fn send_immediate_telemetry(&self) {
        let handle_opt = {
            let mut guard = self.grpc_handle.lock().await;
            if guard.is_none() {
                let endpoint = self.config.read().await.grpc_endpoint.clone();
                if let Ok(new_handle) = GrpcClientManager::start_streams(&endpoint).await {
                    *guard = Some(new_handle);
                }
            }
            guard.clone()
        };

        let h_cfg = self.health_config.read().await.clone();
        let loc_cfg = self.location_config.read().await.clone();
        let car_pos = GeoEngine::new(&loc_cfg).get_position_at_time(0.0);

        let car_data = CarData {
            primary: Some(GpsFix {
                fix: h_cfg.gnss_fix.clone(),
                sd: h_cfg.gnss_sd,
                lat: car_pos.lat,
                lon: car_pos.lon,
                heading: car_pos.heading_deg,
            }),
            secondary: Some(GpsFix {
                fix: h_cfg.gnss_fix.clone(),
                sd: h_cfg.gnss_sd,
                lat: car_pos.lat,
                lon: car_pos.lon,
                heading: car_pos.heading_deg,
            }),
            velocity: car_pos.speed_kmh,
        };

        let cam_health_list = {
            let cams = self.cameras.read().await;
            make_camera_health_list(&cams)
        };

        let pc_health = PcHealth {
            node: "sim-pc-node-01".to_string(),
            cpu_pct: h_cfg.cpu_pct,
            mem_pct: h_cfg.mem_pct,
            disk_pct: h_cfg.disk_pct,
            temp_c: h_cfg.temp_c,
        };

        if let Some(handle) = handle_opt {
            let now = chrono::Utc::now().timestamp_millis();
            let _ = handle.send_telemetry(TelemetryFrame {
                sampled_at_ms: now,
                kind: Some(Kind::Car(car_data)),
            }).await;
            let _ = handle.send_telemetry(TelemetryFrame {
                sampled_at_ms: now,
                kind: Some(Kind::Cameras(CameraHealthBatch { cameras: cam_health_list })),
            }).await;
            let _ = handle.send_telemetry(TelemetryFrame {
                sampled_at_ms: now,
                kind: Some(Kind::Pc(pc_health)),
            }).await;
        }

        self.emit_current_telemetry().await;
    }

    pub async fn step_single_fod(&self) -> Result<(), String> {
        let handle_opt = {
            let guard = self.grpc_handle.lock().await;
            guard.clone()
        };
        let handle = handle_opt.ok_or_else(|| "gRPC stream is not connected. Start simulator first.".to_string())?;

        let cfg = self.config.read().await.clone();
        let loc_cfg = self.location_config.read().await.clone();
        let geo_engine = GeoEngine::new(&loc_cfg);
        let car_pos = geo_engine.get_position_at_time(0.0);

        let cams = self.cameras.read().await.clone();
        let cam = cams.iter().find(|c| c.enabled && c.connected).ok_or_else(|| "No active camera enabled".to_string())?;

        let sample_idx = self.total_sent.load(Ordering::Relaxed) as usize;
        let (crop_jpeg, _) = self.image_feeder.get_sample_frame(sample_idx, false);

        let detection = Detection {
            uid: Uuid::new_v4().to_string(),
            cam_id: cam.cam_id.clone(),
            lat: car_pos.lat,
            lon: car_pos.lon,
            sd: 0.01,
            confidence: 0.95,
            class_name: "Metallic".to_string(),
            velocity: car_pos.speed_kmh,
            size: 5.5,
            captured_at_ms: chrono::Utc::now().timestamp_millis(),
            crop_jpeg,
            sysid: cfg.sysid.clone(),
        };

        let batch = DetectionBatch {
            producer_id: cfg.sysid.clone(),
            batch_seq: self.batch_seq.fetch_add(1, Ordering::Relaxed),
            detections: vec![detection],
        };

        handle.send_detection_batch(batch).await?;
        self.total_sent.fetch_add(1, Ordering::Relaxed);
        Ok(())
    }

    pub async fn burst_fods(&self, count: u32) -> Result<(), String> {
        let handle_opt = {
            let guard = self.grpc_handle.lock().await;
            guard.clone()
        };
        let handle = handle_opt.ok_or_else(|| "gRPC stream is not connected. Start simulator first.".to_string())?;

        let cfg = self.config.read().await.clone();
        let loc_cfg = self.location_config.read().await.clone();
        let geo_engine = GeoEngine::new(&loc_cfg);
        let car_pos = geo_engine.get_position_at_time(0.0);
        let cams = self.cameras.read().await.clone();
        let active_cams: Vec<_> = cams.iter().filter(|c| c.enabled && c.connected).cloned().collect();

        if active_cams.is_empty() {
            return Err("No active cameras enabled for burst".to_string());
        }

        // Generate batch in scoped block
        let batch = {
            let mut detections = Vec::with_capacity(count as usize);
            let mut rng = rand::thread_rng();

            for i in 0..count {
                let cam = active_cams.choose(&mut rng).unwrap();
                let (crop_jpeg, _) = self.image_feeder.get_sample_frame(i as usize, false);

                let (burst_lat, burst_lon) = geo_engine.random_point_in_boundary(&mut rng);

                detections.push(Detection {
                    uid: Uuid::new_v4().to_string(),
                    cam_id: cam.cam_id.clone(),
                    lat: burst_lat,
                    lon: burst_lon,
                    sd: 0.01,
                    confidence: rng.gen_range(0.85..=0.99),
                    class_name: "Metallic".to_string(),
                    velocity: car_pos.speed_kmh,
                    size: rng.gen_range(2.0..=15.0),
                    captured_at_ms: chrono::Utc::now().timestamp_millis(),
                    crop_jpeg,
                    sysid: cfg.sysid.clone(),
                });
            }

            DetectionBatch {
                producer_id: cfg.sysid.clone(),
                batch_seq: self.batch_seq.fetch_add(1, Ordering::Relaxed),
                detections,
            }
        };

        handle.send_detection_batch(batch).await?;
        self.total_sent.fetch_add(count as u64, Ordering::Relaxed);
        Ok(())
    }

    pub async fn handle_incoming_command(&self, raw: &str) -> CommandLogEntry {
        let trimmed = raw.trim();
        let lower = trimmed.to_ascii_lowercase();
        let mut cmd_type = "unknown".to_string();
        let mut target_cam = None;
        let mut mission_id = None;
        let mut status = "ACK".to_string();
        let auto_react = self.config.read().await.auto_react;
        let mut auto_reacted = false;

        if lower == "pause" || lower == "pause_all" || lower == "pause_mission" || lower == "stop_scan" {
            cmd_type = "pause".to_string();
            target_cam = Some("all".to_string());
            if auto_react {
                self.pause();
                {
                    let mut cams = self.cameras.write().await;
                    for c in cams.iter_mut() {
                        c.paused = true;
                    }
                }
                auto_reacted = true;
                self.send_immediate_telemetry().await;
            }
        } else if lower.starts_with("pause_") || lower.starts_with("pausevideo_") {
            cmd_type = "pause".to_string();
            let cam = if lower.starts_with("pause_") {
                trimmed.strip_prefix("pause_").unwrap_or("")
            } else {
                trimmed.strip_prefix("pauseVideo_").or_else(|| trimmed.strip_prefix("pausevideo_")).unwrap_or("")
            };
            if cam.eq_ignore_ascii_case("all") {
                target_cam = Some("all".to_string());
                if auto_react {
                    self.pause();
                    {
                        let mut cams = self.cameras.write().await;
                        for c in cams.iter_mut() {
                            c.paused = true;
                        }
                    }
                    auto_reacted = true;
                    self.send_immediate_telemetry().await;
                }
            } else {
                target_cam = Some(cam.to_string());
                if auto_react {
                    {
                        let mut cams = self.cameras.write().await;
                        if let Some(c) = cams.iter_mut().find(|c| c.cam_id.eq_ignore_ascii_case(cam)) {
                            c.paused = true;
                            auto_reacted = true;
                        }
                    }
                    self.send_immediate_telemetry().await;
                }
            }
        } else if lower == "resume" || lower == "play" || lower == "resume_all" || lower == "play_all" || lower == "start_scan" {
            cmd_type = "resume".to_string();
            target_cam = Some("all".to_string());
            if auto_react {
                if !self.running.load(Ordering::SeqCst) {
                    let _ = self.start().await;
                } else {
                    self.resume();
                }
                {
                    let mut cams = self.cameras.write().await;
                    for c in cams.iter_mut() {
                        c.paused = false;
                    }
                }
                auto_reacted = true;
                self.send_immediate_telemetry().await;
            }
        } else if lower.starts_with("resume_") || lower.starts_with("play_") || lower.starts_with("playvideo_") {
            cmd_type = "resume".to_string();
            let cam = if lower.starts_with("resume_") {
                trimmed.strip_prefix("resume_").unwrap_or("")
            } else if lower.starts_with("play_") {
                trimmed.strip_prefix("play_").unwrap_or("")
            } else {
                trimmed.strip_prefix("playVideo_").or_else(|| trimmed.strip_prefix("playvideo_")).unwrap_or("")
            };
            if cam.eq_ignore_ascii_case("all") {
                target_cam = Some("all".to_string());
                if auto_react {
                    if !self.running.load(Ordering::SeqCst) {
                        let _ = self.start().await;
                    } else {
                        self.resume();
                    }
                    {
                        let mut cams = self.cameras.write().await;
                        for c in cams.iter_mut() {
                            c.paused = false;
                        }
                    }
                    auto_reacted = true;
                    self.send_immediate_telemetry().await;
                }
            } else {
                target_cam = Some(cam.to_string());
                if auto_react {
                    {
                        let mut cams = self.cameras.write().await;
                        if let Some(c) = cams.iter_mut().find(|c| c.cam_id.eq_ignore_ascii_case(cam)) {
                            c.paused = false;
                            auto_reacted = true;
                        }
                    }
                    self.send_immediate_telemetry().await;
                }
            }
        } else if lower.starts_with("start") {
            cmd_type = "start".to_string();
            let parts: Vec<&str> = trimmed.split('_').collect();
            if parts.len() >= 3 {
                mission_id = parts[1].parse::<i64>().ok();
                target_cam = Some(parts[2].to_string());
            } else if parts.len() == 2 {
                mission_id = parts[1].parse::<i64>().ok();
            }

            if auto_react {
                if !self.running.load(Ordering::SeqCst) {
                    let _ = self.start().await;
                } else {
                    self.resume();
                }
                if let Some(ref cam_name) = target_cam {
                    let mut cams = self.cameras.write().await;
                    if let Some(c) = cams.iter_mut().find(|c| c.cam_id.eq_ignore_ascii_case(cam_name)) {
                        c.paused = false;
                        auto_reacted = true;
                    }
                } else {
                    let mut cams = self.cameras.write().await;
                    for c in cams.iter_mut() {
                        c.paused = false;
                    }
                    auto_reacted = true;
                }
                self.emit_current_telemetry().await;
            }
        } else if lower.starts_with("stop") || lower.starts_with("terminate") {
            cmd_type = "stop".to_string();
            let parts: Vec<&str> = trimmed.split('_').collect();
            if parts.len() > 1 {
                let second = parts[1];
                if let Ok(mid) = second.parse::<i64>() {
                    mission_id = Some(mid);
                } else if second.eq_ignore_ascii_case("all") {
                    target_cam = Some("all".to_string());
                } else {
                    target_cam = Some(second.to_string());
                }
            }

            if auto_react {
                if target_cam.is_none() || target_cam.as_deref() == Some("all") || mission_id.is_some() {
                    self.stop();
                    auto_reacted = true;
                } else if let Some(ref cam) = target_cam {
                    let mut cams = self.cameras.write().await;
                    if let Some(c) = cams.iter_mut().find(|c| c.cam_id.eq_ignore_ascii_case(cam)) {
                        c.paused = true;
                        auto_reacted = true;
                    }
                }
                self.emit_current_telemetry().await;
            }
        } else {
            status = "IGNORED".to_string();
        }

        let entry = CommandLogEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: chrono::Utc::now().timestamp_millis(),
            raw_command: raw.to_string(),
            command_type: cmd_type,
            target_cam,
            mission_id,
            status,
            auto_reacted,
        };

        {
            let mut logs = self.command_logs.write().await;
            logs.insert(0, entry.clone());
            if logs.len() > 100 {
                logs.truncate(100);
            }
        }

        let _ = self.app_handle.emit("command-event", entry.clone());
        entry
    }

    pub fn spawn_mission_event_listener(self: &Arc<Self>) {
        let engine = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            loop {
                let endpoint = engine.config.read().await.grpc_endpoint.clone();
                match MissionControlServiceClient::connect(endpoint.clone()).await {
                    Ok(mut client) => {
                        eprintln!("[fod-simulator] Subscribed to MissionControlService at {}", endpoint);
                        match client.stream_mission_events(tonic::Request::new(MissionSubscriptionRequest { mission_id: 0 })).await {
                            Ok(response) => {
                                let mut stream = response.into_inner();
                                while let Ok(Some(event)) = stream.message().await {
                                    engine.process_mission_event(event).await;
                                }
                                eprintln!("[fod-simulator] MissionControlService stream disconnected, will reconnect...");
                            }
                            Err(e) => {
                                eprintln!("[fod-simulator] stream_mission_events error: {}", e);
                            }
                        }
                    }
                    Err(_) => {
                        // Backend might be offline; retry quietly
                    }
                }
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
        });
    }

    pub async fn process_mission_event(&self, event: MissionEvent) {
        if let Some(ev) = event.event {
            match ev {
                proto_defination::mission_control::mission_event::Event::RawCommand(raw) => {
                    self.handle_incoming_command(&raw).await;
                }
                proto_defination::mission_control::mission_event::Event::CameraCommand(cmd) => {
                    let verb = cmd.command.to_ascii_lowercase();
                    if cmd.cam_ids.is_empty() || cmd.cam_ids.len() > 1 {
                        self.handle_incoming_command(&format!("{}_all", verb)).await;
                    } else {
                        self.handle_incoming_command(&format!("{}_{}", verb, cmd.cam_ids[0])).await;
                    }
                }
                proto_defination::mission_control::mission_event::Event::ScanChanged(status) => {
                    if status == proto_defination::common::MissionScanStatus::Play as i32 {
                        self.handle_incoming_command("resume").await;
                    } else if status == proto_defination::common::MissionScanStatus::Pause as i32 {
                        self.handle_incoming_command("pause").await;
                    }
                }
                proto_defination::mission_control::mission_event::Event::StatusChanged(status) => {
                    if status == proto_defination::common::MissionStatus::Active as i32 {
                        self.handle_incoming_command(&format!("start_{}", event.mission_id)).await;
                    } else if status == proto_defination::common::MissionStatus::Terminated as i32 {
                        self.handle_incoming_command(&format!("terminate_{}", event.mission_id)).await;
                    }
                }
                _ => {}
            }
        }
    }

    pub fn spawn_local_command_server(self: &Arc<Self>, port: u16) {
        let engine = Arc::clone(self);
        tauri::async_runtime::spawn(async move {
            let addr = format!("127.0.0.1:{}", port);
            if let Ok(listener) = tokio::net::TcpListener::bind(&addr).await {
                eprintln!("[fod-simulator] Local command HTTP listener on {}", addr);
                while let Ok((mut socket, _)) = listener.accept().await {
                    let engine_clone = Arc::clone(&engine);
                    tauri::async_runtime::spawn(async move {
                        use tokio::io::{AsyncReadExt, AsyncWriteExt};
                        let mut buf = [0u8; 4096];
                        if let Ok(n) = socket.read(&mut buf).await {
                            if n > 0 {
                                let req = String::from_utf8_lossy(&buf[..n]);
                                let mut cmd = String::new();
                                if let Some(q_idx) = req.find("?cmd=") {
                                    let sub = &req[q_idx + 5..];
                                    let end = sub.find(|c| c == ' ' || c == '&' || c == '\r' || c == '\n').unwrap_or(sub.len());
                                    cmd = sub[..end].to_string();
                                } else if let Some(body_idx) = req.find("\r\n\r\n") {
                                    let body = &req[body_idx + 4..];
                                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(body) {
                                        if let Some(c) = val.get("command").and_then(|v| v.as_str()) {
                                            cmd = c.to_string();
                                        }
                                    }
                                }
                                if req.starts_with("GET /logs") {
                                    let logs = engine_clone.command_logs.read().await.clone();
                                    let body = serde_json::to_string(&logs).unwrap_or_else(|_| "[]".to_string());
                                    let resp = format!(
                                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                        body.len(),
                                        body
                                    );
                                    let _ = socket.write_all(resp.as_bytes()).await;
                                    let _ = socket.shutdown().await;
                                    return;
                                }
                                if req.starts_with("GET /status") || req.starts_with("GET /state") {
                                    let running = engine_clone.running.load(Ordering::SeqCst);
                                    let paused = engine_clone.paused.load(Ordering::SeqCst);
                                    let body = serde_json::json!({
                                        "running": running,
                                        "paused": paused,
                                        "status": if !running { "Idle" } else if paused { "Paused" } else { "Streaming" }
                                    }).to_string();
                                    let resp = format!(
                                        "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                        body.len(),
                                        body
                                    );
                                    let _ = socket.write_all(resp.as_bytes()).await;
                                    let _ = socket.shutdown().await;
                                    return;
                                }

                                let mut handled_entry = None;
                                if !cmd.is_empty() {
                                    handled_entry = Some(engine_clone.handle_incoming_command(&cmd).await);
                                }
                                let body = serde_json::json!({
                                    "status": "ok",
                                    "command": cmd,
                                    "entry": handled_entry
                                }).to_string();
                                let resp = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                    body.len(),
                                    body
                                );
                                let _ = socket.write_all(resp.as_bytes()).await;
                                let _ = socket.shutdown().await;
                            }
                        }
                    });
                }
            }
        });
    }
}
