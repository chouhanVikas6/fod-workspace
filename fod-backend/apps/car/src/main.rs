use proto_defination::bite::bite_service_server::BiteServiceServer;
use proto_defination::cleared_fod::cleared_fod_service_server::ClearedFodServiceServer;
use proto_defination::fod::fod_service_server::FodServiceServer;
use proto_defination::fod_group::fod_group_service_server::FodGroupServiceServer;
use proto_defination::image::image_service_server::ImageServiceServer;
use proto_defination::ingest::ingest_service_server::IngestServiceServer;
use proto_defination::mission::mission_service_server::MissionServiceServer;
use proto_defination::mission_control::mission_control_service_server::MissionControlServiceServer;
use proto_defination::replication::replication_service_server::ReplicationServiceServer;
use proto_defination::user::user_service_server::UserServiceServer;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex};
use tonic::transport::Server;
use tracing_subscriber::EnvFilter;

mod services;

use services::{
    BiteServiceImpl, ClearedFodServiceImpl, FodGroupServiceImpl, FodServiceImpl, ImageServiceImpl,
    IngestServiceImpl, MissionControlServiceImpl, MissionServiceImpl, ReplicationServiceImpl,
    UserServiceImpl,
};
use zoid_bite::BiteAggregator;
use zoid_db::Db;
use zoid_storage::FrameStorage;
use zoid_tracker::Tracker;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let host = std::env::var("CAR_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
    let port = std::env::var("CAR_PORT")
        .unwrap_or_else(|_| "50051".to_string())
        .parse::<u16>()?;
    let addr: SocketAddr = format!("{}:{}", host, port).parse()?;

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1234@localhost:5432/zoid_car".to_string());
    let frames_dir = std::env::var("FRAMES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("./data/frames"));

    tracing::info!("Initializing Car daemon on {}", addr);
    tracing::info!("Frames directory: {:?}", frames_dir);

    // Initialize Database
    let db = match Db::connect(&db_url, 10).await {
        Ok(db) => {
            tracing::info!("Connected to database at {}", db_url);
            db
        }
        Err(e) => {
            tracing::warn!(
                "Could not connect to database ({}): {}. Running with lazy pool if available.",
                db_url, e
            );
            // Re-attempt with minimum pool or return error if fatal
            Db::connect(&db_url, 2).await?
        }
    };

    let storage = Arc::new(FrameStorage::new(zoid_storage::StorageConfig {
        base_dir: frames_dir,
    }));
    let tracker = Arc::new(Mutex::new(Tracker::new(0, 60_000, 5.0, 15)));
    let bite = Arc::new(BiteAggregator::new());

    let (group_tx, _) = broadcast::channel(1000);
    let (change_tx, _) = broadcast::channel(1000);

    // Instantiate Service Handlers
    let bite_svc = BiteServiceImpl::new(bite.clone());
    let image_svc = ImageServiceImpl::new(storage.clone());
    let mission_ctrl_svc = MissionControlServiceImpl::new(db.clone());
    if let Ok(Some(active)) = db.get_active_mission().await {
        tracing::info!(
            "Restored active mission {} from DB (scan_status: {:?})",
            active.id,
            active.scan_status
        );
        mission_ctrl_svc.restore_active_mission(active.id, active.scan_status);
    }
    let fod_group_svc = FodGroupServiceImpl::new(db.clone(), group_tx.clone());
    let fod_svc = FodServiceImpl::new(db.clone());
    let cleared_fod_svc = ClearedFodServiceImpl::new(db.clone());
    let mission_svc = MissionServiceImpl::new(db.clone());
    let ingest_svc = IngestServiceImpl::new(
        db.clone(),
        storage.clone(),
        tracker.clone(),
        bite.clone(),
        group_tx.clone(),
    );
    let replication_svc = ReplicationServiceImpl::new(
        db.clone(),
        "car-primary".to_string(),
        change_tx.clone(),
    );
    let user_svc = UserServiceImpl::new(db.clone(), change_tx.clone());

    // Health Reporting
    let (mut health_reporter, health_service) = tonic_health::server::health_reporter();
    health_reporter
        .set_serving::<BiteServiceServer<BiteServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<ImageServiceServer<ImageServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<MissionControlServiceServer<MissionControlServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<FodGroupServiceServer<FodGroupServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<FodServiceServer<FodServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<ClearedFodServiceServer<ClearedFodServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<MissionServiceServer<MissionServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<IngestServiceServer<IngestServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<ReplicationServiceServer<ReplicationServiceImpl>>()
        .await;
    health_reporter
        .set_serving::<UserServiceServer<UserServiceImpl>>()
        .await;

    tracing::info!("Starting gRPC server with tonic-web & permissive CORS on {}", addr);

    Server::builder()
        .accept_http1(true)
        .layer(grpc_core::cors_layer())
        .layer(tonic_web::GrpcWebLayer::new())
        .add_service(health_service)
        .add_service(BiteServiceServer::new(bite_svc))
        .add_service(ImageServiceServer::new(image_svc))
        .add_service(MissionControlServiceServer::new(mission_ctrl_svc))
        .add_service(FodGroupServiceServer::new(fod_group_svc))
        .add_service(FodServiceServer::new(fod_svc))
        .add_service(ClearedFodServiceServer::new(cleared_fod_svc))
        .add_service(MissionServiceServer::new(mission_svc))
        .add_service(
            IngestServiceServer::new(ingest_svc)
                .max_decoding_message_size(16 * 1024 * 1024), // 16MB for batches with JPEG frames
        )
        .add_service(ReplicationServiceServer::new(replication_svc))
        .add_service(UserServiceServer::new(user_svc))
        .serve(addr)
        .await?;

    Ok(())
}