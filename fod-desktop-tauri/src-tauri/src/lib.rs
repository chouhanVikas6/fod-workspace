//! Zoid FOD Desktop — Tauri v2 shell.
//!
//! Responsibilities of this thin Rust shell (see
//! `docs/electron-to-tauri-migration-plan.md`, Phase 3 + Phase 4.2/4.3):
//!   * create the single 1200x800 window and load the renderer,
//!   * enforce a single running instance (focus the existing window instead),
//!   * spawn + supervise the `fod-backend` Rust sidecar (axum on :7985) —
//!     adopt an already-running backend, otherwise spawn, health-check, and
//!     restart-with-backoff on unexpected exit; kill it on our own exit but
//!     only if *we* started it.
//!
//! All product logic lives in the sidecar (backend-rs, a separate crate) and in
//! the React renderer; this file deliberately stays small.

use std::fs::OpenOptions;
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

/// Fixed internal GUI/backend port — other components in the stack assume :7985.
const BACKEND_PORT: u16 = 7985;
/// Seconds to wait for the backend to report healthy before surfacing an error.
const HEALTH_TIMEOUT_SECS: u64 = 30;
/// Maximum automatic restarts after an *unexpected* sidecar exit.
const MAX_RESTARTS: usize = 3;
/// Name of the sidecar binary (dev: backend-rs target dir; prod: Tauri externalBin).
const SIDECAR_NAME: &str = "fod-backend";

/// Supervises the backend sidecar. Stored as Tauri managed state.
struct SidecarSupervisor {
    /// Handle to the spawned child (None when adopted, not running, or reaped).
    child: Mutex<Option<CommandChild>>,
    /// True only if *we* spawned the sidecar — the gate for killing/restarting it.
    we_spawned: AtomicBool,
    /// Set during app shutdown so the monitor does not treat exit as a crash.
    shutting_down: AtomicBool,
    /// Ensures at most one error dialog is shown.
    error_surfaced: AtomicBool,
    /// Count of automatic restarts performed so far.
    restart_attempts: AtomicUsize,
    /// Log file (in the app log dir) that also captures sidecar stdout/stderr.
    log_path: PathBuf,
}

impl SidecarSupervisor {
    fn new(log_path: PathBuf) -> Self {
        Self {
            child: Mutex::new(None),
            we_spawned: AtomicBool::new(false),
            shutting_down: AtomicBool::new(false),
            error_surfaced: AtomicBool::new(false),
            restart_attempts: AtomicUsize::new(0),
            log_path,
        }
    }

    /// Append a line to the shell log file and mirror it to stderr.
    fn log(&self, msg: &str) {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let line = format!("{ts} [shell] {msg}\n");
        eprint!("{line}");
        if let Ok(mut f) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            let _ = f.write_all(line.as_bytes());
        }
    }

    /// Show a single error dialog (idempotent). Non-blocking to the caller: the
    /// blocking dialog runs on its own thread.
    fn surface_error(&self, app: &AppHandle, msg: &str) {
        if self.error_surfaced.swap(true, Ordering::SeqCst) {
            return;
        }
        self.log(&format!("ERROR surfaced to user: {msg}"));
        let app = app.clone();
        let msg = msg.to_string();
        std::thread::spawn(move || {
            app.dialog()
                .message(msg)
                .kind(MessageDialogKind::Error)
                .title("Zoid FOD Desktop — Backend Error")
                .blocking_show();
        });
    }

    /// Kill the sidecar on shutdown, but only if we own it (adopted backends are
    /// left running for whoever started them).
    fn shutdown(&self) {
        self.shutting_down.store(true, Ordering::SeqCst);
        if self.we_spawned.load(Ordering::SeqCst) {
            if let Some(child) = self.child.lock().unwrap().take() {
                self.log("shutdown — killing sidecar child");
                let _ = child.kill();
            }
        }
    }
}

