//! Local RTK GNSS NMEA-0183 reader.
//!
//! Reads NMEA sentences (`GGA`, `RMC`, `VTG`, `HDT`) from either:
//! - A TCP stream if `RTK_TCP_ADDR` is set (e.g. `127.0.0.1:5000`), or
//! - A serial port configured via `RTK_SERIAL_PORT` (default auto-scan of
//!   `/dev/ttyACM0..3` and `/dev/ttyUSB0..3` at `RTK_BAUD` or `115200` baud).
//!
//! Parsed coordinates are written into `AppState.health.rtk_data`, which is
//! automatically streamed to the frontend via `/api/sse/health-data` and `/gui`.

use crate::state::AppState;
use serde_json::json;
use std::io::{BufRead, BufReader as StdBufReader};
use std::path::Path;
use std::time::{Duration, Instant};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpStream;

#[derive(Debug, Clone, Default)]
pub struct RtkFixState {
    pub lat: Option<f64>,
    pub lon: Option<f64>,
    pub heading: f64,
    pub fix: String,
    pub satellites: u32,
    pub hdop: f64,
    pub sd: f64,
}

impl RtkFixState {
    pub fn to_json(&self, source: &str) -> serde_json::Value {
        json!({
            "fix": if self.fix.is_empty() { "NO_GPS" } else { &self.fix },
            "lat": self.lat,
            "lon": self.lon,
            "heading": self.heading,
            "satellites": self.satellites,
            "hdop": (self.hdop * 100.0).round() / 100.0,
            "sd": self.sd,
            "accuracy": self.sd,
            "source": source,
            "updated_at_ms": chrono::Utc::now().timestamp_millis(),
        })
    }
}

/// Verify NMEA-0183 `*HH` XOR checksum if present.
pub fn verify_nmea_checksum(sentence: &str) -> bool {
    let trimmed = sentence.trim();
    if !trimmed.starts_with('$') {
        return false;
    }
    let Some(star_idx) = trimmed.rfind('*') else {
        return true; // No checksum provided
    };
    let payload = &trimmed[1..star_idx];
    let hex = trimmed[star_idx + 1..].trim();
    if hex.len() < 2 {
        return false;
    }
    let Ok(expected) = u8::from_str_radix(&hex[..2], 16) else {
        return false;
    };
    let actual = payload.bytes().fold(0u8, |acc, b| acc ^ b);
    actual == expected
}

/// Convert NMEA `DDMM.MMMM` / `DDDMM.MMMM` + hemisphere (`N`/`S`/`E`/`W`) to decimal degrees.
pub fn parse_nmea_coord(raw: &str, hemi: &str) -> Option<f64> {
    if raw.is_empty() || hemi.is_empty() {
        return None;
    }
    let val: f64 = raw.parse().ok()?;
    if !val.is_finite() {
        return None;
    }
    let deg = (val / 100.0).floor();
    let min = val - deg * 100.0;
    let mut decimal = deg + (min / 60.0);
    if hemi == "S" || hemi == "W" {
        decimal = -decimal;
    }
    if decimal.is_finite() && decimal.abs() <= 180.0 {
        Some((decimal * 1e7).round() / 1e7)
    } else {
        None
    }
}

