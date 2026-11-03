// Prevents an additional console window on Windows in release. DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    if let Ok(cwd) = std::env::current_dir() {
        if cwd.file_name().and_then(|n| n.to_str()) == Some("src-tauri") {
            if let Some(parent) = cwd.parent() {
                let _ = std::env::set_current_dir(parent);
            }
        }
    }

    #[cfg(target_os = "linux")]
    unsafe {
        // Fix WebKitGTK DMABUF renderer & compositing internal errors on Linux/Wayland
        if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
            std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
        }
        if std::env::var("WEBKIT_DISABLE_COMPOSITING_MODE").is_err() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
        if std::env::var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS").is_err() {
            std::env::set_var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
        }
        if std::env::var("GDK_BACKEND").is_err() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }

    fod_desktop_lib::run();
}
