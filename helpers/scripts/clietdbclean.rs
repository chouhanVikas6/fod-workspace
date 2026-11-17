use std::env;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, ExitCode};

fn resolve_workspace_root() -> Option<PathBuf> {
    if let Ok(exe) = env::current_exe() {
        // helpers/scripts/clietdbclean(.exe) -> workspace root
        if let Some(root) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            if root.join("fod-desktop-tauri").is_dir() {
                return Some(root.to_path_buf());
            }
        }
    }
    if let Ok(cwd) = env::current_dir() {
        for ancestor in cwd.ancestors() {
            if ancestor.join("fod-desktop-tauri").is_dir() {
                return Some(ancestor.to_path_buf());
            }
        }
    }
    None
}

fn run_python_clean(py_script: &str, db_path: &Path) -> Result<std::process::ExitStatus, String> {
    let candidates = if cfg!(windows) {
        ["python", "python3", "py"]
    } else {
        ["python3", "python", "py"]
    };
    let mut last_err = None;
    for bin in candidates {
        match Command::new(bin)
            .arg("-c")
            .arg(py_script)
            .arg(db_path)
            .status()
        {
            Ok(status) => return Ok(status),
            Err(e) => last_err = Some(format!("{bin}: {e}")),
        }
    }
    Err(last_err.unwrap_or_else(|| "no python interpreter found".to_string()))
}

fn main() -> ExitCode {
    let default_base = resolve_workspace_root()
        .map(|r| r.join("fod-desktop-tauri"))
        .unwrap_or_else(|| PathBuf::from("/home/zoid/workspace/fod-desktop-tauri"));

    let db_path = env::var("CLIENT_DB_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_base.join("zoid_client.db"));
    let images_dir = env::var("CLIENT_IMAGES_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| default_base.join("fod-images").join("mission"));

    if db_path.exists() {
        println!("[client-clean] Cleaning SQLite database: {}", db_path.display());
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
        match run_python_clean(py_script, &db_path) {
            Ok(s) if s.success() => {
                println!("[client-clean] SQLite mission/FOD tables cleared (User preserved).");
            }
            Ok(s) => {
                eprintln!("[client-clean] SQLite cleanup failed with status: {s}");
                return ExitCode::FAILURE;
            }
            Err(e) => {
                eprintln!("[client-clean] Failed to run python ({e})");
                return ExitCode::FAILURE;
            }
        }
    } else {
        println!("[client-clean] SQLite DB not found at {}, skipping.", db_path.display());
    }

    if images_dir.exists() {
        println!("[client-clean] Removing cached FOD images: {}", images_dir.display());
        if let Err(e) = fs::remove_dir_all(&images_dir) {
            eprintln!("[client-clean] Failed to remove {}: {e}", images_dir.display());
            return ExitCode::FAILURE;
        }
    }
    if let Err(e) = fs::create_dir_all(&images_dir) {
        eprintln!("[client-clean] Failed to recreate {}: {e}", images_dir.display());
        return ExitCode::FAILURE;
    }

    println!("[client-clean] Done.");
    ExitCode::SUCCESS
}