/// Parse a single NMEA-0183 sentence and update `state`. Returns `true` if `state` changed.
pub fn parse_nmea_sentence(line: &str, state: &mut RtkFixState) -> bool {
    let trimmed = line.trim();
    if !verify_nmea_checksum(trimmed) {
        return false;
    }
    let body = trimmed.split('*').next().unwrap_or(trimmed);
    let fields: Vec<&str> = body.split(',').collect();
    if fields.is_empty() || fields[0].len() < 6 {
        return false;
    }

    let msg_type = &fields[0][3..6];
    match msg_type {
        "GGA" if fields.len() >= 9 => {
            let quality: u8 = fields[6].parse().unwrap_or(0);
            let satellites: u32 = fields[7].parse().unwrap_or(0);
            let hdop: f64 = fields[8].parse().unwrap_or(99.9);

            let (fix_str, sd) = match quality {
                4 => ("RTK".to_string(), 0.015),
                5 => ("RTK".to_string(), 0.15),
                2 => ("GPS".to_string(), (hdop * 0.8).max(0.3)),
                1 | 3 | 6 => ("GPS".to_string(), (hdop * 1.5).max(1.0)),
                _ => ("NO_GPS".to_string(), 99.9),
            };

            state.fix = fix_str;
            state.satellites = satellites;
            state.hdop = hdop;
            state.sd = (sd * 1000.0).round() / 1000.0;

            if quality > 0 {
                if let (Some(lat), Some(lon)) = (
                    parse_nmea_coord(fields[2], fields[3]),
                    parse_nmea_coord(fields[4], fields[5]),
                ) {
                    state.lat = Some(lat);
                    state.lon = Some(lon);
                }
            }
            true
        }
        "RMC" if fields.len() >= 9 => {
            if fields[2] == "A" {
                if let (Some(lat), Some(lon)) = (
                    parse_nmea_coord(fields[3], fields[4]),
                    parse_nmea_coord(fields[5], fields[6]),
                ) {
                    if state.lat.is_none() {
                        state.lat = Some(lat);
                        state.lon = Some(lon);
                    }
                }
                if let Ok(cog) = fields[8].parse::<f64>() {
                    if cog.is_finite() {
                        state.heading = ((cog % 360.0) + 360.0) % 360.0;
                    }
                }
                if state.fix.is_empty() {
                    state.fix = "GPS".to_string();
                }
                return true;
            }
            false
        }
        "VTG" if fields.len() >= 2 => {
            if let Ok(cog) = fields[1].parse::<f64>() {
                if cog.is_finite() {
                    state.heading = ((cog % 360.0) + 360.0) % 360.0;
                    return true;
                }
            }
            false
        }
        "HDT" if fields.len() >= 2 => {
            if let Ok(hdg) = fields[1].parse::<f64>() {
                if hdg.is_finite() {
                    state.heading = ((hdg % 360.0) + 360.0) % 360.0;
                    return true;
                }
            }
            false
        }
        _ => false,
    }
}

async fn publish_rtk_state(state: &AppState, fix_state: &RtkFixState, source: &str) {
    let mut h = state.health.write().await;
    h.rtk_data.data = fix_state.to_json(source);
    h.rtk_data.event_status = true;
    h.rtk_data.data_status = fix_state.lat.is_some() && fix_state.lon.is_some();
}

async fn mark_rtk_error(state: &AppState, source: &str, err_msg: &str) {
    let mut h = state.health.write().await;
    h.rtk_data.data = json!({
        "fix": "NO_GPS",
        "source": source,
        "error": err_msg,
        "updated_at_ms": chrono::Utc::now().timestamp_millis(),
    });
    h.rtk_data.event_status = true;
    h.rtk_data.data_status = false;
}

fn find_serial_port() -> Option<String> {
    if let Ok(port) = std::env::var("RTK_SERIAL_PORT") {
        let trimmed = port.trim();
        if !trimmed.is_empty() && Path::new(trimmed).exists() {
            return Some(trimmed.to_string());
        }
    }
    for prefix in ["/dev/ttyACM", "/dev/ttyUSB"] {
        for idx in 0..4 {
            let candidate = format!("{prefix}{idx}");
            if Path::new(&candidate).exists() {
                return Some(candidate);
            }
        }
    }
    None
}

async fn configure_serial_port(port: &str, baud: u32) {
    #[cfg(target_os = "linux")]
    {
        let _ = tokio::process::Command::new("stty")
            .args([
                "-F",
                port,
                &baud.to_string(),
                "raw",
                "-echo",
                "-hupcl",
                "clocal",
                "cread",
                "min",
                "1",
                "time",
                "5",
            ])
            .output()
            .await;
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = (port, baud);
    }
}

async fn read_nmea_stream<R: tokio::io::AsyncRead + Unpin>(
    reader: R,
    app_state: &AppState,
    source_label: &str,
) {
    let mut buf_reader = BufReader::new(reader);
    let mut buf = Vec::with_capacity(512);
    let mut fix_state = RtkFixState::default();
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    loop {
        buf.clear();
        match buf_reader.read_until(b'\n', &mut buf).await {
            Ok(0) => break,
            Ok(_) => {
                let line = String::from_utf8_lossy(&buf);
                if parse_nmea_sentence(&line, &mut fix_state)
                    && last_emit.elapsed() >= Duration::from_millis(100)
                {
                    last_emit = Instant::now();
                    publish_rtk_state(app_state, &fix_state, source_label).await;
                }
            }
            Err(e) => {
                tracing::debug!(source = %source_label, error = %e, "NMEA stream read error");
                break;
            }
        }
    }
}

