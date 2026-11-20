//! Local RTK GNSS NMEA-0183 reader.
//!
//! Reads NMEA sentences (`GGA`, `RMC`, `VTG`, `HDT`) from either:
//! - A TCP stream if `RTK_TCP_ADDR` is set (e.g. `127.0.0.1:5000`), or
//! - A serial port configured via `RTK_SERIAL_PORT` (e.g. `COM3` on Windows or
//!   `/dev/ttyACM0` on Linux), or auto-detected via `serialport::available_ports()`
//!   at `RTK_BAUD` or `115200` baud.
//!
//! Parsed coordinates are written into `AppState.health.rtk_data`, which is
//! automatically streamed to the frontend via `/api/sse/health-data` and `/gui`.

use crate::magnetometer_reader::{
    fallback_port_sort_key, format_serial_open_error, is_esp32_usb_bridge, is_ublox_port,
    is_windows_com_port, normalize_port_name, port_sort_key, ports_match,
};
use crate::state::AppState;
use serde_json::json;
use serialport::{SerialPortInfo, SerialPortType};
use std::collections::HashMap;
use std::io::Read;
use std::time::{Duration, Instant};
use tokio::io::AsyncReadExt;
use tokio::net::TcpStream;
use ublox::{
    nav_pvt::common::NavPvtFlags, proto23::PacketRef, GnssFixType, Parser as UbxParser, UbxPacket,
};

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
    if fields.is_empty() || !fields[0].is_ascii() || fields[0].len() < 6 {
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
    let mut rtk_json = fix_state.to_json(source);
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut h = state.health.write().await;

    let mag_fresh = h.magnetometer.data_status
        && h.magnetometer
            .data
            .get("updatedAtMs")
            .and_then(|v| v.as_i64())
            .is_some_and(|ts| (now_ms - ts) <= 3000);
    if mag_fresh {
        if let Some(mag_hdg) = h.magnetometer.data.get("heading").and_then(|v| v.as_f64()) {
            if let Some(obj) = rtk_json.as_object_mut() {
                obj.insert("heading".to_string(), json!(mag_hdg));
                obj.insert("headingSource".to_string(), json!("magnetometer"));
            }
        }
    }

    h.rtk_data.data = rtk_json;
    h.rtk_data.event_status = true;
    h.rtk_data.data_status = fix_state.lat.is_some() && fix_state.lon.is_some();
}

async fn mark_rtk_error(state: &AppState, source: &str, err_msg: &str) {
    let now_ms = chrono::Utc::now().timestamp_millis();
    let mut h = state.health.write().await;
    let mag_fresh = h.magnetometer.data_status
        && h.magnetometer
            .data
            .get("updatedAtMs")
            .and_then(|v| v.as_i64())
            .is_some_and(|ts| (now_ms - ts) <= 3000);
    let mag_heading = if mag_fresh {
        h.magnetometer.data.get("heading").and_then(|v| v.as_f64())
    } else {
        None
    };

    let mut payload = json!({
        "fix": "NO_GPS",
        "source": source,
        "error": err_msg,
        "updated_at_ms": now_ms,
    });
    if let Some(hdg) = mag_heading {
        if let Some(obj) = payload.as_object_mut() {
            obj.insert("heading".to_string(), json!(hdg));
            obj.insert("headingSource".to_string(), json!("magnetometer"));
        }
    }

    h.rtk_data.data = payload;
    h.rtk_data.event_status = true;
    h.rtk_data.data_status = false;
}

