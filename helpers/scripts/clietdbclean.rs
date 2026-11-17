use std::env;
use std::fs;
use std::path::Path;
use std::process::{Command, ExitCode};

fn main() -> ExitCode {
    let db_path = env::var("CLIENT_DB_PATH")
        .unwrap_or_else(|_| "/home/zoid/workspace/fod-desktop-tauri/zoid_client.db".to_string());
    let images_dir = env::var("CLIENT_IMAGES_DIR")
        .unwrap_or_else(|_| "/home/zoid/workspace/fod-desktop-tauri/fod-images/mission".to_string());

    if Path::new(&db_path).exists() {
        println!("[client-clean] Cleaning SQLite database: {db_path}");
        let py_script = r#"
import sqlite3, sys
db_path = sys.argv[1]
con = sqlite3.connect(db_path)
for tbl in ("ClearedFod", "Fod", "FodGroup", "Mission"):
    con.execute(f'DELETE FROM "{tbl}"')
con.commit()
con.execute("VACUUM")
con.close()
"#;
        let status = Command::new("python3")
            .arg("-c")
            .arg(py_script)
            .arg(&db_path)
            .status();

        match status {
            Ok(s) if s.success() => {
                println!("[client-clean] SQLite mission/FOD tables cleared (User preserved).");
            }
            Ok(s) => {
                eprintln!("[client-clean] SQLite cleanup failed with status: {s}");
                return ExitCode::FAILURE;
            }
            Err(e) => {
                eprintln!("[client-clean] Failed to run python3: {e}");
                return ExitCode::FAILURE;
            }
        }
    } else {
        println!("[client-clean] SQLite DB not found at {db_path}, skipping.");
    }

    let images_path = Path::new(&images_dir);
    if images_path.exists() {
        println!("[client-clean] Removing cached FOD images: {}", images_path.display());
        if let Err(e) = fs::remove_dir_all(images_path) {
            eprintln!("[client-clean] Failed to remove {}: {e}", images_path.display());
            return ExitCode::FAILURE;
        }
    }
    if let Err(e) = fs::create_dir_all(images_path) {
        eprintln!("[client-clean] Failed to recreate {}: {e}", images_path.display());
        return ExitCode::FAILURE;
    }

    println!("[client-clean] Done.");
    ExitCode::SUCCESS
}