async fn read_serial_blocking(port: String, app_state: AppState) -> Result<(), String> {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<String>(256);
    let port_for_thread = port.clone();

    let reader_handle = tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::open(&port_for_thread).map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied {
                format!("Permission denied on {port_for_thread} (add user to dialout group)")
            } else {
                format!("Failed to open {port_for_thread}: {e}")
            }
        })?;

        let mut reader = StdBufReader::new(file);
        let mut buf = Vec::with_capacity(512);
        loop {
            buf.clear();
            match reader.read_until(b'\n', &mut buf) {
                Ok(0) => break,
                Ok(_) => {
                    let line = String::from_utf8_lossy(&buf).into_owned();
                    if tx.blocking_send(line).is_err() {
                        break;
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => continue,
                Err(e) => return Err(format!("Serial read error on {port_for_thread}: {e}")),
            }
        }
        Ok(())
    });

    let mut fix_state = RtkFixState::default();
    let mut last_emit = Instant::now() - Duration::from_secs(1);
    while let Some(line) = rx.recv().await {
        if parse_nmea_sentence(&line, &mut fix_state)
            && last_emit.elapsed() >= Duration::from_millis(100)
        {
            last_emit = Instant::now();
            publish_rtk_state(&app_state, &fix_state, &port).await;
        }
    }

    match reader_handle.await {
        Ok(res) => res,
        Err(e) => Err(format!("Serial reader task panicked: {e}")),
    }
}

/// Spawn the background RTK GNSS reader task.
pub fn spawn(app_state: AppState) {
    tauri::async_runtime::spawn(async move {
        let baud: u32 = std::env::var("RTK_BAUD")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(115_200);

        loop {
            if let Ok(addr) = std::env::var("RTK_TCP_ADDR") {
                let addr = addr.trim().to_string();
                if !addr.is_empty() {
                    match TcpStream::connect(&addr).await {
                        Ok(stream) => {
                            let label = format!("tcp://{addr}");
                            tracing::info!(source = %label, "Connected to RTK TCP stream");
                            read_nmea_stream(stream, &app_state, &label).await;
                            tracing::warn!(source = %label, "RTK TCP stream disconnected");
                            mark_rtk_error(&app_state, &label, "TCP stream disconnected").await;
                        }
                        Err(e) => {
                            tracing::debug!(addr = %addr, error = %e, "RTK TCP connect failed");
                            mark_rtk_error(&app_state, &format!("tcp://{addr}"), &e.to_string()).await;
                        }
                    }
                    tokio::time::sleep(Duration::from_secs(3)).await;
                    continue;
                }
            }

            if let Some(port) = find_serial_port() {
                configure_serial_port(&port, baud).await;
                tracing::info!(port = %port, baud, "Connected to RTK serial receiver");
                match read_serial_blocking(port.clone(), app_state.clone()).await {
                    Ok(()) => {
                        tracing::warn!(port = %port, "RTK serial receiver disconnected");
                        mark_rtk_error(&app_state, &port, "Serial receiver disconnected").await;
                    }
                    Err(msg) => {
                        tracing::warn!(port = %port, error = %msg, "RTK serial error");
                        mark_rtk_error(&app_state, &port, &msg).await;
                    }
                }
            }

            tokio::time::sleep(Duration::from_secs(3)).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_nmea_coord_conversion() {
        // 0956.473044 N => 9 + 56.473044 / 60 = 9.9412174
        let lat = parse_nmea_coord("0956.473044", "N").unwrap();
        assert!((lat - 9.9412174).abs() < 1e-6);

        // 07616.618606 E => 76 + 16.618606 / 60 = 76.2769768
        let lon = parse_nmea_coord("07616.618606", "E").unwrap();
        assert!((lon - 76.2769768).abs() < 1e-6);

        let south = parse_nmea_coord("0956.473044", "S").unwrap();
        assert!(south < 0.0);
    }

    #[test]
    fn test_parse_gga_rtk_fixed_and_rmc_heading() {
        let mut st = RtkFixState::default();
        let gga = "$GNGGA,085518.00,0956.473044,N,07616.618606,E,4,18,0.6,12.3,M,-91.2,M,,";
        assert!(parse_nmea_sentence(gga, &mut st));
        assert_eq!(st.fix, "RTK");
        assert_eq!(st.satellites, 18);
        assert!((st.sd - 0.015).abs() < 1e-6);
        assert!((st.lat.unwrap() - 9.9412174).abs() < 1e-6);
        assert!((st.lon.unwrap() - 76.2769768).abs() < 1e-6);

        let rmc = "$GNRMC,085518.00,A,0956.473044,N,07616.618606,E,0.5,142.5,161126,,,R";
        assert!(parse_nmea_sentence(rmc, &mut st));
        assert!((st.heading - 142.5).abs() < 1e-6);
    }

    #[test]
    fn test_checksum_verification() {
        assert!(verify_nmea_checksum("$GPHDT,123.4,T*31"));
        assert!(!verify_nmea_checksum("$GPHDT,123.4,T*FF"));
    }
}
