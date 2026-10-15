mod engine;
mod geo_engine;
mod grpc_client;
mod image_feeder;
mod models;

use engine::SimulatorEngine;
use grpc_client::GrpcClientManager;
use models::{
    CameraConfig, CommandLogEntry, CustomPayloadConfig, FullStateResponse, HealthConfig,
    ImageFolderItem, LocationConfig, RandomizationConfig, SimulatorConfig,
};
use std::sync::Arc;
use tauri::{Manager, State};

#[tauri::command]
async fn start_simulation(engine: State<'_, Arc<SimulatorEngine>>) -> Result<(), String> {
    engine.start().await
}

#[tauri::command]
async fn pause_simulation(engine: State<'_, Arc<SimulatorEngine>>) -> Result<(), String> {
    engine.pause();
    engine.emit_current_telemetry().await;
    Ok(())
}

#[tauri::command]
async fn resume_simulation(engine: State<'_, Arc<SimulatorEngine>>) -> Result<(), String> {
    engine.resume();
    engine.emit_current_telemetry().await;
    Ok(())
}

#[tauri::command]
async fn stop_simulation(engine: State<'_, Arc<SimulatorEngine>>) -> Result<(), String> {
    engine.stop();
    engine.emit_current_telemetry().await;
    Ok(())
}

#[tauri::command]
async fn step_single_fod(engine: State<'_, Arc<SimulatorEngine>>) -> Result<(), String> {
    engine.step_single_fod().await
}

#[tauri::command]
async fn burst_fods(engine: State<'_, Arc<SimulatorEngine>>, count: u32) -> Result<(), String> {
    engine.burst_fods(count).await
}

#[tauri::command]
async fn update_config(
    engine: State<'_, Arc<SimulatorEngine>>,
    config: SimulatorConfig,
) -> Result<(), String> {
    *engine.config.write().await = config;
    Ok(())
}

#[tauri::command]
async fn update_camera_config(
    engine: State<'_, Arc<SimulatorEngine>>,
    cameras: Vec<CameraConfig>,
) -> Result<(), String> {
    *engine.cameras.write().await = cameras;
    engine.send_immediate_telemetry().await;
    Ok(())
}

#[tauri::command]
async fn update_location_config(
    engine: State<'_, Arc<SimulatorEngine>>,
    location: LocationConfig,
) -> Result<(), String> {
    *engine.location_config.write().await = location;
    engine.send_immediate_telemetry().await;
    Ok(())
}

#[tauri::command]
async fn update_health_config(
    engine: State<'_, Arc<SimulatorEngine>>,
    health: HealthConfig,
) -> Result<(), String> {
    *engine.health_config.write().await = health;
    engine.send_immediate_telemetry().await;
    Ok(())
}

#[tauri::command]
async fn update_random_config(
    engine: State<'_, Arc<SimulatorEngine>>,
    random: RandomizationConfig,
) -> Result<(), String> {
    *engine.random_config.write().await = random;
    Ok(())
}

#[tauri::command]
async fn update_custom_config(
    engine: State<'_, Arc<SimulatorEngine>>,
    custom: CustomPayloadConfig,
) -> Result<(), String> {
    *engine.custom_config.write().await = custom;
    Ok(())
}

#[tauri::command]
async fn scan_images_folder(
    engine: State<'_, Arc<SimulatorEngine>>,
    folder_path: String,
) -> Result<Vec<ImageFolderItem>, String> {
    engine.image_feeder.scan_folder(&folder_path)
}

#[tauri::command]
async fn inject_mock_command(
    engine: State<'_, Arc<SimulatorEngine>>,
    raw_cmd: String,
) -> Result<CommandLogEntry, String> {
    Ok(engine.handle_incoming_command(&raw_cmd).await)
}

#[tauri::command]
async fn get_all_state(
    engine: State<'_, Arc<SimulatorEngine>>,
) -> Result<FullStateResponse, String> {
    let config = engine.config.read().await.clone();
    let cameras = engine.cameras.read().await.clone();
    let location = engine.location_config.read().await.clone();
    let health = engine.health_config.read().await.clone();
    let random = engine.random_config.read().await.clone();
    let custom = engine.custom_config.read().await.clone();
    let command_logs = engine.command_logs.read().await.clone();

    Ok(FullStateResponse {
        config,
        cameras,
        location,
        health,
        random,
        custom,
        command_logs,
    })
}

#[tauri::command]
async fn test_grpc_connection(endpoint: String) -> Result<bool, String> {
    GrpcClientManager::test_connection(&endpoint).await
}

#[tauri::command]
async fn close_splashscreen(window: tauri::Window) {
    if let Some(splashscreen) = window.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }
    if let Some(main_window) = window.get_webview_window("main") {
        let _ = main_window.show();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let engine = Arc::new(SimulatorEngine::new(app.handle().clone()));
            engine.spawn_mission_event_listener();
            engine.spawn_local_command_server(50055);
            app.manage(engine);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            start_simulation,
            pause_simulation,
            resume_simulation,
            stop_simulation,
            step_single_fod,
            burst_fods,
            update_config,
            update_camera_config,
            update_location_config,
            update_health_config,
            update_random_config,
            update_custom_config,
            scan_images_folder,
            inject_mock_command,
            get_all_state,
            test_grpc_connection,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