/// Liveness probe: raw HTTP GET /healthz on :7985, true iff we get `200`.
/// Kept dependency-free (std TCP) on purpose — we only need liveness, not the
/// JSON body ({ok,version,port,startedBy}).
fn is_backend_healthy() -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], BACKEND_PORT));
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(500)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(1500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(1500)));
    let req = b"GET /healthz HTTP/1.1\r\nHost: 127.0.0.1:7985\r\nConnection: close\r\n\r\n";
    if stream.write_all(req).is_err() {
        return false;
    }
    let mut buf = [0u8; 256];
    match stream.read(&mut buf) {
        Ok(n) if n > 0 => {
            let head = String::from_utf8_lossy(&buf[..n]);
            head.starts_with("HTTP/1.1 200") || head.starts_with("HTTP/1.0 200")
        }
        _ => false,
    }
}

/// Poll `/healthz` until healthy or the timeout elapses.
fn wait_until_healthy(timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    loop {
        if is_backend_healthy() {
            return true;
        }
        if Instant::now() >= deadline {
            return false;
        }
        std::thread::sleep(Duration::from_millis(500));
    }
}

/// Project root — `CARGO_MANIFEST_DIR` is `<project>/src-tauri`; its parent is
/// the project root. Baked in at compile time; only meaningful for dev builds.
fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Dev-mode path to the `fod-backend` binary produced by the backend-rs crate:
/// prefer target/debug, fall back to target/release. Returns the debug path even
/// when missing so `spawn()` fails with a clear error.
fn resolve_dev_backend() -> PathBuf {
    let base = project_root().join("backend-rs").join("target");
    let debug = base.join("debug").join(SIDECAR_NAME);
    if debug.exists() {
        return debug;
    }
    let release = base.join("release").join(SIDECAR_NAME);
    if release.exists() {
        return release;
    }
    debug
}

/// Working directory for the sidecar so that `.env` and `./fod-images` resolve.
fn resolve_cwd(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        project_root()
    } else {
        // TODO(phase-4.4): use a writable app-data dir (the AppImage resource dir
        // is read-only) and migrate `.env` + `fod-images` there.
        app.path()
            .app_data_dir()
            .unwrap_or_else(|_| std::env::temp_dir())
    }
}

