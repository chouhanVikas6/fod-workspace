//! Local ESP32 HMC5883L 3-axis magnetometer USB serial reader.
//!
//! Reads `ms,mx,my,mz` CSV lines streamed over USB UART (e.g. Silicon Labs CP2102
//! `10c4:ea60` on `/dev/ttyUSB0` or Windows `COMx` at `115200` baud), applies
//! optional hard-iron / soft-iron calibration & circular EMA smoothing, and writes
//! live compass direction into `AppState.health.magnetometer` as well as
//! `AppState.health.rtk_data`.

use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::json;
use serialport::{SerialPortInfo, SerialPortType};
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::path::PathBuf;
use std::time::{Duration, Instant};
use tokio::sync::{watch, Notify, RwLock};

const DEFAULT_CAL_PATH: &str = "magnetometer_cal.json";

const VID_SILICON_LABS: u16 = 0x10c4;
const VID_QINHENG_CH340: u16 = 0x1a86;
const VID_ESPRESSIF: u16 = 0x303a;
const VID_FTDI: u16 = 0x0403;
const VID_PROLIFIC: u16 = 0x067b;
const VID_UBLOX: u16 = 0x1546;

pub fn default_cal_file_path() -> PathBuf {
    if let Ok(override_path) = std::env::var("MAG_CAL_PATH") {
        let trimmed = override_path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    if cfg!(target_os = "windows") {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let trimmed = appdata.trim();
            if !trimmed.is_empty() {
                return PathBuf::from(trimmed)
                    .join("com.zoid.fod-desktop")
                    .join(DEFAULT_CAL_PATH);
            }
        }
    }
    PathBuf::from(DEFAULT_CAL_PATH)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct MagnetometerCalibration {
    pub offset_x: f64,
    pub offset_y: f64,
    pub offset_z: f64,
    pub scale_x: f64,
    pub scale_y: f64,
    pub heading_offset_deg: f64,
    pub declination_deg: f64,
    pub invert_direction: bool,
    pub calibrated: bool,
}

impl Default for MagnetometerCalibration {
    fn default() -> Self {
        Self {
            offset_x: 0.0,
            offset_y: 0.0,
            offset_z: 0.0,
            scale_x: 1.0,
            scale_y: 1.0,
            heading_offset_deg: 0.0,
            declination_deg: 0.0,
            invert_direction: false,
            calibrated: false,
        }
    }
}

impl MagnetometerCalibration {
    pub fn load() -> Self {
        Self::load_from(&default_cal_file_path())
    }

    pub fn load_from(path: &std::path::Path) -> Self {
        if let Ok(raw) = std::fs::read_to_string(path) {
            if let Ok(parsed) = serde_json::from_str::<Self>(&raw) {
                return parsed;
            }
        }
        Self::default()
    }

    pub fn save_to(&self, path: &std::path::Path) {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                if let Err(e) = std::fs::create_dir_all(parent) {
                    tracing::warn!(path = %path.display(), error = %e, "Failed to create magnetometer calibration directory");
                }
            }
        }
        match serde_json::to_string_pretty(self) {
            Ok(json_str) => {
                if let Err(e) = std::fs::write(path, json_str) {
                    tracing::warn!(path = %path.display(), error = %e, "Failed to persist magnetometer calibration");
                }
            }
            Err(e) => {
                tracing::warn!(error = %e, "Failed to serialize magnetometer calibration");
            }
        }
    }
}

#[derive(Debug, Clone)]
pub struct CalibrationSweep {
    pub active: bool,
    pub samples: u32,
    pub min_x: f64,
    pub max_x: f64,
    pub min_y: f64,
    pub max_y: f64,
    pub min_z: f64,
    pub max_z: f64,
}

impl Default for CalibrationSweep {
    fn default() -> Self {
        Self {
            active: false,
            samples: 0,
            min_x: f64::INFINITY,
            max_x: f64::NEG_INFINITY,
            min_y: f64::INFINITY,
            max_y: f64::NEG_INFINITY,
            min_z: f64::INFINITY,
            max_z: f64::NEG_INFINITY,
        }
    }
}

impl CalibrationSweep {
    pub fn record(&mut self, mx: i32, my: i32, mz: i32) {
        if !self.active {
            return;
        }
        let x = f64::from(mx);
        let y = f64::from(my);
        let z = f64::from(mz);
        self.samples = self.samples.saturating_add(1);
        self.min_x = self.min_x.min(x);
        self.max_x = self.max_x.max(x);
        self.min_y = self.min_y.min(y);
        self.max_y = self.max_y.max(y);
        self.min_z = self.min_z.min(z);
        self.max_z = self.max_z.max(z);
    }

    pub fn span_x(&self) -> f64 {
        if self.samples > 0 && self.max_x.is_finite() && self.min_x.is_finite() {
            (self.max_x - self.min_x).max(0.0)
        } else {
            0.0
        }
    }

    pub fn span_y(&self) -> f64 {
        if self.samples > 0 && self.max_y.is_finite() && self.min_y.is_finite() {
            (self.max_y - self.min_y).max(0.0)
        } else {
            0.0
        }
    }
}

pub struct MagnetometerControl {
    claimed_port: RwLock<Option<String>>,
    preferred_port: RwLock<Option<String>>,
    reconnect_notify: Notify,
    calibration: RwLock<MagnetometerCalibration>,
    storage_path: RwLock<PathBuf>,
    sweep: RwLock<CalibrationSweep>,
    last_raw: RwLock<Option<(i32, i32, i32)>>,
}

impl Default for MagnetometerControl {
    fn default() -> Self {
        Self::new()
    }
}

impl MagnetometerControl {
    pub fn new() -> Self {
        let initial_path = default_cal_file_path();
        let initial_cal = MagnetometerCalibration::load_from(&initial_path);
        Self {
            claimed_port: RwLock::new(None),
            preferred_port: RwLock::new(None),
            reconnect_notify: Notify::new(),
            calibration: RwLock::new(initial_cal),
            storage_path: RwLock::new(initial_path),
            sweep: RwLock::new(CalibrationSweep::default()),
            last_raw: RwLock::new(None),
        }
    }

