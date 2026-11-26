use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::Path;
use zoid_core::{Result, ZoidError};

pub const ARCHIVE_FORMAT_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArchiveManifest {
    pub format_version: u32,
    pub mission_id: i64,
    pub display_id: Option<i64>,
    pub exported_at_ms: i64,
    pub origin_node: String,
    pub group_count: usize,
    pub fod_count: usize,
    pub cleared_count: usize,
    pub action_count: usize,
    pub frame_count: usize,
    pub frame_bytes: u64,
    pub bundle_sha256: String,
}

#[derive(Debug, Clone)]
pub struct MissionArchiveBundle {
    pub manifest: ArchiveManifest,
    pub mission_json: Vec<u8>,
    pub fod_groups_json: Vec<u8>,
    pub fods_json: Vec<u8>,
    pub cleared_fods_json: Vec<u8>,
    pub group_actions_json: Vec<u8>,
    /// Map of lowercase 64-char sha256 hex -> JPEG bytes.
    pub frames: BTreeMap<String, Vec<u8>>,
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

pub fn compute_bundle_sha256(
    mission_json: &[u8],
    fod_groups_json: &[u8],
    fods_json: &[u8],
    cleared_fods_json: &[u8],
    group_actions_json: &[u8],
    frames: &BTreeMap<String, Vec<u8>>,
) -> String {
    let mut h = Sha256::new();
    for part in [
        mission_json,
        fod_groups_json,
        fods_json,
        cleared_fods_json,
        group_actions_json,
    ] {
        h.update((part.len() as u64).to_le_bytes());
        h.update(part);
    }
    for (sha, bytes) in frames {
        h.update(sha.as_bytes());
        h.update((bytes.len() as u64).to_le_bytes());
        h.update(bytes);
    }
    format!("{:x}", h.finalize())
}

fn write_tar_entry<W: Write>(out: &mut W, name: &str, data: &[u8]) -> std::io::Result<()> {
    let mut header = [0u8; 512];
    let name_bytes = name.as_bytes();
    if name_bytes.len() <= 100 {
        header[..name_bytes.len()].copy_from_slice(name_bytes);
    } else if let Some(slash) = name.rfind('/') {
        let (prefix, rest) = name.split_at(slash);
        let rest = &rest[1..];
        if prefix.len() > 155 || rest.len() > 100 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidInput,
                format!("TAR path too long: {name}"),
            ));
        }
        header[..rest.len()].copy_from_slice(rest.as_bytes());
        header[345..345 + prefix.len()].copy_from_slice(prefix.as_bytes());
    } else {
        return Err(std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            format!("TAR path too long: {name}"),
        ));
    }

    // Mode 0644, uid 0, gid 0
    header[100..108].copy_from_slice(b"0000644\0");
    header[108..116].copy_from_slice(b"0000000\0");
    header[116..124].copy_from_slice(b"0000000\0");

    // Size in octal (11 digits + NUL)
    let size_str = format!("{:011o}\0", data.len());
    header[124..136].copy_from_slice(size_str.as_bytes());

    // Mtime
    let mtime = chrono::Utc::now().timestamp().max(0) as u64;
    let mtime_str = format!("{:011o}\0", mtime);
    header[136..148].copy_from_slice(mtime_str.as_bytes());

    // Checksum field filled with spaces initially
    header[148..156].copy_from_slice(b"        ");
    // Typeflag '0' (regular file)
    header[156] = b'0';
    // USTAR magic + version
    header[257..263].copy_from_slice(b"ustar\0");
    header[263..265].copy_from_slice(b"00");

    let csum: u32 = header.iter().map(|&b| b as u32).sum();
    let csum_str = format!("{:06o}\0 ", csum);
    header[148..156].copy_from_slice(csum_str.as_bytes());

    out.write_all(&header)?;
    out.write_all(data)?;
    let rem = data.len() % 512;
    if rem != 0 {
        let pad = [0u8; 512];
        out.write_all(&pad[..512 - rem])?;
    }
    Ok(())
}

