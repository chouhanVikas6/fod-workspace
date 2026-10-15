use proto_defination::cleared_fod::cleared_fod_service_server::ClearedFodServiceServer;
use proto_defination::fod::fod_service_server::FodServiceServer;
use proto_defination::fod_group::fod_group_service_server::FodGroupServiceServer;
use proto_defination::image::image_service_server::ImageServiceServer;
use proto_defination::mission::mission_service_server::MissionServiceServer;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::broadcast;
use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

mod services;
mod sync_client;

use services::{
    AtcClearedFodServiceImpl, AtcFodGroupServiceImpl, AtcFodServiceImpl, AtcImageServiceImpl,
    AtcMissionServiceImpl,
};
use sync_client::SyncClient;
use zoid_db::Db;
use zoid_storage::{FrameStorage, StorageConfig};

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let host = std::env::var("ATC_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("ATC_PORT")
        .unwrap_or_else(|_| "50052".to_string())
        .parse::<u16>()?;
    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

    let car_url = std::env::var("CAR_REPLICATION_URL")
        .unwrap_or_else(|_| "http://127.0.0.1:50051".to_string());
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1234@localhost:5432/zoid_atc".to_string());
    let frames_dir = std::env::var("FRAMES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/atc_frames"));
    let node_id = std::env::var("NODE_ID").unwrap_or_else(|_| "atc-tower-01".to_string());

    tracing::info!("Initializing ATC daemon on {}", addr);
    tracing::info!("Upstream Car replication endpoint: {}", car_url);

    // Initialize Database
    let db = match Db::connect(&db_url, 10).await {
        Ok(db) => {
            tracing::info!("Connected to ATC replica database at {}", db_url);
            db
        }
        Err(e) => {
            tracing::warn!(
                "Could not connect to database ({}): {}. Running with lazy pool if available.",
                db_url, e
            );
            Db::connect(&db_url, 2).await?
        }
    };

    // Shared Storage
    let storage = Arc::new(FrameStorage::new(StorageConfig {
        base_dir: frames_dir,
    }));

    // Start Replication Sync Client in background
    let (sync_client, cmd_rx) = SyncClient::new(car_url, db.clone(), node_id);
    let cmd_tx = sync_client.command_sender();
    let sync_client_arc = Arc::new(sync_client);

    tokio::spawn(async move {
        sync_client_arc.run_replication_loop(cmd_rx).await;
    });

    let (group_tx, _) = broadcast::channel(1000);

    // Instantiate gRPC Services
    let fod_group_svc = AtcFodGroupServiceImpl::new(db.clone(), cmd_tx, group_tx);
    let fod_svc = AtcFodServiceImpl::new(db.clone());
    let cleared_fod_svc = AtcClearedFodServiceImpl::new(db.clone());
    let mission_svc = AtcMissionServiceImpl::new(db.clone());
    let image_svc = AtcImageServiceImpl::new(storage);

    // Health Reporting
    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<FodGroupServiceServer<AtcFodGroupServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<FodServiceServer<AtcFodServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<ClearedFodServiceServer<AtcClearedFodServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<MissionServiceServer<AtcMissionServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<ImageServiceServer<AtcImageServiceImpl>>()
        .await;

    tracing::info!("Starting ATC gRPC server on {}", addr);

    Server::builder()
        .accept_http1(true)
        .layer(grpc_core::cors_layer())
        .layer(tonic_web::GrpcWebLayer::new())
        .add_service(health_service)
        .add_service(FodGroupServiceServer::new(fod_group_svc))
        .add_service(FodServiceServer::new(fod_svc))
        .add_service(ClearedFodServiceServer::new(cleared_fod_svc))
        .add_service(MissionServiceServer::new(mission_svc))
        .add_service(ImageServiceServer::new(image_svc))
        .serve(addr)
        .await?;

    Ok(())
}