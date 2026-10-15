//ye available env variables mai se key ki value deta h ya default value
fn env_or(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

#[allow(dead_code)]
#[derive(Clone)]
pub struct Config {
    /// DATABASE_URL — Postgres `zoid_client` DB (Prisma-created schema).
    pub database_url: String,
    /// NEXT_PUBLIC_SERVER_URL — car-backend base, e.g. http://localhost:50051
    pub car_backend_url: String,
    /// NEXT_PUBLIC_SECONDARY_SERVER_URL — atc-backend base, e.g. http://localhost:50052
    pub atc_backend_url: String,
    /// SOCKETSERVER — car-backend base
    pub socketserver: String,
    /// GUI_SERVER_PORT — this server's port (renderer, SSE, socket.io, images).
    pub gui_server_port: u16,
    /// AI_THRESHOLD — FOD confidence threshold (check src/services/fod.ts for
    /// exact usage before relying on the default).
    pub ai_threshold: f64,
    /// SYS_ID — this installation's system id.
    pub sys_id: String,
    /// ATC_IP (optional).
    pub atc_ip: Option<String>,
    /// JWT signing secret.
    /// AGENT R3 (auth): the Node code may use a hardcoded fallback secret when
    /// the env var is absent — find it in src/pages/api/auth/** and replace the
    /// placeholder below with the EXACT same literal, so existing localStorage
    /// tokens keep verifying. Only R3 may edit this.
    pub jwt_secret: String,
}

impl Config {
    pub fn load() -> Self {
        let car = env_or("NEXT_PUBLIC_SERVER_URL", "http://127.0.0.1:50051");
        Self {
            database_url: env_or(
                "DATABASE_URL",
                "postgresql://postgres:1234@localhost:5432/zoid_client",
            ),
            atc_backend_url: env_or("NEXT_PUBLIC_SECONDARY_SERVER_URL", "http://127.0.0.1:50052"),
            socketserver: std::env::var("SOCKETSERVER").unwrap_or_else(|_| car.clone()),
            car_backend_url: car,
            gui_server_port: std::env::var("GUI_SERVER_PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(7985),
            ai_threshold: std::env::var("AI_THRESHOLD")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(0.0),
            sys_id: env_or("SYS_ID", ""),
            atc_ip: std::env::var("ATC_IP").ok(),
            jwt_secret: std::env::var("JWT_SECRET")
                .or_else(|_| std::env::var("AUTH_SECRET_KEY"))
                .unwrap_or_else(|_| "your-secret-key".to_string()),
        }
    }
}