/// Encodes a `MissionArchiveBundle` into standard gzip-compressed POSIX USTAR TAR bytes (`.zoidpack`).
pub fn encode_archive_bytes(bundle: &MissionArchiveBundle) -> Result<Vec<u8>> {
    let root = match bundle.manifest.display_id {
        Some(did) => format!("mission-{}-d{}", bundle.manifest.mission_id, did),
        None => format!("mission-{}", bundle.manifest.mission_id),
    };

    let manifest_bytes = serde_json::to_vec_pretty(&bundle.manifest)
        .map_err(|e| ZoidError::Storage(format!("Failed to serialize manifest: {e}")))?;

    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    write_tar_entry(&mut encoder, &format!("{root}/manifest.json"), &manifest_bytes)
        .map_err(|e| ZoidError::Storage(e.to_string()))?;
    write_tar_entry(&mut encoder, &format!("{root}/mission.json"), &bundle.mission_json)
        .map_err(|e| ZoidError::Storage(e.to_string()))?;
    write_tar_entry(&mut encoder, &format!("{root}/fod_groups.json"), &bundle.fod_groups_json)
        .map_err(|e| ZoidError::Storage(e.to_string()))?;
    write_tar_entry(&mut encoder, &format!("{root}/fods.json"), &bundle.fods_json)
        .map_err(|e| ZoidError::Storage(e.to_string()))?;
    write_tar_entry(&mut encoder, &format!("{root}/cleared_fods.json"), &bundle.cleared_fods_json)
        .map_err(|e| ZoidError::Storage(e.to_string()))?;
    write_tar_entry(&mut encoder, &format!("{root}/group_actions.json"), &bundle.group_actions_json)
        .map_err(|e| ZoidError::Storage(e.to_string()))?;

    for (sha, bytes) in &bundle.frames {
        let actual = sha256_hex(bytes);
        if actual != *sha {
            return Err(ZoidError::Storage(format!(
                "Frame SHA mismatch while packing archive: expected {sha}, got {actual}"
            )));
        }
        write_tar_entry(&mut encoder, &format!("{root}/frames/{sha}.jpg"), bytes)
            .map_err(|e| ZoidError::Storage(e.to_string()))?;
    }

    // Two 512-byte zero blocks terminate a TAR stream.
    encoder
        .write_all(&[0u8; 1024])
        .map_err(|e| ZoidError::Storage(e.to_string()))?;

    encoder
        .finish()
        .map_err(|e| ZoidError::Storage(format!("Failed to finalize gzip stream: {e}")))
}

/// Writes a `MissionArchiveBundle` atomically to `dest_path` and returns `(size_bytes, sha256)`.
pub async fn write_archive_file(dest_path: &Path, bundle: MissionArchiveBundle) -> Result<(u64, String)> {
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| ZoidError::Storage(format!("Failed to create archive dir: {e}")))?;
    }
    let tmp_path = dest_path.with_extension("zoidpack.tmp");
    let dest_owned = dest_path.to_path_buf();
    let tmp_owned = tmp_path.clone();

    let (bytes, sha) = tokio::task::spawn_blocking(move || -> Result<(Vec<u8>, String)> {
        let encoded = encode_archive_bytes(&bundle)?;
        let sha = sha256_hex(&encoded);
        Ok((encoded, sha))
    })
    .await
    .map_err(|e| ZoidError::Storage(e.to_string()))??;

    let size_bytes = bytes.len() as u64;
    tokio::fs::write(&tmp_owned, &bytes)
        .await
        .map_err(|e| ZoidError::Storage(format!("Failed to write temp archive: {e}")))?;
    tokio::fs::rename(&tmp_owned, &dest_owned)
        .await
        .map_err(|e| ZoidError::Storage(format!("Failed to rename archive file: {e}")))?;

    Ok((size_bytes, sha))
}

fn parse_octal(field: &[u8]) -> Result<usize> {
    let s = std::str::from_utf8(field)
        .map_err(|_| ZoidError::Storage("Invalid UTF-8 in TAR header".to_string()))?
        .trim_matches(|c: char| c == '\0' || c == ' ');
    if s.is_empty() {
        return Ok(0);
    }
    usize::from_str_radix(s, 8)
        .map_err(|e| ZoidError::Storage(format!("Invalid TAR octal '{s}': {e}")))
}

fn read_tar_str(field: &[u8]) -> String {
    let end = field.iter().position(|&b| b == 0).unwrap_or(field.len());
    String::from_utf8_lossy(&field[..end]).to_string()
}

