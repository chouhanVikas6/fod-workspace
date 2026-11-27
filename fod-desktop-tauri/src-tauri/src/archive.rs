//! Portable `.zoidpack` (standard POSIX USTAR `.tar.gz`) archive codec & disk helpers
//! for the Desktop/Tablet application. Compatible with `zoid-storage::archive`.

use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

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
    pub frames: BTreeMap<String, Vec<u8>>,
}

pub fn sha256_hex(bytes: &[u8]) -> String {
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

    header[100..108].copy_from_slice(b"0000644\0");
    header[108..116].copy_from_slice(b"0000000\0");
    header[116..124].copy_from_slice(b"0000000\0");

    let size_str = format!("{:011o}\0", data.len());
    header[124..136].copy_from_slice(size_str.as_bytes());

    let mtime = chrono::Utc::now().timestamp().max(0) as u64;
    let mtime_str = format!("{:011o}\0", mtime);
    header[136..148].copy_from_slice(mtime_str.as_bytes());

    header[148..156].copy_from_slice(b"        ");
    header[156] = b'0';
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

pub fn encode_archive_bytes(bundle: &MissionArchiveBundle) -> anyhow::Result<Vec<u8>> {
    let root = match bundle.manifest.display_id {
        Some(did) => format!("mission-{}-d{}", bundle.manifest.mission_id, did),
        None => format!("mission-{}", bundle.manifest.mission_id),
    };

    let manifest_bytes = serde_json::to_vec_pretty(&bundle.manifest)?;
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    write_tar_entry(&mut encoder, &format!("{root}/manifest.json"), &manifest_bytes)?;
    write_tar_entry(&mut encoder, &format!("{root}/mission.json"), &bundle.mission_json)?;
    write_tar_entry(&mut encoder, &format!("{root}/fod_groups.json"), &bundle.fod_groups_json)?;
    write_tar_entry(&mut encoder, &format!("{root}/fods.json"), &bundle.fods_json)?;
    write_tar_entry(&mut encoder, &format!("{root}/cleared_fods.json"), &bundle.cleared_fods_json)?;
    write_tar_entry(&mut encoder, &format!("{root}/group_actions.json"), &bundle.group_actions_json)?;

    for (sha, bytes) in &bundle.frames {
        let actual = sha256_hex(bytes);
        if actual != *sha {
            anyhow::bail!("Frame SHA mismatch while packing archive: expected {sha}, got {actual}");
        }
        write_tar_entry(&mut encoder, &format!("{root}/frames/{sha}.jpg"), bytes)?;
    }

    encoder.write_all(&[0u8; 1024])?;
    Ok(encoder.finish()?)
}

fn parse_octal(field: &[u8]) -> anyhow::Result<usize> {
    let s = std::str::from_utf8(field)?
        .trim_matches(|c: char| c == '\0' || c == ' ');
    if s.is_empty() {
        return Ok(0);
    }
    Ok(usize::from_str_radix(s, 8)?)
}

fn read_tar_str(field: &[u8]) -> String {
    let end = field.iter().position(|&b| b == 0).unwrap_or(field.len());
    String::from_utf8_lossy(&field[..end]).to_string()
}

pub fn decode_archive_bytes(raw_gz: &[u8]) -> anyhow::Result<MissionArchiveBundle> {
    let mut decoder = GzDecoder::new(raw_gz);
    let mut tar_bytes = Vec::new();
    decoder.read_to_end(&mut tar_bytes)?;

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
            anyhow::bail!("Truncated TAR entry '{full_name}'");
        }
        let payload = tar_bytes[offset..offset + size].to_vec();
        let padded = ((size + 511) / 512) * 512;
        offset = (offset + padded).min(tar_bytes.len());

        if typeflag == b'5' || full_name.ends_with('/') {
            continue;
        }

        if full_name.ends_with("/manifest.json") || full_name == "manifest.json" {
            manifest = Some(serde_json::from_slice(&payload)?);
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
                    anyhow::bail!("Frame checksum mismatch for {fname}: expected {sha}, got {actual}");
                }
                frames.insert(sha, payload);
            }
        }
    }

    let manifest = manifest.ok_or_else(|| anyhow::anyhow!("Archive missing manifest.json"))?;
    let mission_json = mission_json.ok_or_else(|| anyhow::anyhow!("Archive missing mission.json"))?;
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
        anyhow::bail!(
            "Archive bundle checksum mismatch: expected {}, got {}",
            manifest.bundle_sha256,
            computed
        );
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

