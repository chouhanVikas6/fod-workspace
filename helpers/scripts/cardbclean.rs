use std::env;
use std::fs;
use std::path::Path;
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let db_url = env::var("CAR_DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:1234@localhost:5432/zoid_car".to_string());
    let frames_dir = env::var("CAR_FRAMES_DIR")
        .unwrap_or_else(|_| "/home/zoid/workspace/fod-backend/apps/car/data/frames".to_string());

    let sql = r#"
        TRUNCATE TABLE
            fods,
            fod_groups,
            cleared_fods,
            missions,
            change_log,
            applied_commands,
            command_audit,
            fod_group_actions,
            pending_commands,
            replica_state,
            upstream_cursor
        RESTART IDENTITY CASCADE;
        ALTER SEQUENCE IF EXISTS change_seq RESTART WITH 1;
    "#;

    println!("[car-clean] Cleaning database: {db_url}");
    let status = Command::new("psql")
        .arg(&db_url)
        .arg("-v")
        .arg("ON_ERROR_STOP=1")
        .arg("-c")
        .arg(sql)
        .status();

    match status {
        Ok(s) if s.success() => println!("[car-clean] Database tables truncated (users preserved)."),
        Ok(s) => {
            eprintln!("[car-clean] psql failed with status: {s}");
            return ExitCode::FAILURE;
        }
        Err(e) => {
            eprintln!("[car-clean] Failed to run psql: {e}");
            return ExitCode::FAILURE;
        }
    }

    let frames_path = Path::new(&frames_dir);
    if frames_path.exists() {
        println!("[car-clean] Removing frames directory: {}", frames_path.display());
        if let Err(e) = fs::remove_dir_all(frames_path) {
            eprintln!("[car-clean] Failed to remove {}: {e}", frames_path.display());
            return ExitCode::FAILURE;
        }
    }
    if let Err(e) = fs::create_dir_all(frames_path) {
        eprintln!("[car-clean] Failed to recreate {}: {e}", frames_path.display());
        return ExitCode::FAILURE;
    }

    println!("[car-clean] Done.");
    ExitCode::SUCCESS
}
