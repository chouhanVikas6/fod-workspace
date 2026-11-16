use std::path::Path;

fn main() {
    let env_path = Path::new("../.env");
    println!("cargo:rerun-if-changed=../.env");
    if let Ok(out_dir) = std::env::var("OUT_DIR") {
        let dest = Path::new(&out_dir).join("embedded.env");
        let contents = std::fs::read_to_string(env_path).unwrap_or_default();
        let _ = std::fs::write(dest, contents);
    }
    tauri_build::build();
}