    pub async fn init_storage_dir(&self, dir: PathBuf) {
        if std::env::var("MAG_CAL_PATH")
            .map(|v| !v.trim().is_empty())
            .unwrap_or(false)
        {
            return;
        }
        let target = dir.join(DEFAULT_CAL_PATH);
        *self.storage_path.write().await = target.clone();
        if target.is_file() {
            let loaded = MagnetometerCalibration::load_from(&target);
            *self.calibration.write().await = loaded;
        } else {
            let legacy = std::path::Path::new(DEFAULT_CAL_PATH);
            if legacy.is_file() {
                let loaded = MagnetometerCalibration::load_from(legacy);
                loaded.save_to(&target);
                *self.calibration.write().await = loaded;
            }
        }
    }

    pub async fn claimed_port(&self) -> Option<String> {
        self.claimed_port.read().await.clone()
    }

    pub async fn set_claimed_port(&self, port: Option<String>) {
        *self.claimed_port.write().await = port;
    }

    pub async fn preferred_port(&self) -> Option<String> {
        self.preferred_port.read().await.clone()
    }

    pub async fn set_preferred_port(&self, port: Option<String>) {
        let cleaned = port
            .map(|p| normalize_port_name(&p))
            .filter(|p| !p.is_empty() && !p.eq_ignore_ascii_case("auto"));
        *self.preferred_port.write().await = cleaned;
        self.reconnect_notify.notify_waiters();
    }

    pub async fn current_calibration(&self) -> MagnetometerCalibration {
        self.calibration.read().await.clone()
    }

    pub async fn start_calibration(&self) {
        let mut sw = self.sweep.write().await;
        *sw = CalibrationSweep {
            active: true,
            ..Default::default()
        };
    }

    pub async fn cancel_calibration(&self) {
        let mut sw = self.sweep.write().await;
        *sw = CalibrationSweep::default();
    }

    pub async fn finish_calibration(&self) -> Result<MagnetometerCalibration, String> {
        let sw = {
            let guard = self.sweep.read().await;
            guard.clone()
        };
        if !sw.active {
            return Err("Calibration sweep is not active".to_string());
        }
        if sw.samples < 15 {
            return Err(format!(
                "Need at least 15 samples during 360° rotation sweep (got {})",
                sw.samples
            ));
        }
        let span_x = sw.span_x();
        let span_y = sw.span_y();
        if span_x <= 10.0 || span_y <= 10.0 {
            return Err(format!(
                "Insufficient rotation span (X={span_x:.0}, Y={span_y:.0}) — rotate device full 360°"
            ));
        }

        let offset_x = (sw.max_x + sw.min_x) / 2.0;
        let offset_y = (sw.max_y + sw.min_y) / 2.0;
        let offset_z = if sw.max_z.is_finite() && sw.min_z.is_finite() {
            (sw.max_z + sw.min_z) / 2.0
        } else {
            0.0
        };
        let avg_radius = (span_x + span_y) / 4.0;
        let scale_x = (avg_radius / (span_x / 2.0)).clamp(0.5, 2.0);
        let scale_y = (avg_radius / (span_y / 2.0)).clamp(0.5, 2.0);

        let storage_path = self.storage_path.read().await.clone();
        let updated = {
            let mut cal = self.calibration.write().await;
            cal.offset_x = offset_x;
            cal.offset_y = offset_y;
            cal.offset_z = offset_z;
            cal.scale_x = scale_x;
            cal.scale_y = scale_y;
            cal.calibrated = true;
            cal.save_to(&storage_path);
            cal.clone()
        };

        *self.sweep.write().await = CalibrationSweep::default();
        Ok(updated)
    }

    pub async fn set_zero_north(&self) -> Result<MagnetometerCalibration, String> {
        let raw = *self.last_raw.read().await;
        let Some((mx, my, _mz)) = raw else {
            return Err("No live magnetometer reading yet".to_string());
        };

        let storage_path = self.storage_path.read().await.clone();
        let mut cal = self.calibration.write().await;
        let cx = (f64::from(mx) - cal.offset_x) * cal.scale_x;
        let cy = (f64::from(my) - cal.offset_y) * cal.scale_y;
        let signed_y = if cal.invert_direction { -cy } else { cy };
        let unshifted = normalize_deg(signed_y.atan2(cx).to_degrees());
        cal.heading_offset_deg = normalize_deg(-unshifted - cal.declination_deg);
        cal.save_to(&storage_path);
        Ok(cal.clone())
    }

    pub async fn update_settings(
        &self,
        heading_offset_deg: Option<f64>,
        declination_deg: Option<f64>,
        invert_direction: Option<bool>,
    ) -> MagnetometerCalibration {
        let storage_path = self.storage_path.read().await.clone();
        let mut cal = self.calibration.write().await;
        if let Some(off) = heading_offset_deg {
            if off.is_finite() {
                cal.heading_offset_deg = normalize_deg(off);
            }
        }
        if let Some(decl) = declination_deg {
            if decl.is_finite() {
                cal.declination_deg = decl.clamp(-180.0, 180.0);
            }
        }
        if let Some(inv) = invert_direction {
            cal.invert_direction = inv;
        }
        cal.save_to(&storage_path);
        cal.clone()
    }

