use std::env;
use std::fs;
use std::path::Path;

fn main() {
    let target = env::var("TARGET").unwrap_or_default();
    let ext = if target.contains("windows") { ".exe" } else { "" };
    let sidecar_filename = format!("fod-backend-{target}{ext}");
    let sidecar_dest = Path::new("binaries").join(&sidecar_filename);

    if !sidecar_dest.exists() {
        let _ = fs::create_dir_all("binaries");

        // Try to copy from backend-rs target directory if already compiled
        let dev_release = format!("../backend-rs/target/release/fod-backend{ext}");
        let dev_debug = format!("../backend-rs/target/debug/fod-backend{ext}");

        let copied = if Path::new(&dev_release).exists() {
            fs::copy(&dev_release, &sidecar_dest).is_ok()
        } else if Path::new(&dev_debug).exists() {
            fs::copy(&dev_debug, &sidecar_dest).is_ok()
        } else {
            false
        };

        if !copied {
            // Create a temporary placeholder so tauri_build::build() does not fail.
            // In dev mode, lib.rs launches the backend from backend-rs/target/ directly anyway.
            let _ = fs::write(&sidecar_dest, b"");
        }
    }

    tauri_build::build();
}