pub fn select_preferred_serial_port_excluding(
    ports: &[SerialPortInfo],
    excluded: &[String],
) -> Option<String> {
    let is_excluded = |name: &str| excluded.iter().any(|e| ports_match(e, name));

    // 1. Prefer u-blox GNSS receivers (VID 0x1546 or Windows u-blox FriendlyName)
    let mut ublox_ports: Vec<&str> = ports
        .iter()
        .filter(|p| !is_excluded(&p.port_name) && is_ublox_port(p))
        .map(|p| p.port_name.as_str())
        .collect();
    ublox_ports.sort_by_key(|name| port_sort_key(name));
    if let Some(first) = ublox_ports.first() {
        return Some((*first).to_string());
    }

    // 2. Prefer /dev/ttyACM* USB CDC devices (typical GNSS receivers)
    let mut acm_ports: Vec<&str> = ports
        .iter()
        .filter(|p| {
            !is_excluded(&p.port_name)
                && matches!(p.port_type, SerialPortType::UsbPort(_))
                && p.port_name.starts_with("/dev/ttyACM")
        })
        .map(|p| p.port_name.as_str())
        .collect();
    acm_ports.sort_by_key(|name| port_sort_key(name));
    if let Some(first) = acm_ports.first() {
        return Some((*first).to_string());
    }

    // 3. Non-excluded USB serial port that is NOT a known ESP32 UART bridge
    let mut non_esp_usb_ports: Vec<&str> = ports
        .iter()
        .filter(|p| {
            !is_excluded(&p.port_name)
                && matches!(p.port_type, SerialPortType::UsbPort(_))
                && !is_esp32_usb_bridge(p)
        })
        .map(|p| p.port_name.as_str())
        .collect();
    non_esp_usb_ports.sort_by_key(|name| fallback_port_sort_key(name));
    if let Some(first) = non_esp_usb_ports.first() {
        return Some((*first).to_string());
    }

    // 4. Fallback OS serial devices (POSIX ttyACM or Windows non-Bluetooth Unknown COMx; never grab /dev/ttyUSB* ESP32 bridges)
    let mut fallback_ports: Vec<&str> = ports
        .iter()
        .filter(|p| {
            let name = p.port_name.as_str();
            !is_excluded(name)
                && !is_esp32_usb_bridge(p)
                && (name.starts_with("/dev/ttyACM")
                    || (is_windows_com_port(name)
                        && !matches!(p.port_type, SerialPortType::BluetoothPort)))
        })
        .map(|p| p.port_name.as_str())
        .collect();
    fallback_ports.sort_by_key(|name| fallback_port_sort_key(name));
    fallback_ports.first().map(|p| (*p).to_string())
}

#[allow(dead_code)]
fn select_preferred_serial_port(ports: &[SerialPortInfo]) -> Option<String> {
    select_preferred_serial_port_excluding(ports, &[])
}

async fn find_serial_port(
    state: &AppState,
    ignored: &HashMap<String, Instant>,
) -> Option<(String, bool)> {
    if let Ok(port) = std::env::var("RTK_SERIAL_PORT") {
        let trimmed = normalize_port_name(&port);
        if !trimmed.is_empty() {
            return Some((trimmed, false));
        }
    }
    let mut excluded: Vec<String> = ignored.keys().cloned().collect();
    if let Ok(mag_env) = std::env::var("MAG_SERIAL_PORT") {
        let trimmed = normalize_port_name(&mag_env);
        if !trimmed.is_empty() {
            excluded.push(trimmed);
        }
    }
    if let Some(claimed) = state.mag_control.claimed_port().await {
        excluded.push(claimed);
    }
    if let Some(preferred) = state.mag_control.preferred_port().await {
        excluded.push(preferred);
    }
    let ports = serialport::available_ports().ok()?;
    select_preferred_serial_port_excluding(&ports, &excluded).map(|p| (p, true))
}

fn apply_ubx_packet(pkt: UbxPacket<'_>, state: &mut RtkFixState) -> bool {
    let UbxPacket::Proto23(packet_ref) = pkt;
    match packet_ref {
        PacketRef::NavPvt(pvt) => {
            let flags = pvt.flags();
            let fix_ok = flags.contains(NavPvtFlags::GPS_FIX_OK)
                && matches!(
                    pvt.fix_type(),
                    GnssFixType::Fix2D | GnssFixType::Fix3D | GnssFixType::GPSPlusDeadReckoning
                );

            state.fix = if !fix_ok {
                "NO_GPS".to_string()
            } else if flags.contains(NavPvtFlags::CARR_SOLN_FIXED)
                || flags.contains(NavPvtFlags::CARR_SOLN_FLOAT)
            {
                "RTK".to_string()
            } else {
                "GPS".to_string()
            };

            state.satellites = pvt.num_satellites() as u32;
            state.sd = (pvt.horizontal_accuracy() * 1000.0).round() / 1000.0;
            if state.hdop == 0.0 {
                state.hdop = pvt.pdop();
            }

            if fix_ok {
                let lat = pvt.latitude();
                let lon = pvt.longitude();
                if lat.is_finite() && lon.is_finite() && lat.abs() <= 90.0 && lon.abs() <= 180.0 {
                    state.lat = Some((lat * 1e7).round() / 1e7);
                    state.lon = Some((lon * 1e7).round() / 1e7);
                }

                let raw_hdg = if flags.contains(NavPvtFlags::HEAD_VEH_VALID) {
                    pvt.heading_vehicle()
                } else {
                    pvt.heading_motion()
                };
                if raw_hdg.is_finite() {
                    state.heading = ((raw_hdg % 360.0) + 360.0) % 360.0;
                }
            }
            true
        }
        PacketRef::NavDop(dop) => {
            let hdop = f64::from(dop.horizontal_dop());
            if hdop.is_finite() && hdop > 0.0 {
                state.hdop = hdop;
                return true;
            }
            false
        }
        _ => false,
    }
}