    pub async fn reset_calibration(&self) -> MagnetometerCalibration {
        *self.sweep.write().await = CalibrationSweep::default();
        let storage_path = self.storage_path.read().await.clone();
        let mut cal = self.calibration.write().await;
        *cal = MagnetometerCalibration::default();
        cal.save_to(&storage_path);
        cal.clone()
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum MagLine {
    Sample { ms: u64, mx: i32, my: i32, mz: i32 },
    Header,
    SensorError(String),
    NonMagProtocol,
    Ignore,
}

pub fn parse_mag_line(line: &str) -> MagLine {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return MagLine::Ignore;
    }
    if trimmed.starts_with("$GP")
        || trimmed.starts_with("$GN")
        || trimmed.starts_with("$GL")
        || trimmed.starts_with("$GA")
    {
        return MagLine::NonMagProtocol;
    }
    if trimmed.eq_ignore_ascii_case("ms,mx,my,mz") {
        return MagLine::Header;
    }
    if let Some(err) = trimmed.strip_prefix("ERR,") {
        return MagLine::SensorError(err.trim().to_string());
    }

    let parts: Vec<&str> = trimmed.split(',').collect();
    if parts.len() == 4 || parts.len() == 5 {
        if let (Ok(ms), Ok(mx), Ok(my), Ok(mz)) = (
            parts[0].trim().parse::<u64>(),
            parts[1].trim().parse::<i32>(),
            parts[2].trim().parse::<i32>(),
            parts[3].trim().parse::<i32>(),
        ) {
            let valid_range = -32768..=32767;
            if valid_range.contains(&mx) && valid_range.contains(&my) && valid_range.contains(&mz) {
                return MagLine::Sample { ms, mx, my, mz };
            }
        }
    }

    MagLine::Ignore
}

pub fn normalize_deg(deg: f64) -> f64 {
    if !deg.is_finite() {
        return 0.0;
    }
    let m = deg.rem_euclid(360.0);
    if (m - 360.0).abs() < 1e-9 { 0.0 } else { m }
}

pub fn compute_heading_deg(mx: i32, my: i32, cal: &MagnetometerCalibration) -> f64 {
    let cx = (f64::from(mx) - cal.offset_x) * cal.scale_x;
    let cy = (f64::from(my) - cal.offset_y) * cal.scale_y;
    let signed_y = if cal.invert_direction { -cy } else { cy };
    let raw_deg = signed_y.atan2(cx).to_degrees();
    normalize_deg(raw_deg + cal.heading_offset_deg + cal.declination_deg)
}

pub fn cardinal_direction(deg: f64) -> &'static str {
    let norm = normalize_deg(deg);
    let idx = (((norm + 22.5) / 45.0).floor() as usize) % 8;
    match idx {
        0 => "N",
        1 => "NE",
        2 => "E",
        3 => "SE",
        4 => "S",
        5 => "SW",
        6 => "W",
        _ => "NW",
    }
}

#[derive(Debug, Clone)]
pub struct CircularHeadingFilter {
    sin_ema: Option<f64>,
    cos_ema: Option<f64>,
    alpha: f64,
}

impl CircularHeadingFilter {
    pub fn new(alpha: f64) -> Self {
        Self {
            sin_ema: None,
            cos_ema: None,
            alpha: alpha.clamp(0.01, 1.0),
        }
    }

    pub fn reset(&mut self) {
        self.sin_ema = None;
        self.cos_ema = None;
    }

    pub fn update(&mut self, deg: f64) -> f64 {
        let rad = normalize_deg(deg).to_radians();
        let s = rad.sin();
        let c = rad.cos();
        match (self.sin_ema, self.cos_ema) {
            (Some(prev_s), Some(prev_c)) => {
                let next_s = prev_s * (1.0 - self.alpha) + s * self.alpha;
                let next_c = prev_c * (1.0 - self.alpha) + c * self.alpha;
                self.sin_ema = Some(next_s);
                self.cos_ema = Some(next_c);
                normalize_deg(next_s.atan2(next_c).to_degrees())
            }
            _ => {
                self.sin_ema = Some(s);
                self.cos_ema = Some(c);
                normalize_deg(deg)
            }
        }
    }
}

pub fn windows_com_number(name: &str) -> Option<u32> {
    let trimmed = name.trim();
    let stripped = trimmed
        .strip_prefix(r"\\.\")
        .or_else(|| trimmed.strip_prefix(r"\\?\"))
        .unwrap_or(trimmed);
    let prefix = stripped.get(..3)?;
    if !prefix.eq_ignore_ascii_case("COM") {
        return None;
    }
    let rest = &stripped[3..];
    if rest.is_empty() || !rest.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    rest.parse::<u32>().ok()
}

pub fn is_windows_com_port(name: &str) -> bool {
    windows_com_number(name).is_some()
}

pub fn normalize_port_name(name: &str) -> String {
    if let Some(n) = windows_com_number(name) {
        format!("COM{n}")
    } else {
        name.trim().to_string()
    }
}

pub fn ports_match(a: &str, b: &str) -> bool {
    normalize_port_name(a) == normalize_port_name(b)
}

pub fn port_sort_key(name: &str) -> (u8, u32, String) {
    if let Some(n) = windows_com_number(name) {
        (0, n, format!("COM{n}"))
    } else {
        (1, 0, name.trim().to_string())
    }
}

/// Sort key for fallback COM probing where COM3+ (USB bridges) come before legacy COM1/COM2.
pub fn fallback_port_sort_key(name: &str) -> (u8, u8, u32, String) {
    if let Some(n) = windows_com_number(name) {
        let tier = if n <= 2 { 1 } else { 0 };
        (0, tier, n, format!("COM{n}"))
    } else {
        (1, 0, 0, name.trim().to_string())
    }
}

fn usb_meta_lower(info: &SerialPortInfo) -> String {
    match &info.port_type {
        SerialPortType::UsbPort(usb) => {
            let mut combined = String::new();
            if let Some(prod) = &usb.product {
                combined.push_str(&prod.to_ascii_lowercase());
                combined.push(' ');
            }
            if let Some(mfg) = &usb.manufacturer {
                combined.push_str(&mfg.to_ascii_lowercase());
            }
            combined
        }
        _ => String::new(),
    }
}

pub fn is_ublox_port(info: &SerialPortInfo) -> bool {
    match &info.port_type {
        SerialPortType::UsbPort(usb) => {
            if usb.vid == VID_UBLOX {
                return true;
            }
            let meta = usb_meta_lower(info);
            meta.contains("u-blox") || meta.contains("ublox")
        }
        _ => false,
    }
}

pub fn is_silicon_labs_cp210x(info: &SerialPortInfo) -> bool {
    if is_ublox_port(info) {
        return false;
    }
    match &info.port_type {
        SerialPortType::UsbPort(usb) => {
            if usb.vid == VID_SILICON_LABS {
                return true;
            }
            let meta = usb_meta_lower(info);
            meta.contains("cp210") || meta.contains("silicon labs")
        }
        _ => false,
    }
}

pub fn is_esp32_usb_bridge(info: &SerialPortInfo) -> bool {
    if is_ublox_port(info) {
        return false;
    }
    if is_silicon_labs_cp210x(info) {
        return true;
    }
    match &info.port_type {
        SerialPortType::UsbPort(usb) => {
            if matches!(
                usb.vid,
                VID_QINHENG_CH340 | VID_ESPRESSIF | VID_FTDI | VID_PROLIFIC
            ) {
                return true;
            }
            let meta = usb_meta_lower(info);
            [
                "ch340",
                "ch9102",
                "esp32",
                "ftdi",
                "usb-serial",
                "usb to uart",
                "uart bridge",
            ]
            .iter()
            .any(|kw| meta.contains(kw))
        }
        _ => false,
    }
}

fn is_macos_usb_serial(name: &str) -> bool {
    name.starts_with("/dev/cu.usbserial")
        || name.starts_with("/dev/cu.SLAB")
        || name.starts_with("/dev/cu.wchusbserial")
        || name.starts_with("/dev/cu.usbmodem")
}

pub fn format_serial_open_error(
    port: &str,
    kind: serialport::ErrorKind,
    desc: &str,
    is_windows: bool,
    is_linux: bool,
) -> String {
    if is_linux && kind == serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) {
        return format!("Permission denied on {port} (add user to dialout group)");
    }
    if is_windows
        && (kind == serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied)
            || (kind == serialport::ErrorKind::NoDevice
                && desc.to_ascii_lowercase().contains("access")))
    {
        return format!(
            "{port} is in use or access denied (close Arduino Serial Monitor / other serial apps)"
        );
    }
    if kind == serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied) {
        return format!("Permission denied on {port} (port may be in use by another app)");
    }
    format!("Failed to open {port}: {desc}")
}

