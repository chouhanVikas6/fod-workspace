use chrono::{DateTime, Utc};
use futures::StreamExt;
use proto_defination::fod_group::FodGroupEntity;
use proto_defination::ingest::ingest_service_server::IngestService;
use proto_defination::ingest::{
    DetectionBatch, IngestAck, IngestStatus, TelemetryFrame, TelemetrySummary,
};
use std::pin::Pin;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tonic::{Request, Response, Status, Streaming};
use uuid::Uuid;
use zoid_bite::BiteAggregator;
use zoid_db::models::FodRow;
use zoid_db::Db;
use zoid_storage::FrameStorage;
use zoid_tracker::Tracker;

pub struct IngestServiceImpl {
    db: Db,
    storage: Arc<FrameStorage>,
    tracker: Arc<Mutex<Tracker>>,
    bite: Arc<BiteAggregator>,
    group_tx: broadcast::Sender<FodGroupEntity>,
}

impl IngestServiceImpl {
    pub fn new(
        db: Db,
        storage: Arc<FrameStorage>,
        tracker: Arc<Mutex<Tracker>>,
        bite: Arc<BiteAggregator>,
        group_tx: broadcast::Sender<FodGroupEntity>,
    ) -> Self {
        Self {
            db,
            storage,
            tracker,
            bite,
            group_tx,
        }
    }
}

#[tonic::async_trait]
impl IngestService for IngestServiceImpl {
    type StreamDetectionsStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<IngestAck, Status>> + Send + 'static>>;

    async fn stream_detections(
        &self,
        request: Request<Streaming<DetectionBatch>>,
    ) -> Result<Response<Self::StreamDetectionsStream>, Status> {
        let mut in_stream = request.into_inner();
        let db = self.db.clone();
        let storage = self.storage.clone();
        let tracker = self.tracker.clone();
        let group_tx = self.group_tx.clone();

        let output_stream = async_stream::try_stream! {
            while let Some(batch_res) = in_stream.next().await {
                let batch = batch_res.map_err(|e| Status::internal(e.to_string()))?;
                let batch_seq = batch.batch_seq;

                // Check active mission
                let active_mission = match db.get_active_mission().await {
                    Ok(Some(m)) => m,
                    Ok(None) => {
                        yield IngestAck {
                            batch_seq,
                            accepted: 0,
                            duplicates: 0,
                            rejected: batch.detections.len() as u32,
                            status: IngestStatus::NoActiveMission as i32,
                        };
                        continue;
                    }
                    Err(_e) => {
                        yield IngestAck {
                            batch_seq,
                            accepted: 0,
                            duplicates: 0,
                            rejected: batch.detections.len() as u32,
                            status: IngestStatus::RejectedInvalid as i32,
                        };
                        continue;
                    }
                };

                let mut accepted_count = 0;
                let mut dup_count = 0;
                let mut rej_count = 0;

                for det in batch.detections {
                    let fod_id = if let Ok(u) = Uuid::parse_str(&det.uid) {
                        u
                    } else {
                        Uuid::new_v4()
                    };

                    // Check if already processed
                    if let Ok(Some(_)) = db.get_fod(fod_id).await {
                        dup_count += 1;
                        continue;
                    }

                    // Save crop jpeg to CAS
                    let (sha256, frame_size) = if !det.crop_jpeg.is_empty() {
                        match storage.save_frame(&det.crop_jpeg).await {
                            Ok(hash) => (Some(hash), Some(det.crop_jpeg.len() as i32)),
                            Err(_) => (None, None),
                        }
                    } else {
                        (None, None)
                    };

                    // Tracker assign group
                    let now_ms = if det.captured_at_ms > 0 {
                        det.captured_at_ms
                    } else {
                        chrono::Utc::now().timestamp_millis()
                    };

                    let group_id = {
                        let mut trk = tracker.lock().await;
                        trk.process_packet(det.lat, det.lon, now_ms)
                    };

                    if group_id <= 0 {
                        rej_count += 1;
                        continue;
                    }

                    let captured_at = DateTime::from_timestamp_millis(now_ms)
                        .unwrap_or_else(Utc::now);

                    let fod_row = FodRow {
                        id: fod_id,
                        mission_id: active_mission.id,
                        group_id,
                        sysid: if det.sysid.is_empty() { None } else { Some(det.sysid) },
                        cam_id: if det.cam_id.is_empty() { None } else { Some(det.cam_id) },
                        lat: det.lat,
                        lon: det.lon,
                        sd: det.sd,
                        confidence: Some(det.confidence),
                        class: if det.class_name.is_empty() { None } else { Some(det.class_name) },
                        velocity: det.velocity,
                        size: det.size,
                        image_sha256: sha256,
                        image_size: frame_size,
                        frame_missing: det.crop_jpeg.is_empty(),
                        captured_at,
                        created_at: Utc::now(),
                    };

                    if let Err(e) = db.insert_fod(&fod_row).await {
                        tracing::error!("Failed to insert FOD {}: {}", fod_id, e);
                        rej_count += 1;
                        continue;
                    }

                    // Upsert group with largest FOD
                    let group_res = db
                        .upsert_fod_group(active_mission.id, group_id, Some(fod_id), Some(det.size))
                        .await;

                    if let Ok(group) = group_res {
                        let proto_g = group.to_proto();
                        let _ = db.append_change(2, &format!("{}:{}", active_mission.id, group_id)).await;
                        let _ = group_tx.send(proto_g);
                    }

                    let _ = db.append_change(3, &format!("{}:{}", active_mission.id, fod_id)).await;
                    accepted_count += 1;
                }

                yield IngestAck {
                    batch_seq,
                    accepted: accepted_count,
                    duplicates: dup_count,
                    rejected: rej_count,
                    status: IngestStatus::Committed as i32,
                };
            }
        };

        Ok(Response::new(Box::pin(output_stream)))
    }