/// Streaming GNSS decoder supporting both binary UBX frames and ASCII NMEA-0183 lines.
struct GnssStreamDecoder {
    ubx_parser: UbxParser<ublox::FixedBuffer<4096>>,
    nmea_buf: Vec<u8>,
    nmea_active: bool,
    fix_state: RtkFixState,
}

impl GnssStreamDecoder {
    fn new() -> Self {
        Self {
            ubx_parser: ublox::ParserBuilder::new().with_fixed_buffer::<4096>(),
            nmea_buf: Vec::with_capacity(256),
            nmea_active: false,
            fix_state: RtkFixState::default(),
        }
    }

    fn feed(&mut self, bytes: &[u8]) -> bool {
        let mut changed = false;

        let mut it = self.ubx_parser.consume_ubx(bytes);
        while let Some(res) = it.next() {
            if let Ok(pkt) = res {
                if apply_ubx_packet(pkt, &mut self.fix_state) {
                    changed = true;
                }
            }
        }

        for &b in bytes {
            if b == b'$' {
                self.nmea_buf.clear();
                self.nmea_buf.push(b);
                self.nmea_active = true;
            } else if self.nmea_active {
                if b == b'\n' {
                    let line = String::from_utf8_lossy(&self.nmea_buf);
                    if parse_nmea_sentence(&line, &mut self.fix_state) {
                        changed = true;
                    }
                    self.nmea_buf.clear();
                    self.nmea_active = false;
                } else if (b.is_ascii_graphic() || b == b' ' || b == b'\r') && self.nmea_buf.len() < 512 {
                    self.nmea_buf.push(b);
                } else {
                    self.nmea_buf.clear();
                    self.nmea_active = false;
                }
            }
        }

        changed
    }
}

async fn read_nmea_stream<R: tokio::io::AsyncRead + Unpin>(
    mut reader: R,
    app_state: &AppState,
    source_label: &str,
) {
    let mut decoder = GnssStreamDecoder::new();
    let mut buf = [0u8; 1024];
    let mut last_emit = Instant::now() - Duration::from_secs(1);

    loop {
        match reader.read(&mut buf).await {
            Ok(0) => break,
            Ok(n) => {
                if decoder.feed(&buf[..n]) && last_emit.elapsed() >= Duration::from_millis(100) {
                    last_emit = Instant::now();
                    publish_rtk_state(app_state, &decoder.fix_state, source_label).await;
                }
            }
            Err(e) => {
                tracing::debug!(source = %source_label, error = %e, "GNSS stream read error");
                break;
            }
        }
    }
}

enum SerialReadExit {
    Disconnected(Option<String>),
    NonGnssStream,
}