/// Spawn the sidecar and attach a monitor task that pipes its output to the log
/// and restarts it (bounded) on unexpected exit.
fn spawn_sidecar(app: &AppHandle, state: &Arc<SidecarSupervisor>) -> Result<(), String> {
    let cwd = resolve_cwd(app);

    // Command resolution differs by build:
    //   dev  -> absolute path to backend-rs/target/{debug,release}/fod-backend
    //   prod -> Tauri sidecar mechanism (externalBin "binaries/fod-backend-<triple>")
    let command = if cfg!(debug_assertions) {
        let bin = resolve_dev_backend();
        state.log(&format!(
            "spawning sidecar (dev): {} (cwd {})",
            bin.display(),
            cwd.display()
        ));
        app.shell().command(bin.to_string_lossy().to_string())
    } else {
        // TODO(phase-4.1): ship `fod-backend` as a Tauri externalBin/sidecar
        // (binaries/fod-backend-<target-triple>); config already declares
        // bundle.externalBin = ["binaries/fod-backend"].
        state.log("spawning sidecar (prod): externalBin fod-backend");
        app.shell()
            .sidecar(SIDECAR_NAME)
            .map_err(|e| format!("failed to resolve sidecar '{SIDECAR_NAME}': {e}"))?
    };

    let (mut rx, child) = command
        .env("GUI_SERVER_PORT", BACKEND_PORT.to_string())
        .current_dir(cwd)
        .spawn()
        .map_err(|e| format!("failed to spawn sidecar '{SIDECAR_NAME}': {e}"))?;

    *state.child.lock().unwrap() = Some(child);
    state.we_spawned.store(true, Ordering::SeqCst);

    // Pipe stdout/stderr into the log; watch for termination.
    let app = app.clone();
    let state = state.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    state.log(&format!(
                        "[sidecar] {}",
                        String::from_utf8_lossy(&bytes).trim_end()
                    ));
                }
                CommandEvent::Stderr(bytes) => {
                    state.log(&format!(
                        "[sidecar!] {}",
                        String::from_utf8_lossy(&bytes).trim_end()
                    ));
                }
                CommandEvent::Error(err) => {
                    state.log(&format!("[sidecar error] {err}"));
                }
                CommandEvent::Terminated(payload) => {
                    state.log(&format!(
                        "sidecar terminated (code={:?}, signal={:?})",
                        payload.code, payload.signal
                    ));
                    *state.child.lock().unwrap() = None;
                    if !state.shutting_down.load(Ordering::SeqCst) {
                        restart_with_backoff(app.clone(), state.clone());
                    }
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

/// Restart the sidecar after an exponential backoff, up to `MAX_RESTARTS` times.
fn restart_with_backoff(app: AppHandle, state: Arc<SidecarSupervisor>) {
    std::thread::spawn(move || {
        let attempt = state.restart_attempts.fetch_add(1, Ordering::SeqCst) + 1;
        if attempt > MAX_RESTARTS {
            state.surface_error(
                &app,
                "The backend service crashed repeatedly and could not be recovered. Please restart the application.",
            );
            return;
        }
        let backoff = Duration::from_secs(1u64 << (attempt - 1)); // 1s, 2s, 4s
        state.log(&format!(
            "restarting sidecar (attempt {attempt}/{MAX_RESTARTS}) after {backoff:?}"
        ));
        std::thread::sleep(backoff);
        if state.shutting_down.load(Ordering::SeqCst) {
            return;
        }
        if let Err(e) = spawn_sidecar(&app, &state) {
            state.log(&format!("respawn failed: {e}"));
            state.surface_error(&app, &format!("Failed to restart the backend service: {e}"));
        }
    });
}

/// Backend bring-up, run on a background thread so the window can render.
fn start_supervision(app: AppHandle, state: Arc<SidecarSupervisor>) {
    std::thread::spawn(move || {
        // 1. Adopt an already-healthy backend. This covers the dev loop
        //    (`npm run dev:backend` under concurrently) and the second-instance
        //    case — we neither spawn nor own it, so we never kill it.
        if is_backend_healthy() {
            state.we_spawned.store(false, Ordering::SeqCst);
            state.log("backend already healthy on :7985 — adopting (not spawning)");
            return;
        }

        // 2. Escape hatch: never spawn when asked not to.
        let no_sidecar = std::env::var("FOD_NO_SIDECAR")
            .map(|v| v == "1")
            .unwrap_or(false);
        if no_sidecar {
            state.log("FOD_NO_SIDECAR=1 — not spawning; waiting for an external backend");
        } else if let Err(e) = spawn_sidecar(&app, &state) {
            state.surface_error(&app, &format!("Failed to start the backend service: {e}"));
            return;
        }

        // 3. Wait for health; surface an error on timeout.
        if wait_until_healthy(Duration::from_secs(HEALTH_TIMEOUT_SECS)) {
            state.log("backend is healthy");
        } else {
            state.surface_error(
                &app,
                "The backend service did not become healthy within 30 seconds. Check the application log for details.",
            );
        }
    });
}

/// Entry point invoked from `main.rs`.
pub fn run() {
    // WebKitGTK DMABUF renderer on Linux causes protocol and loader crashes (especially with NVIDIA/Mesa/Wayland).
    std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
    std::env::set_var("WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS", "1");
    if std::env::var("GDK_BACKEND").is_err() {
        std::env::set_var("GDK_BACKEND", "x11");
    }

    let app = tauri::Builder::default()
        // single-instance MUST be registered first so a second launch is caught
        // before the rest of the app initialises.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let log_dir = app
                .path()
                .app_log_dir()
                .unwrap_or_else(|_| std::env::temp_dir());
            let _ = std::fs::create_dir_all(&log_dir);
            let supervisor = Arc::new(SidecarSupervisor::new(log_dir.join("sidecar.log")));
            app.manage(supervisor.clone());

            // DevTools available in debug builds (matches the old Electron dev UX).
            // #[cfg(debug_assertions)]
            // if let Some(window) = app.get_webview_window("main") {
            //     window.open_devtools();
            // }

            start_supervision(app.handle().clone(), supervisor);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| match event {
        RunEvent::ExitRequested { .. } | RunEvent::Exit => {
            if let Some(state) = app_handle.try_state::<Arc<SidecarSupervisor>>() {
                state.shutdown();
            }
        }
        _ => {}
    });
}
