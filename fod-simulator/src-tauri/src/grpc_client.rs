use proto_defination::ingest::ingest_service_client::IngestServiceClient;
use proto_defination::ingest::{DetectionBatch, TelemetryFrame};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::mpsc;
use tokio_stream::wrappers::ReceiverStream;
use tonic::transport::Channel;
use tonic::Request;

#[derive(Clone)]
pub struct GrpcDispatchHandle {
    batch_tx: mpsc::Sender<DetectionBatch>,
    telemetry_tx: mpsc::Sender<TelemetryFrame>,
    pub accepted_count: Arc<AtomicU64>,
    pub rejected_count: Arc<AtomicU64>,
    pub duplicate_count: Arc<AtomicU64>,
}

impl GrpcDispatchHandle {
    pub async fn send_detection_batch(&self, batch: DetectionBatch) -> Result<(), String> {
        self.batch_tx
            .send(batch)
            .await
            .map_err(|e| format!("Failed to send detection batch: {}", e))
    }

    pub async fn send_telemetry(&self, frame: TelemetryFrame) -> Result<(), String> {
        self.telemetry_tx
            .send(frame)
            .await
            .map_err(|e| format!("Failed to send telemetry frame: {}", e))
    }
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
    ) -> Result<GrpcDispatchHandle, String> {
        let channel = Channel::from_shared(endpoint.to_string())
            .map_err(|e| format!("Invalid URI {}: {}", endpoint, e))?
            .connect()
            .await
            .map_err(|e| format!("Failed to connect to gRPC server at {}: {}", endpoint, e))?;

        let mut detection_client = IngestServiceClient::new(channel.clone());
        let mut telemetry_client = IngestServiceClient::new(channel);

        let (batch_tx, batch_rx) = mpsc::channel::<DetectionBatch>(1000);
        let (telemetry_tx, telemetry_rx) = mpsc::channel::<TelemetryFrame>(1000);

        let accepted_count = Arc::new(AtomicU64::new(0));
        let rejected_count = Arc::new(AtomicU64::new(0));
        let duplicate_count = Arc::new(AtomicU64::new(0));

        let acc_clone = accepted_count.clone();
        let rej_clone = rejected_count.clone();
        let dup_clone = duplicate_count.clone();

        // Spawn Ingest Detection Stream
        tokio::spawn(async move {
            let in_stream = ReceiverStream::new(batch_rx);
            match detection_client.stream_detections(Request::new(in_stream)).await {
                Ok(response) => {
                    let mut resp_stream = response.into_inner();
                    while let Ok(Some(ack)) = resp_stream.message().await {
                        acc_clone.fetch_add(ack.accepted as u64, Ordering::Relaxed);
                        rej_clone.fetch_add(ack.rejected as u64, Ordering::Relaxed);
                        dup_clone.fetch_add(ack.duplicates as u64, Ordering::Relaxed);
                    }
                }
                Err(e) => {
                    eprintln!("stream_detections gRPC stream error: {}", e);
                }
            }
        });

        // Spawn Telemetry Stream
        tokio::spawn(async move {
            let in_stream = ReceiverStream::new(telemetry_rx);
            if let Err(e) = telemetry_client.stream_telemetry(Request::new(in_stream)).await {
                eprintln!("stream_telemetry gRPC stream error: {}", e);
            }
        });

        Ok(GrpcDispatchHandle {
            batch_tx,
            telemetry_tx,
            accepted_count,
            rejected_count,
            duplicate_count,
        })
    }
}
