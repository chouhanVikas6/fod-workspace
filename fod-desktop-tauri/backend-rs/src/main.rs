mod config;
mod error;
mod imagewriter;
mod models;
mod realtime;
mod routes;
mod scheduler;
mod services;
mod state;
mod upstream;

use anyhow::Context;
use std::sync::Arc;
use tower_http::cors::{AllowHeaders, AllowMethods, AllowOrigin, CorsLayer};
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // .env path check and load
    if let Ok(p) = std::env::var("FOD_ENV_PATH") {
        dotenvy::from_path(&p).ok();
    }
    dotenvy::dotenv().ok();
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            dotenvy::from_path(dir.join(".env")).ok();
        }
    }

    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let cfg = Arc::new(config::Config::load());
    tracing::info!(
        port = cfg.gui_server_port,
        car = %cfg.car_backend_url,
        atc = %cfg.atc_backend_url,
        "fod-backend booting"
    );

    // database connect karne ka try
    let db = sqlx::postgres::PgPoolOptions::new()
        .max_connections(10)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                // time zone set karne k liye
                use sqlx::Executor;
                conn.execute("SET TIME ZONE 'UTC'").await?;
                Ok(())
            })
        })
        .connect_lazy(&cfg.database_url)
        .context("invalid DATABASE_URL")?;

    let state = state::AppState::new(cfg, db);

    // socket.io (/gui, /rtk) — realtime module owns namespaces + the single
    // 100 ms health broadcast task.
    let sio_layer = realtime::setup(state.clone()).await?;

    // Background telemetry subscriber (Car backend gRPC BiteService).
    realtime::car_telemetry::spawn(state.clone());
    // Background FOD group subscriber (Car backend gRPC StreamGroups).
    realtime::group_stream::spawn(state.clone());
    // Coexistence gate: the Electron app runs these same schedulers against the
    // same DB — only ONE owner may run the dirty-push loop at a time. Set
    // FOD_DISABLE_SCHEDULERS=1 when running side-by-side with the old app.
    if std::env::var("FOD_DISABLE_SCHEDULERS").ok().as_deref() == Some("1") {
        tracing::warn!("schedulers disabled via FOD_DISABLE_SCHEDULERS=1");
    } else {
        scheduler::spawn_primary_schedular(state.clone());
        scheduler::spawn_sync_service(state.clone());
    }

    // CORS setup
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::mirror_request())
        .allow_methods(AllowMethods::mirror_request())
        .allow_headers(AllowHeaders::mirror_request())
        .allow_credentials(true);

    let app = routes::app_router(state.clone())
        .layer(sio_layer)
        .layer(cors);

    let addr = format!("0.0.0.0:{}", state.cfg.gui_server_port);
    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .with_context(|| format!("bind {addr}"))?;
    tracing::info!(
        "fod-backend listening on {addr} (startedBy {})",
        state.started_by
    );
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
            tracing::info!("shutting down");
        })
        .await?;
    Ok(())
}