pub async fn dir_size_bytes(dir: &Path) -> u64 {
    let root = dir.to_path_buf();
    tokio::task::spawn_blocking(move || dir_size_sync(&root))
        .await
        .unwrap_or(0)
}

fn dir_size_sync(path: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    let mut total = 0u64;
    for entry in entries.flatten() {
        let p = entry.path();
        if let Ok(meta) = entry.metadata() {
            if meta.is_dir() {
                total += dir_size_sync(&p);
            } else if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total
}

pub async fn disk_usage_for_path(path: &Path) -> (u64, u64, u64, f64) {
    #[cfg(unix)]
    {
        let probe = if path.exists() {
            path.to_path_buf()
        } else {
            PathBuf::from(".")
        };
        if let Ok(Ok(out)) = tokio::task::spawn_blocking(move || {
            std::process::Command::new("df")
                .args(["-B1", "-P"])
                .arg(&probe)
                .output()
        })
        .await
        {
            if let Ok(stdout) = String::from_utf8(out.stdout) {
                if let Some(line) = stdout.lines().nth(1) {
                    let cols: Vec<&str> = line.split_whitespace().collect();
                    if cols.len() >= 5 {
                        let total = cols[1].parse::<u64>().unwrap_or(0);
                        let used = cols[2].parse::<u64>().unwrap_or(0);
                        let free = cols[3].parse::<u64>().unwrap_or(0);
                        let pct = if total > 0 {
                            (used as f64 / total as f64) * 100.0
                        } else {
                            cols[4].trim_end_matches('%').parse::<f64>().unwrap_or(0.0)
                        };
                        return (total, used, free, (pct * 10.0).round() / 10.0);
                    }
                }
            }
        }
    }
    (0, 0, 0, 0.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn desktop_zoidpack_roundtrip_and_checksum_verification() {
        let img = b"\xff\xd8\xff\xe0desktop_test_jpeg_payload";
        let sha = sha256_hex(img);
        let mut frames = BTreeMap::new();
        frames.insert(sha.clone(), img.to_vec());

        let mission_json = br#"{"id":101,"display_id":5}"#.to_vec();
        let fod_groups_json = br#"[]"#.to_vec();
        let fods_json = br#"[]"#.to_vec();
        let cleared_fods_json = br#"[]"#.to_vec();
        let group_actions_json = br#"[]"#.to_vec();
        let bundle_sha256 = compute_bundle_sha256(
            &mission_json,
            &fod_groups_json,
            &fods_json,
            &cleared_fods_json,
            &group_actions_json,
            &frames,
        );

        let bundle = MissionArchiveBundle {
            manifest: ArchiveManifest {
                format_version: ARCHIVE_FORMAT_VERSION,
                mission_id: 101,
                display_id: Some(5),
                exported_at_ms: 1700000000000,
                origin_node: "desktop-test".to_string(),
                group_count: 0,
                fod_count: 0,
                cleared_count: 0,
                action_count: 0,
                frame_count: 1,
                frame_bytes: img.len() as u64,
                bundle_sha256,
            },
            mission_json,
            fod_groups_json,
            fods_json,
            cleared_fods_json,
            group_actions_json,
            frames,
        };

        let mut encoded = encode_archive_bytes(&bundle).unwrap();
        let decoded = decode_archive_bytes(&encoded).unwrap();
        assert_eq!(decoded.manifest.mission_id, 101);
        assert_eq!(decoded.frames.get(&sha).unwrap(), img);

        // Corrupting encoded bytes must fail checksum verification
        let idx = encoded.len() - 4;
        encoded[idx] ^= 0xff;
        assert!(decode_archive_bytes(&encoded).is_err());
    }
}