async fn read_serial_blocking(
    port: String,
    baud: u32,
    auto_detected: bool,
    app_state: AppState,
) -> SerialReadExit {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<RtkFixState>(64);
    let port_for_thread = port.clone();

    let reader_handle = tokio::task::spawn_blocking(move || -> SerialReadExit {
        let mut serial = match serialport::new(&port_for_thread, baud)
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .dtr_on_open(false)
            .timeout(Duration::from_millis(200))
            .open()
        {
            Ok(s) => s,
            Err(e) => {
                return SerialReadExit::Disconnected(Some(format_serial_open_error(
                    &port_for_thread,
                    e.kind(),
                    &e.description,
                    cfg!(target_os = "windows"),
                    cfg!(target_os = "linux"),
                )));
            }
        };

        let mut decoder = GnssStreamDecoder::new();
        let mut buf = [0u8; 1024];
        let opened_at = Instant::now();
        let mut seen_valid_gnss = false;
        let mut last_emit = Instant::now() - Duration::from_secs(1);

        loop {
            match serial.read(&mut buf) {
                Ok(0) => {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Ok(n) => {
                    if decoder.feed(&buf[..n]) {
                        seen_valid_gnss = true;
                        if last_emit.elapsed() >= Duration::from_millis(100) {
                            last_emit = Instant::now();
                            if tx.blocking_send(decoder.fix_state.clone()).is_err() {
                                break;
                            }
                        }
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    return SerialReadExit::Disconnected(Some(format!(
                        "Serial read error on {port_for_thread}: {e}"
                    )));
                }
            }

            if auto_detected && !seen_valid_gnss && opened_at.elapsed() > Duration::from_secs(5) {
                return SerialReadExit::NonGnssStream;
            }
        }
        SerialReadExit::Disconnected(None)
    });

    while let Some(fix_state) = rx.recv().await {
        publish_rtk_state(&app_state, &fix_state, &port).await;
    }

    match reader_handle.await {
        Ok(res) => res,
        Err(e) => SerialReadExit::Disconnected(Some(format!("Serial reader task panicked: {e}"))),
    }
}

/// Spawn the background RTK GNSS reader task.
pub fn spawn(app_state: AppState) {
    tauri::async_runtime::spawn(async move {
        let baud: u32 = std::env::var("RTK_BAUD")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(115_200);

        // Give magnetometer_reader a brief head-start to claim ESP32 CP2102 serial ports when RTK_SERIAL_PORT is unset
        if std::env::var("RTK_SERIAL_PORT")
            .map(|v| v.trim().is_empty())
            .unwrap_or(true)
        {
            tokio::time::sleep(Duration::from_millis(600)).await;
        }

        let mut ignored_ports: HashMap<String, Instant> = HashMap::new();

        loop {
            ignored_ports.retain(|_, until| *until > Instant::now());

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

            if let Some((port, auto_detected)) = find_serial_port(&app_state, &ignored_ports).await {
                tracing::info!(port = %port, baud, "Connected to RTK serial receiver");
                match read_serial_blocking(port.clone(), baud, auto_detected, app_state.clone()).await {
                    SerialReadExit::NonGnssStream => {
                        tracing::info!(
                            port = %port,
                            "No NMEA/UBX GNSS stream detected on auto-probed port — yielding port"
                        );
                        ignored_ports.insert(
                            normalize_port_name(&port),
                            Instant::now() + Duration::from_secs(30),
                        );
                        continue;
                    }
                    SerialReadExit::Disconnected(None) => {
                        tracing::warn!(port = %port, "RTK serial receiver disconnected");
                        mark_rtk_error(&app_state, &port, "Serial receiver disconnected").await;
                    }
                    SerialReadExit::Disconnected(Some(msg)) => {
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

    #[test]
    fn test_select_preferred_serial_port_prefers_usb() {
        let ports = vec![
            SerialPortInfo {
                port_name: "COM1".to_string(),
                port_type: SerialPortType::Unknown,
            },
            SerialPortInfo {
                port_name: "COM5".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: 0x1546,
                    pid: 0x01a8,
                    serial_number: None,
                    manufacturer: None,
                    product: None,
                }),
            },
        ];
        assert_eq!(
            select_preferred_serial_port(&ports).as_deref(),
            Some("COM5")
        );
    }

    #[test]
    fn test_windows_coexistence_with_esp32_and_case_insensitive_exclusion() {
        let ports = vec![
            SerialPortInfo {
                port_name: "COM4".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: 0x10c4,
                    pid: 0xea60,
                    serial_number: None,
                    manufacturer: Some("Silicon Labs".to_string()),
                    product: Some("Silicon Labs CP210x USB to UART Bridge (COM4)".to_string()),
                }),
            },
            SerialPortInfo {
                port_name: "COM10".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: 0x1546,
                    pid: 0x01a8,
                    serial_number: None,
                    manufacturer: Some("u-blox AG".to_string()),
                    product: Some("u-blox GNSS receiver (COM10)".to_string()),
                }),
            },
        ];

        assert_eq!(
            select_preferred_serial_port_excluding(&ports, &[]).as_deref(),
            Some("COM10")
        );

        let only_esp32 = vec![ports[0].clone()];
        assert_eq!(
            select_preferred_serial_port_excluding(&only_esp32, &["com4".to_string()]),
            None
        );
        // Even without explicit exclusion, RTK auto-detection must not hijack an ESP32 CP2102 bridge
        assert_eq!(
            select_preferred_serial_port_excluding(&only_esp32, &[]),
            None
        );

        // Generic non-ESP32 USB receiver beats CP2102 bridge on Windows
        let mixed_usb = vec![
            SerialPortInfo {
                port_name: "COM3".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: 0x10c4,
                    pid: 0xea60,
                    serial_number: None,
                    manufacturer: Some("Silicon Labs".to_string()),
                    product: Some("CP2102 USB to UART Bridge Controller (COM3)".to_string()),
                }),
            },
            SerialPortInfo {
                port_name: "COM12".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: 0x0e8d,
                    pid: 0x3329,
                    serial_number: None,
                    manufacturer: Some("GNSS Vendor".to_string()),
                    product: Some("USB GNSS Receiver (COM12)".to_string()),
                }),
            },
        ];
        assert_eq!(
            select_preferred_serial_port_excluding(&mixed_usb, &[]).as_deref(),
            Some("COM12")
        );
    }
}