pub fn select_magnetometer_port(
    ports: &[SerialPortInfo],
    excluded: &[String],
    ignored: &HashSet<String>,
) -> Option<String> {
    let is_blocked = |name: &str| {
        excluded.iter().any(|e| ports_match(e, name))
            || ignored.iter().any(|i| ports_match(i, name))
    };

    // Priority 1: Silicon Labs CP2102/CP210x (0x10c4 or Windows FriendlyName)
    let mut cp210x: Vec<&str> = ports
        .iter()
        .filter(|p| !is_blocked(&p.port_name) && !is_ublox_port(p) && is_silicon_labs_cp210x(p))
        .map(|p| p.port_name.as_str())
        .collect();
    cp210x.sort_by_key(|name| port_sort_key(name));
    if let Some(first) = cp210x.first() {
        return Some((*first).to_string());
    }

    // Priority 2: Other common ESP32 USB bridges (CH340, Espressif USB-JTAG, FTDI, Prolific)
    let mut bridges: Vec<&str> = ports
        .iter()
        .filter(|p| !is_blocked(&p.port_name) && !is_ublox_port(p) && is_esp32_usb_bridge(p))
        .map(|p| p.port_name.as_str())
        .collect();
    bridges.sort_by_key(|name| port_sort_key(name));
    if let Some(first) = bridges.first() {
        return Some((*first).to_string());
    }

    // Priority 3: Generic non-u-blox USB serial port (Linux ttyUSB, macOS cu.*, Windows COM3+ before COM1/COM2)
    let mut usb_generic: Vec<&str> = ports
        .iter()
        .filter(|p| {
            !is_blocked(&p.port_name)
                && !is_ublox_port(p)
                && matches!(p.port_type, SerialPortType::UsbPort(_))
                && (p.port_name.starts_with("/dev/ttyUSB")
                    || is_macos_usb_serial(&p.port_name)
                    || is_windows_com_port(&p.port_name))
        })
        .map(|p| p.port_name.as_str())
        .collect();
    usb_generic.sort_by_key(|name| fallback_port_sort_key(name));
    if let Some(first) = usb_generic.first() {
        return Some((*first).to_string());
    }

    // Priority 4: Unknown serial port fallback (e.g. Windows SERIALCOMM registry COM ports)
    let mut unknown_fallback: Vec<&str> = ports
        .iter()
        .filter(|p| {
            !is_blocked(&p.port_name)
                && !is_ublox_port(p)
                && matches!(p.port_type, SerialPortType::Unknown)
                && (p.port_name.starts_with("/dev/ttyUSB")
                    || is_macos_usb_serial(&p.port_name)
                    || is_windows_com_port(&p.port_name))
        })
        .map(|p| p.port_name.as_str())
        .collect();
    unknown_fallback.sort_by_key(|name| fallback_port_sort_key(name));
    unknown_fallback.first().map(|p| (*p).to_string())
}

pub fn list_available_serial_ports() -> Vec<serde_json::Value> {
    let Ok(mut ports) = serialport::available_ports() else {
        return Vec::new();
    };
    ports.sort_by(|a, b| port_sort_key(&a.port_name).cmp(&port_sort_key(&b.port_name)));

    ports
        .into_iter()
        .map(|p| {
            let esp_bridge = is_esp32_usb_bridge(&p);
            let ublox = is_ublox_port(&p);
            match p.port_type {
                SerialPortType::UsbPort(u) => {
                    let desc = u
                        .product
                        .or(u.manufacturer)
                        .unwrap_or_else(|| format!("USB {:04x}:{:04x}", u.vid, u.pid));
                    json!({
                        "portName": p.port_name,
                        "description": desc,
                        "vid": format!("{:04x}", u.vid),
                        "pid": format!("{:04x}", u.pid),
                        "isEsp32Bridge": esp_bridge,
                        "isUblox": ublox,
                    })
                }
                SerialPortType::BluetoothPort => json!({
                    "portName": p.port_name,
                    "description": "Bluetooth Serial",
                    "vid": serde_json::Value::Null,
                    "pid": serde_json::Value::Null,
                    "isEsp32Bridge": false,
                    "isUblox": false,
                }),
                SerialPortType::PciPort => json!({
                    "portName": p.port_name,
                    "description": "PCI Serial",
                    "vid": serde_json::Value::Null,
                    "pid": serde_json::Value::Null,
                    "isEsp32Bridge": false,
                    "isUblox": false,
                }),
                SerialPortType::Unknown => json!({
                    "portName": p.port_name,
                    "description": "Serial Port",
                    "vid": serde_json::Value::Null,
                    "pid": serde_json::Value::Null,
                    "isEsp32Bridge": false,
                    "isUblox": false,
                }),
            }
        })
        .collect()
}