    async fn stream_telemetry(
        &self,
        request: Request<Streaming<TelemetryFrame>>,
    ) -> Result<Response<TelemetrySummary>, Status> {
        let mut stream = request.into_inner();
        let mut count: u64 = 0;

        while let Some(frame_res) = stream.next().await {
            let frame = frame_res.map_err(|e| Status::internal(e.to_string()))?;
            count += 1;

            match frame.kind {
                Some(proto_defination::ingest::telemetry_frame::Kind::Cameras(batch)) => {
                    let now = chrono::Utc::now().timestamp_millis();
                    let bite_entries: Vec<proto_defination::bite::CameraBiteEntry> = batch
                        .cameras
                        .into_iter()
                        .map(|c| proto_defination::bite::CameraBiteEntry {
                            cam_id: c.cam_id,
                            camera_connection: c.connected,
                            intr_fps: c.intr_fps,
                            pause: c.paused,
                            vg_fps: c.vg_fps,
                            ms_fps: c.ms_fps,
                            timestamp: if c.timestamp > 0 { c.timestamp } else { now },
                        })
                        .collect();
                    self.bite.update_cameras(bite_entries).await;
                }
                Some(proto_defination::ingest::telemetry_frame::Kind::Car(car)) => {
                    let primary = car.primary.map(|p| proto_defination::bite::GpsSensorData {
                        fix: p.fix,
                        sd: p.sd,
                        lat: p.lat,
                        lon: p.lon,
                        heading: p.heading,
                        velocity: car.velocity,
                    });
                    let secondary = car.secondary.map(|s| proto_defination::bite::GpsSensorData {
                        fix: s.fix,
                        sd: s.sd,
                        lat: s.lat,
                        lon: s.lon,
                        heading: s.heading,
                        velocity: car.velocity,
                    });
                    self.bite.update_car_data(primary, secondary).await;
                }
                Some(proto_defination::ingest::telemetry_frame::Kind::Pc(pc)) => {
                    self.bite
                        .update_pc_health(
                            pc.node,
                            proto_defination::bite::PcHealthMetrics {
                                cpu_usage_percent: pc.cpu_pct,
                                memory_usage_percent: pc.mem_pct,
                                disk_usage_percent: pc.disk_pct,
                                temperature_c: pc.temp_c,
                            },
                        )
                        .await;
                }
                None => {}
            }
        }

        Ok(Response::new(TelemetrySummary {
            frames_received: count,
        }))
    }
}
