use proto_defination::ingest::ingest_service_client::IngestServiceClient;
use proto_defination::ingest::{DetectionBatch, TelemetryFrame};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::Channel;
use tonic::Request;

#[derive(Clone)]
pub struct CumulativeCounters {
    pub accepted: Arc<AtomicU64>,
    pub rejected: Arc<AtomicU64>,
    pub duplicate: Arc<AtomicU64>,
}

#[derive(Clone)]
pub struct GrpcDispatchHandle {
    batch_tx: mpsc::Sender<DetectionBatch>,
    telemetry_tx: mpsc::Sender<TelemetryFrame>,
    pub sent_count: Arc<AtomicU64>,
    pub accepted_count: Arc<AtomicU64>,
    pub rejected_count: Arc<AtomicU64>,
    pub duplicate_count: Arc<AtomicU64>,
    batch_seq: Arc<AtomicU64>,
    connected: Arc<AtomicBool>,
}

impl GrpcDispatchHandle {
    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
            && !self.batch_tx.is_closed()
            && !self.telemetry_tx.is_closed()
    }

    pub fn mark_disconnected(&self) {
        self.connected.store(false, Ordering::Relaxed);
    }

    pub fn next_batch_seq(&self) -> u64 {
        self.batch_seq.fetch_add(1, Ordering::Relaxed)
    }

    pub async fn send_detection_batch(&self, batch: DetectionBatch) -> Result<(), String> {
        let count = batch.detections.len() as u64;
        self.batch_tx.send(batch).await.map_err(|e| {
            self.mark_disconnected();
            format!("Failed to send detection batch: {}", e)
        })?;
        self.sent_count.fetch_add(count, Ordering::Relaxed);
        Ok(())
    }

    pub async fn send_telemetry(&self, frame: TelemetryFrame) -> Result<(), String> {
        self.telemetry_tx.send(frame).await.map_err(|e| {
            self.mark_disconnected();
            format!("Failed to send telemetry frame: {}", e)
        })
    }
}

#[derive(Clone)]
pub struct DeviceConnection {
    pub device_index: usize,
    pub device_id: String,
    pub node_name: String,
    pub handle: GrpcDispatchHandle,
}

pub struct GrpcClientManager;

impl GrpcClientManager {
    pub async fn test_connection(endpoint: &str) -> Result<bool, String> {
        match IngestServiceClient::connect(endpoint.to_string()).await {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("Could not connect to {}: {}", endpoint, e)),
        }
    }

    pub async fn start_streams(
        endpoint: &str,
        cumulative: Option<CumulativeCounters>,
    ) -> Result<GrpcDispatchHandle, String> {
        // Each device opens an independent HTTP/2 connection & stream pair to the car server.
        let channel = Channel::from_shared(endpoint.to_string())
            .map_err(|e| format!("Invalid URI {}: {}", endpoint, e))?
            .connect()
            .await
            .map_err(|e| format!("Failed to connect to gRPC server at {}: {}", endpoint, e))?;

        let mut detection_client = IngestServiceClient::new(channel.clone());
        let mut telemetry_client = IngestServiceClient::new(channel);

        let (batch_tx, batch_rx) = mpsc::channel::<DetectionBatch>(4096);
        let (telemetry_tx, telemetry_rx) = mpsc::channel::<TelemetryFrame>(1000);

        let sent_count = Arc::new(AtomicU64::new(0));
        let accepted_count = Arc::new(AtomicU64::new(0));
        let rejected_count = Arc::new(AtomicU64::new(0));
        let duplicate_count = Arc::new(AtomicU64::new(0));
        let batch_seq = Arc::new(AtomicU64::new(1));
        let connected = Arc::new(AtomicBool::new(true));

        let acc_clone = accepted_count.clone();
        let rej_clone = rejected_count.clone();
        let dup_clone = duplicate_count.clone();
        let conn_det = connected.clone();
        let cum_det = cumulative.clone();

        // Spawn Ingest Detection Stream
        tokio::spawn(async move {
            let in_stream = ReceiverStream::new(batch_rx);
            match detection_client.stream_detections(Request::new(in_stream)).await {
                Ok(response) => {
                    let mut resp_stream = response.into_inner();
                    while let Ok(Some(ack)) = resp_stream.message().await {
                        let acc = ack.accepted as u64;
                        let rej = ack.rejected as u64;
                        let dup = ack.duplicates as u64;
                        acc_clone.fetch_add(acc, Ordering::Relaxed);
                        rej_clone.fetch_add(rej, Ordering::Relaxed);
                        dup_clone.fetch_add(dup, Ordering::Relaxed);
                        if let Some(ref c) = cum_det {
                            c.accepted.fetch_add(acc, Ordering::Relaxed);
                            c.rejected.fetch_add(rej, Ordering::Relaxed);
                            c.duplicate.fetch_add(dup, Ordering::Relaxed);
                        }
                    }
                }
                Err(e) => {
                    eprintln!("stream_detections gRPC stream error: {}", e);
                }
            }
            conn_det.store(false, Ordering::Relaxed);
        });

        let conn_tel = connected.clone();
        // Spawn Telemetry Stream
        tokio::spawn(async move {
            let in_stream = ReceiverStream::new(telemetry_rx);
            if let Err(e) = telemetry_client.stream_telemetry(Request::new(in_stream)).await {
                eprintln!("stream_telemetry gRPC stream error: {}", e);
                conn_tel.store(false, Ordering::Relaxed);
            }
        });

        Ok(GrpcDispatchHandle {
            batch_tx,
            telemetry_tx,
            sent_count,
            accepted_count,
            rejected_count,
            duplicate_count,
            batch_seq,
            connected,
        })
    }
}