struct MagSampleEvent {
    mx: i32,
    my: i32,
    mz: i32,
    sample_rate_hz: f64,
}

enum ReaderSignal {
    Sample(MagSampleEvent),
    SensorError(String),
}

async fn publish_mag_sample(
    state: &AppState,
    port: &str,
    ev: MagSampleEvent,
    filter: &mut CircularHeadingFilter,
) {
    let ctrl = &state.mag_control;
    *ctrl.last_raw.write().await = Some((ev.mx, ev.my, ev.mz));

    let (calibrating, cal_samples, span_x, span_y) = {
        let mut sw = ctrl.sweep.write().await;
        if sw.active {
            sw.record(ev.mx, ev.my, ev.mz);
        }
        (sw.active, sw.samples, sw.span_x(), sw.span_y())
    };

    let cal = ctrl.calibration.read().await.clone();
    let raw_hdg = compute_heading_deg(ev.mx, ev.my, &cal);
    let smoothed = (filter.update(raw_hdg) * 10.0).round() / 10.0;
    let raw_rounded = (raw_hdg * 10.0).round() / 10.0;
    let cardinal = cardinal_direction(smoothed);
    let field_strength =
        (f64::from(ev.mx).powi(2) + f64::from(ev.my).powi(2) + f64::from(ev.mz).powi(2)).sqrt();
    let now_ms = chrono::Utc::now().timestamp_millis();

    let mut h = state.health.write().await;
    h.magnetometer.data = json!({
        "connected": true,
        "port": port,
        "heading": smoothed,
        "rawHeading": raw_rounded,
        "cardinal": cardinal,
        "mx": ev.mx,
        "my": ev.my,
        "mz": ev.mz,
        "fieldStrength": (field_strength * 10.0).round() / 10.0,
        "sampleRateHz": (ev.sample_rate_hz * 10.0).round() / 10.0,
        "calibrated": cal.calibrated,
        "calibrating": calibrating,
        "calSamples": cal_samples,
        "calSpanX": span_x.round(),
        "calSpanY": span_y.round(),
        "headingOffsetDeg": (cal.heading_offset_deg * 10.0).round() / 10.0,
        "declinationDeg": (cal.declination_deg * 10.0).round() / 10.0,
        "invertDirection": cal.invert_direction,
        "error": serde_json::Value::Null,
        "updatedAtMs": now_ms,
    });
    h.magnetometer.event_status = true;
    h.magnetometer.data_status = true;

    // Also keep RtkData.data.heading live for header/map/WebCam consumers without altering GPS fix/coords
    if let Some(obj) = h.rtk_data.data.as_object_mut() {
        obj.insert("heading".to_string(), json!(smoothed));
        obj.insert("headingSource".to_string(), json!("magnetometer"));
    } else {
        h.rtk_data.data = json!({
            "heading": smoothed,
            "headingSource": "magnetometer",
        });
    }
}

pub async fn mark_mag_offline(state: &AppState, port: Option<&str>, err_msg: Option<&str>) {
    let cal = state.mag_control.calibration.read().await.clone();
    let (calibrating, cal_samples, span_x, span_y) = {
        let sw = state.mag_control.sweep.read().await;
        (sw.active, sw.samples, sw.span_x(), sw.span_y())
    };
    let mut h = state.health.write().await;
    let prev_heading = h.magnetometer.data.get("heading").cloned();
    let prev_cardinal = h.magnetometer.data.get("cardinal").cloned();
    h.magnetometer.data = json!({
        "connected": false,
        "port": port,
        "heading": prev_heading.unwrap_or(serde_json::Value::Null),
        "cardinal": prev_cardinal.unwrap_or(serde_json::Value::Null),
        "calibrated": cal.calibrated,
        "calibrating": calibrating,
        "calSamples": cal_samples,
        "calSpanX": span_x.round(),
        "calSpanY": span_y.round(),
        "headingOffsetDeg": (cal.heading_offset_deg * 10.0).round() / 10.0,
        "declinationDeg": (cal.declination_deg * 10.0).round() / 10.0,
        "invertDirection": cal.invert_direction,
        "error": err_msg,
        "updatedAtMs": chrono::Utc::now().timestamp_millis(),
    });
    h.magnetometer.event_status = true;
    h.magnetometer.data_status = false;
}

enum SessionExit {
    NonMagProtocol,
    NoDataOnAutoPort,
    PortSwitchRequested,
    Disconnected(String),
}

enum LoopExit {
    BlockingFinished,
    PortSwitchRequested,
    Stalled(String),
}