/// Decodes and checksum-verifies a `.zoidpack` (`.tar.gz`) byte slice.
pub fn decode_archive_bytes(raw_gz: &[u8]) -> Result<MissionArchiveBundle> {
    let mut decoder = GzDecoder::new(raw_gz);
    let mut tar_bytes = Vec::new();
    decoder
        .read_to_end(&mut tar_bytes)
        .map_err(|e| ZoidError::Storage(format!("Failed to decompress archive: {e}")))?;

    let mut manifest: Option<ArchiveManifest> = None;
    let mut mission_json: Option<Vec<u8>> = None;
    let mut fod_groups_json: Option<Vec<u8>> = None;
    let mut fods_json: Option<Vec<u8>> = None;
    let mut cleared_fods_json: Option<Vec<u8>> = None;
    let mut group_actions_json: Option<Vec<u8>> = None;
    let mut frames: BTreeMap<String, Vec<u8>> = BTreeMap::new();

    let mut offset = 0usize;
    while offset + 512 <= tar_bytes.len() {
        let header = &tar_bytes[offset..offset + 512];
        offset += 512;

        if header.iter().all(|&b| b == 0) {
            break;
        }

        let name_part = read_tar_str(&header[0..100]);
        let prefix_part = read_tar_str(&header[345..500]);
        let full_name = if prefix_part.is_empty() {
            name_part
        } else {
            format!("{prefix_part}/{name_part}")
        };
        let size = parse_octal(&header[124..136])?;
        let typeflag = header[156];

        if offset + size > tar_bytes.len() {
            return Err(ZoidError::Storage(format!(
                "Truncated TAR entry '{full_name}'"
            )));
        }
        let payload = tar_bytes[offset..offset + size].to_vec();
        let padded = ((size + 511) / 512) * 512;
        offset = (offset + padded).min(tar_bytes.len());

        // Skip directory entries
        if typeflag == b'5' || full_name.ends_with('/') {
            continue;
        }

        if full_name.ends_with("/manifest.json") || full_name == "manifest.json" {
            let m: ArchiveManifest = serde_json::from_slice(&payload)
                .map_err(|e| ZoidError::Storage(format!("Corrupt manifest.json: {e}")))?;
            manifest = Some(m);
        } else if full_name.ends_with("/mission.json") || full_name == "mission.json" {
            mission_json = Some(payload);
        } else if full_name.ends_with("/fod_groups.json") || full_name == "fod_groups.json" {
            fod_groups_json = Some(payload);
        } else if full_name.ends_with("/fods.json") || full_name == "fods.json" {
            fods_json = Some(payload);
        } else if full_name.ends_with("/cleared_fods.json") || full_name == "cleared_fods.json" {
            cleared_fods_json = Some(payload);
        } else if full_name.ends_with("/group_actions.json") || full_name == "group_actions.json" {
            group_actions_json = Some(payload);
        } else if let Some(fname) = full_name.rsplit('/').next() {
            if full_name.contains("/frames/") && fname.ends_with(".jpg") {
                let sha = fname.trim_end_matches(".jpg").to_string();
                let actual = sha256_hex(&payload);
                if actual != sha {
                    return Err(ZoidError::Storage(format!(
                        "Frame checksum mismatch for {fname}: expected {sha}, got {actual}"
                    )));
                }
                frames.insert(sha, payload);
            }
        }
    }

    let manifest = manifest
        .ok_or_else(|| ZoidError::Storage("Archive missing manifest.json".to_string()))?;
    let mission_json = mission_json
        .ok_or_else(|| ZoidError::Storage("Archive missing mission.json".to_string()))?;
    let fod_groups_json = fod_groups_json.unwrap_or_else(|| b"[]".to_vec());
    let fods_json = fods_json.unwrap_or_else(|| b"[]".to_vec());
    let cleared_fods_json = cleared_fods_json.unwrap_or_else(|| b"[]".to_vec());
    let group_actions_json = group_actions_json.unwrap_or_else(|| b"[]".to_vec());

    let computed = compute_bundle_sha256(
        &mission_json,
        &fod_groups_json,
        &fods_json,
        &cleared_fods_json,
        &group_actions_json,
        &frames,
    );
    if !manifest.bundle_sha256.is_empty() && computed != manifest.bundle_sha256 {
        return Err(ZoidError::Storage(format!(
            "Archive bundle checksum mismatch: expected {}, got {}",
            manifest.bundle_sha256, computed
        )));
    }

    Ok(MissionArchiveBundle {
        manifest,
        mission_json,
        fod_groups_json,
        fods_json,
        cleared_fods_json,
        group_actions_json,
        frames,
    })
}

pub async fn read_archive_file(src_path: &Path) -> Result<MissionArchiveBundle> {
    let raw = tokio::fs::read(src_path)
        .await
        .map_err(|e| ZoidError::Storage(format!("Failed to read archive {}: {e}", src_path.display())))?;
    tokio::task::spawn_blocking(move || decode_archive_bytes(&raw))
        .await
        .map_err(|e| ZoidError::Storage(e.to_string()))?
}