async fn run_mag_serial_session(
    port: String,
    baud: u32,
    auto_detected: bool,
    is_known_esp_bridge: bool,
    app_state: AppState,
) -> SessionExit {
    let (tx, mut rx) = tokio::sync::mpsc::channel::<ReaderSignal>(128);
    let (stop_tx, stop_rx) = watch::channel(false);
    let port_for_thread = port.clone();

    let blocking_handle = tokio::task::spawn_blocking(move || -> SessionExit {
        let mut serial = match serialport::new(&port_for_thread, baud)
            .data_bits(serialport::DataBits::Eight)
            .parity(serialport::Parity::None)
            .stop_bits(serialport::StopBits::One)
            .flow_control(serialport::FlowControl::None)
            .dtr_on_open(false)
            .timeout(Duration::from_millis(100))
            .open()
        {
            Ok(s) => s,
            Err(e) => {
                let msg = format_serial_open_error(
                    &port_for_thread,
                    e.kind(),
                    &e.description,
                    cfg!(target_os = "windows"),
                    cfg!(target_os = "linux"),
                );
                return SessionExit::Disconnected(msg);
            }
        };

        // Ensure ESP32 never stays held in ROM bootloader/reset after opening UART,
        // and discard any stale boot bytes buffered in the driver.
        let _ = serial.write_data_terminal_ready(false);
        let _ = serial.write_request_to_send(false);
        let _ = serial.clear(serialport::ClearBuffer::Input);

        let mut line_buf = Vec::<u8>::with_capacity(256);
        let mut read_buf = [0u8; 512];
        let opened_at = Instant::now();
        let mut seen_valid_sample = false;
        let mut seen_any_bytes = false;
        let mut last_valid_sample_at: Option<Instant> = None;
        let mut rate_ema_hz = 0.0_f64;

        loop {
            if *stop_rx.borrow() {
                return SessionExit::PortSwitchRequested;
            }

            match serial.read(&mut read_buf) {
                Ok(0) => {
                    std::thread::sleep(Duration::from_millis(5));
                }
                Ok(n) => {
                    seen_any_bytes = true;
                    let slice = &read_buf[..n];

                    // Detect binary UBX stream (0xB5 0x62) on auto-detected ports before claiming it
                    if auto_detected
                        && !seen_valid_sample
                        && slice.windows(2).any(|w| w == [0xB5, 0x62])
                    {
                        return SessionExit::NonMagProtocol;
                    }

                    for &b in slice {
                        if b == b'\n' {
                            let line = String::from_utf8_lossy(&line_buf);
                            match parse_mag_line(&line) {
                                MagLine::Sample { mx, my, mz, .. } => {
                                    seen_valid_sample = true;
                                    let now = Instant::now();
                                    if let Some(prev) = last_valid_sample_at {
                                        let dt = now.duration_since(prev).as_secs_f64();
                                        if dt > 0.002 && dt < 2.0 {
                                            let inst_hz = 1.0 / dt;
                                            rate_ema_hz = if rate_ema_hz <= 0.0 {
                                                inst_hz
                                            } else {
                                                rate_ema_hz * 0.8 + inst_hz * 0.2
                                            };
                                        }
                                    }
                                    last_valid_sample_at = Some(now);
                                    if tx
                                        .blocking_send(ReaderSignal::Sample(MagSampleEvent {
                                            mx,
                                            my,
                                            mz,
                                            sample_rate_hz: rate_ema_hz,
                                        }))
                                        .is_err()
                                    {
                                        return SessionExit::Disconnected(
                                            "Magnetometer receiver closed".to_string(),
                                        );
                                    }
                                }
                                MagLine::SensorError(err) => {
                                    let _ = tx.blocking_send(ReaderSignal::SensorError(err));
                                }
                                MagLine::NonMagProtocol => {
                                    if auto_detected && !seen_valid_sample {
                                        return SessionExit::NonMagProtocol;
                                    }
                                }
                                MagLine::Header | MagLine::Ignore => {}
                            }
                            line_buf.clear();
                        } else if b != b'\r' && line_buf.len() < 256 {
                            line_buf.push(b);
                        } else if line_buf.len() >= 256 {
                            line_buf.clear();
                        }
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::TimedOut => {}
                Err(e) => {
                    return SessionExit::Disconnected(format!(
                        "Serial read error on {port_for_thread}: {e}"
                    ));
                }
            }

            if auto_detected && !seen_valid_sample {
                if seen_any_bytes && opened_at.elapsed() > Duration::from_secs(4) {
                    return SessionExit::NonMagProtocol;
                }
                if !seen_any_bytes && opened_at.elapsed() > Duration::from_secs(6) {
                    if !is_known_esp_bridge {
                        return SessionExit::NoDataOnAutoPort;
                    }
                    return SessionExit::Disconnected(format!(
                        "No magnetometer data on {port_for_thread} (check ESP32 firmware & {baud} baud)"
                    ));
                }
            }
        }
    });

    let mut filter = CircularHeadingFilter::new(0.25);
    let mut last_publish = Instant::now() - Duration::from_secs(1);
    let mut last_sample_time = Instant::now();
    let mut has_sample = false;
    let mut consecutive_errors: u32 = 0;
    let mut stale_tick = tokio::time::interval(Duration::from_secs(1));
    stale_tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);

    let exit_reason = loop {
        tokio::select! {
            _ = app_state.mag_control.reconnect_notify.notified() => {
                let _ = stop_tx.send(true);
                break LoopExit::PortSwitchRequested;
            }
            maybe_sig = rx.recv() => {
                match maybe_sig {
                    Some(ReaderSignal::Sample(ev)) => {
                        has_sample = true;
                        last_sample_time = Instant::now();
                        consecutive_errors = 0;
                        if last_publish.elapsed() >= Duration::from_millis(50) {
                            last_publish = Instant::now();
                            publish_mag_sample(&app_state, &port, ev, &mut filter).await;
                        }
                    }
                    Some(ReaderSignal::SensorError(err)) => {
                        consecutive_errors = consecutive_errors.saturating_add(1);
                        if consecutive_errors >= 10 {
                            mark_mag_offline(
                                &app_state,
                                Some(&port),
                                Some(&format!("Magnetometer I2C error: {err}")),
                            )
                            .await;
                        }
                    }
                    None => break LoopExit::BlockingFinished,
                }
            }
            _ = stale_tick.tick() => {
                if has_sample && last_sample_time.elapsed() > Duration::from_secs(8) {
                    // Force Windows/POSIX handle close so hot-unplug + replug recovers cleanly
                    let _ = stop_tx.send(true);
                    break LoopExit::Stalled(format!(
                        "Magnetometer stream stalled on {port}; reconnecting..."
                    ));
                } else if has_sample && last_sample_time.elapsed() > Duration::from_secs(3) {
                    mark_mag_offline(
                        &app_state,
                        Some(&port),
                        Some("No magnetometer samples received for >3s"),
                    )
                    .await;
                }
            }
        }
    };

    let blocking_res = blocking_handle
        .await
        .unwrap_or_else(|e| SessionExit::Disconnected(format!("Reader task panicked: {e}")));

    match exit_reason {
        LoopExit::PortSwitchRequested => SessionExit::PortSwitchRequested,
        LoopExit::Stalled(msg) => SessionExit::Disconnected(msg),
        LoopExit::BlockingFinished => blocking_res,
    }
}

/// Spawn the background ESP32 magnetometer USB serial reader task.
pub fn spawn(app_state: AppState) {
    tauri::async_runtime::spawn(async move {
        let baud: u32 = std::env::var("MAG_BAUD")
            .ok()
            .and_then(|v| v.parse().ok())
            .unwrap_or(115_200);

        let mut ignored_ports: HashMap<String, Instant> = HashMap::new();

        loop {
            ignored_ports.retain(|_, until| *until > Instant::now());

            let explicit_env_port = std::env::var("MAG_SERIAL_PORT")
                .ok()
                .map(|p| normalize_port_name(&p))
                .filter(|p| !p.is_empty());
            let preferred_ui_port = app_state.mag_control.preferred_port().await;

            let (chosen_port, auto_detected, is_known_esp_bridge) =
                if let Some(p) = preferred_ui_port {
                    (Some(p), false, true)
                } else if let Some(p) = explicit_env_port {
                    (Some(p), false, true)
                } else {
                    let mut excluded = Vec::new();
                    if let Ok(rtk_p) = std::env::var("RTK_SERIAL_PORT") {
                        let trimmed = normalize_port_name(&rtk_p);
                        if !trimmed.is_empty() {
                            excluded.push(trimmed);
                        }
                    }
                    let active_ignored: HashSet<String> = ignored_ports.keys().cloned().collect();
                    let found = serialport::available_ports().ok().and_then(|ports| {
                        let selected =
                            select_magnetometer_port(&ports, &excluded, &active_ignored)?;
                        let known_bridge = ports
                            .iter()
                            .find(|info| ports_match(&info.port_name, &selected))
                            .is_some_and(is_esp32_usb_bridge);
                        Some((selected, known_bridge))
                    });
                    match found {
                        Some((selected, known_bridge)) => (Some(selected), true, known_bridge),
                        None => (None, true, false),
                    }
                };

            if let Some(port) = chosen_port {
                app_state
                    .mag_control
                    .set_claimed_port(Some(port.clone()))
                    .await;
                tracing::info!(port = %port, baud, "Connecting to ESP32 magnetometer serial port");

                let exit = run_mag_serial_session(
                    port.clone(),
                    baud,
                    auto_detected,
                    is_known_esp_bridge,
                    app_state.clone(),
                )
                .await;

                app_state.mag_control.set_claimed_port(None).await;

                match exit {
                    SessionExit::NonMagProtocol => {
                        tracing::info!(
                            port = %port,
                            "Detected NMEA/UBX GNSS stream instead of magnetometer CSV — yielding port"
                        );
                        ignored_ports.insert(
                            normalize_port_name(&port),
                            Instant::now() + Duration::from_secs(30),
                        );
                        mark_mag_offline(
                            &app_state,
                            None,
                            Some("Serial port carries GNSS stream; waiting for magnetometer"),
                        )
                        .await;
                        continue;
                    }
                    SessionExit::NoDataOnAutoPort => {
                        tracing::info!(
                            port = %port,
                            "No magnetometer CSV seen on auto-detected fallback port — yielding port"
                        );
                        ignored_ports.insert(
                            normalize_port_name(&port),
                            Instant::now() + Duration::from_secs(30),
                        );
                        mark_mag_offline(
                            &app_state,
                            None,
                            Some("No magnetometer stream on auto-probed port; scanning other ports..."),
                        )
                        .await;
                        continue;
                    }
                    SessionExit::PortSwitchRequested => {
                        mark_mag_offline(&app_state, None, Some("Switching serial port...")).await;
                        continue;
                    }
                    SessionExit::Disconnected(msg) => {
                        tracing::warn!(port = %port, error = %msg, "Magnetometer serial disconnected");
                        mark_mag_offline(&app_state, Some(&port), Some(&msg)).await;
                    }
                }
            } else {
                let offline_msg = if cfg!(target_os = "windows") {
                    "No ESP32 magnetometer COM port detected (plug in USB or install Silicon Labs CP210x Windows VCP driver)"
                } else {
                    "No ESP32 magnetometer USB serial device detected"
                };
                mark_mag_offline(&app_state, None, Some(offline_msg)).await;
            }

            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(2)) => {}
                _ = app_state.mag_control.reconnect_notify.notified() => {}
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_mag_csv_header_err_and_non_mag() {
        assert_eq!(parse_mag_line("ms,mx,my,mz"), MagLine::Header);
        assert_eq!(
            parse_mag_line("12345,395,-333,554"),
            MagLine::Sample {
                ms: 12345,
                mx: 395,
                my: -333,
                mz: 554
            }
        );
        assert_eq!(
            parse_mag_line("ERR,i2c_read"),
            MagLine::SensorError("i2c_read".to_string())
        );
        assert_eq!(
            parse_mag_line("$GNGGA,085518.00,0956.473044,N,07616.618606,E,4,18,0.6,12.3,M,-91.2,M,,"),
            MagLine::NonMagProtocol
        );
        assert_eq!(parse_mag_line("ets Jul 29 2019 12:21:46"), MagLine::Ignore);
    }

    #[test]
    fn test_heading_cardinal_and_calibration() {
        let mut cal = MagnetometerCalibration::default();
        assert!((compute_heading_deg(400, 0, &cal) - 0.0).abs() < 1e-6);
        assert_eq!(cardinal_direction(0.0), "N");

        assert!((compute_heading_deg(0, 400, &cal) - 90.0).abs() < 1e-6);
        assert_eq!(cardinal_direction(90.0), "E");

        assert!((compute_heading_deg(-400, 0, &cal) - 180.0).abs() < 1e-6);
        assert_eq!(cardinal_direction(180.0), "S");

        assert!((compute_heading_deg(0, -400, &cal) - 270.0).abs() < 1e-6);
        assert_eq!(cardinal_direction(270.0), "W");
        assert_eq!(cardinal_direction(135.0), "SE");

        // Hard-iron offset removal: raw (100 + 0, 200 + 300) centered at (100, 200) -> East (90°)
        cal.offset_x = 100.0;
        cal.offset_y = 200.0;
        assert!((compute_heading_deg(100, 500, &cal) - 90.0).abs() < 1e-6);

        // Invert direction flips East (90°) to West (270°)
        cal.invert_direction = true;
        assert!((compute_heading_deg(100, 500, &cal) - 270.0).abs() < 1e-6);

        // Heading offset + declination
        cal.invert_direction = false;
        cal.heading_offset_deg = 10.0;
        cal.declination_deg = -2.5;
        assert!((compute_heading_deg(100, 500, &cal) - 97.5).abs() < 1e-6);
    }

    #[test]
    fn test_circular_smoothing_wraparound() {
        let mut filter = CircularHeadingFilter::new(0.25);
        let h1 = filter.update(358.0);
        assert!((h1 - 358.0).abs() < 1e-6);
        let h2 = filter.update(2.0);
        // Smoothed across 358° -> 2° must stay near North (0° / 359°), never ~180°
        assert!(h2 >= 357.0 || h2 <= 3.0, "Wraparound smoothing produced {h2}");
    }

    #[test]
    fn test_port_selection_prefers_cp2102_and_skips_ublox() {
        let ports = vec![
            SerialPortInfo {
                port_name: "/dev/ttyACM0".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: VID_UBLOX,
                    pid: 0x01a8,
                    serial_number: None,
                    manufacturer: None,
                    product: Some("u-blox GNSS receiver".to_string()),
                }),
            },
            SerialPortInfo {
                port_name: "/dev/ttyUSB0".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: VID_SILICON_LABS,
                    pid: 0xea60,
                    serial_number: None,
                    manufacturer: Some("Silicon Labs".to_string()),
                    product: Some("CP2102 USB to UART Bridge Controller".to_string()),
                }),
            },
        ];

        let ignored = HashSet::new();
        assert_eq!(
            select_magnetometer_port(&ports, &[], &ignored).as_deref(),
            Some("/dev/ttyUSB0")
        );

        // Even if only u-blox is connected, magnetometer must not claim it
        let only_ublox = vec![ports[0].clone()];
        assert_eq!(select_magnetometer_port(&only_ublox, &[], &ignored), None);
    }

    #[test]
    fn test_windows_port_normalization_and_sorting() {
        assert_eq!(windows_com_number("com4"), Some(4));
        assert_eq!(windows_com_number(r"\\.\COM12"), Some(12));
        assert_eq!(windows_com_number("/dev/ttyUSB0"), None);

        assert_eq!(normalize_port_name("com4"), "COM4");
        assert_eq!(normalize_port_name(r" \\.\com12 "), "COM12");
        assert_eq!(normalize_port_name(" /dev/ttyUSB0 "), "/dev/ttyUSB0");

        assert!(ports_match("com10", r"\\.\COM10"));
        assert!(!ports_match("COM3", "COM4"));

        let mut com_ports = ["COM10", "COM3", "COM4"];
        com_ports.sort_by_key(|p| port_sort_key(p));
        assert_eq!(com_ports, ["COM3", "COM4", "COM10"]);
    }

    #[test]
    fn test_windows_com_selection_cp2102_ublox_and_fallback() {
        let ports = vec![
            SerialPortInfo {
                port_name: "COM1".to_string(),
                port_type: SerialPortType::Unknown,
            },
            SerialPortInfo {
                port_name: "COM5".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: VID_UBLOX,
                    pid: 0x01a8,
                    serial_number: None,
                    manufacturer: Some("u-blox AG".to_string()),
                    product: Some("u-blox GNSS/GPS receiver (COM5)".to_string()),
                }),
            },
            SerialPortInfo {
                port_name: "COM10".to_string(),
                port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                    vid: VID_SILICON_LABS,
                    pid: 0xea60,
                    serial_number: None,
                    manufacturer: Some("Silicon Labs".to_string()),
                    product: Some("Silicon Labs CP210x USB to UART Bridge (COM10)".to_string()),
                }),
            },
        ];

        let ignored = HashSet::new();
        assert_eq!(
            select_magnetometer_port(&ports, &[], &ignored).as_deref(),
            Some("COM10")
        );

        // Case-insensitive exclusion blocks COM10, leaving COM1 fallback (skipping u-blox COM5)
        assert_eq!(
            select_magnetometer_port(&ports, &["com10".to_string()], &ignored).as_deref(),
            Some("COM1")
        );

        // Fallback prefers COM3+ over legacy motherboard COM1 and sorts COM3 before COM10
        let fallback_ports = vec![
            SerialPortInfo {
                port_name: "COM1".to_string(),
                port_type: SerialPortType::Unknown,
            },
            SerialPortInfo {
                port_name: "COM10".to_string(),
                port_type: SerialPortType::Unknown,
            },
            SerialPortInfo {
                port_name: "COM3".to_string(),
                port_type: SerialPortType::Unknown,
            },
        ];
        assert_eq!(
            select_magnetometer_port(&fallback_ports, &[], &ignored).as_deref(),
            Some("COM3")
        );

        // Windows FriendlyName matching even with non-standard VID
        let friendly_ports = vec![SerialPortInfo {
            port_name: "COM7".to_string(),
            port_type: SerialPortType::UsbPort(serialport::UsbPortInfo {
                vid: 0x1234,
                pid: 0x5678,
                serial_number: None,
                manufacturer: Some("Silicon Laboratories".to_string()),
                product: Some("Silicon Labs CP210x USB to UART Bridge (COM7)".to_string()),
            }),
        }];
        assert_eq!(
            select_magnetometer_port(&friendly_ports, &[], &ignored).as_deref(),
            Some("COM7")
        );
    }

    #[test]
    fn test_format_serial_open_error_windows_vs_linux() {
        let win_msg = format_serial_open_error(
            "COM4",
            serialport::ErrorKind::NoDevice,
            "Access is denied.",
            true,
            false,
        );
        assert!(win_msg.contains("in use or access denied"));
        assert!(win_msg.contains("COM4"));

        let linux_msg = format_serial_open_error(
            "/dev/ttyUSB0",
            serialport::ErrorKind::Io(std::io::ErrorKind::PermissionDenied),
            "Permission denied",
            false,
            true,
        );
        assert!(linux_msg.contains("dialout"));
    }
}
