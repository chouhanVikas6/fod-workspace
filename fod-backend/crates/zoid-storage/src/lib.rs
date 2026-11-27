pub mod archive;

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tokio::fs;
use tokio::sync::Semaphore;
use zoid_core::{Result, ZoidError};

/// Bound background thumbnail generation so 500+ det/s bursts never saturate CPU cores
/// or block the Tokio worker / blocking thread pools.
fn thumb_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(2))
}

#[derive(Clone, Debug)]
pub struct StorageConfig {
    pub base_dir: PathBuf,
}

impl Default for StorageConfig {
    fn default() -> Self {
        Self {
            base_dir: PathBuf::from("./data/frames"),
        }
    }
}

#[derive(Clone, Debug)]
pub struct FrameStorage {
    config: StorageConfig,
}

impl FrameStorage {
    pub fn new(config: StorageConfig) -> Self {
        Self { config }
    }

    /// Computes the SHA-256 hex string of the given bytes.
    pub fn compute_sha256(bytes: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(bytes);
        format!("{:x}", hasher.finalize())
    }

    /// Returns the path where the full frame is stored.
    pub fn frame_path(&self, sha256: &str) -> PathBuf {
        let prefix = if sha256.len() >= 2 { &sha256[0..2] } else { "xx" };
        self.config.base_dir.join(prefix).join(format!("{}.jpg", sha256))
    }

    /// Returns the path where the thumbnail is stored.
    pub fn thumb_path(&self, sha256: &str) -> PathBuf {
        let prefix = if sha256.len() >= 2 { &sha256[0..2] } else { "xx" };
        self.config.base_dir.join(prefix).join("thumb").join(format!("{}.jpg", sha256))
    }

    /// Saves a frame JPEG asynchronously: writes full frame, schedules non-blocking thumbnail generation, and returns SHA-256.
    pub async fn save_frame(&self, jpeg_bytes: &[u8]) -> Result<String> {
        let sha256 = Self::compute_sha256(jpeg_bytes);
        let target_path = self.frame_path(&sha256);
        let thumb_target = self.thumb_path(&sha256);

        if fs::try_exists(&target_path).await.unwrap_or(false) {
            return Ok(sha256);
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| ZoidError::Storage(e.to_string()))?;
        }

        // Write full image
        fs::write(&target_path, jpeg_bytes).await.map_err(|e| ZoidError::Storage(e.to_string()))?;

        // Best-effort non-blocking thumbnail generation: if the bounded semaphore is busy
        // under heavy load (500+ det/s), skip eager thumbnailing — read_frame falls back
        // seamlessly to the full crop JPEG.
        if let Ok(permit) = thumb_semaphore().try_acquire() {
            let bytes_vec = jpeg_bytes.to_vec();
            let thumb_path_clone = thumb_target.clone();
            tokio::spawn(async move {
                let _permit = permit;
                if let Some(parent) = thumb_path_clone.parent() {
                    let _ = fs::create_dir_all(parent).await;
                }
                let _ = tokio::task::spawn_blocking(move || {
                    if let Ok(img) = image::load_from_memory(&bytes_vec) {
                        let thumb = img.thumbnail(320, 320);
                        let _ = thumb.save(thumb_path_clone);
                    }
                })
                .await;
            });
        }

        Ok(sha256)
    }

    /// Reads frame bytes. If thumbnail is true, reads thumbnail; falls back to full frame if missing.
    pub async fn read_frame(&self, sha256: &str, thumbnail: bool) -> Result<Vec<u8>> {
        let path = if thumbnail {
            let t = self.thumb_path(sha256);
            if fs::try_exists(&t).await.unwrap_or(false) {
                t
            } else {
                self.frame_path(sha256)
            }
        } else {
            self.frame_path(sha256)
        };

        if !fs::try_exists(&path).await.unwrap_or(false) {
            return Err(ZoidError::NotFound(format!("Frame {} not found", sha256)));
        }

        fs::read(path).await.map_err(|e| ZoidError::Storage(e.to_string()))
    }

    pub fn base_dir(&self) -> &Path {
        &self.config.base_dir
    }

    /// Deletes a frame JPEG and its thumbnail from disk if present. Returns total bytes freed.
    pub async fn delete_frame(&self, sha256: &str) -> Result<u64> {
        let mut freed = 0u64;
        for path in [self.frame_path(sha256), self.thumb_path(sha256)] {
            if let Ok(meta) = fs::metadata(&path).await {
                if fs::remove_file(&path).await.is_ok() {
                    freed += meta.len();
                }
            }
        }
        Ok(freed)
    }

    /// Deletes a batch of unreferenced SHA-256 frames and returns `(bytes_freed, files_removed)`.
    pub async fn delete_frames(&self, shas: &[String]) -> (u64, usize) {
        let mut freed = 0u64;
        let mut removed = 0usize;
        for sha in shas {
            if sha.is_empty() {
                continue;
            }
            let frame = self.frame_path(sha);
            let thumb = self.thumb_path(sha);
            let mut any = false;
            for path in [frame, thumb] {
                if let Ok(meta) = fs::metadata(&path).await {
                    if fs::remove_file(&path).await.is_ok() {
                        freed += meta.len();
                        any = true;
                    }
                }
            }
            if any {
                removed += 1;
            }
        }
        (freed, removed)
    }

    /// Returns size in bytes of the full frame if it exists locally.
    pub async fn frame_size_bytes(&self, sha256: &str) -> u64 {
        if sha256.is_empty() {
            return 0;
        }
        let mut total = 0u64;
        for path in [self.frame_path(sha256), self.thumb_path(sha256)] {
            if let Ok(meta) = fs::metadata(&path).await {
                total += meta.len();
            }
        }
        total
    }
}

/// Recursively sums file sizes in `dir` (returns 0 if missing).
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

/// Returns `(total_bytes, used_bytes, free_bytes, usage_percent)` for the filesystem holding `path`.
pub async fn disk_usage_for_path(path: &Path) -> (u64, u64, u64, f64) {
    #[cfg(unix)]
    {
        let probe = if path.exists() {
            path.to_path_buf()
        } else {
            PathBuf::from("/")
        };
        if let Ok(out) = tokio::process::Command::new("df")
            .args(["-B1", "-P"])
            .arg(&probe)
            .output()
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

    #[tokio::test]
    async fn test_compute_sha256() {
        let data = b"hello zoid fod";
        let hash = FrameStorage::compute_sha256(data);
        assert_eq!(hash.len(), 64);
        assert_eq!(hash, FrameStorage::compute_sha256(data));
    }

    #[tokio::test]
    async fn test_save_and_read_frame() {
        let temp_dir = std::env::temp_dir().join(format!("zoid_storage_test_{}", uuid::Uuid::new_v4()));
        let storage = FrameStorage::new(StorageConfig {
            base_dir: temp_dir.clone(),
        });

        let test_payload = b"dummy_jpeg_bytes_12345678";
        let hash = storage.save_frame(test_payload).await.unwrap();
        assert_eq!(hash.len(), 64);

        let read_bytes = storage.read_frame(&hash, false).await.unwrap();
        assert_eq!(read_bytes, test_payload);

        // Clean up
        let _ = tokio::fs::remove_dir_all(temp_dir).await;
    }

    #[tokio::test]
    async fn test_delete_frame_and_archive_roundtrip() {
        use crate::archive::{
            compute_bundle_sha256, decode_archive_bytes, encode_archive_bytes, ArchiveManifest,
            MissionArchiveBundle, ARCHIVE_FORMAT_VERSION,
        };
        use std::collections::BTreeMap;

        let temp_dir = std::env::temp_dir().join(format!("zoid_arch_test_{}", uuid::Uuid::new_v4()));
        let storage = FrameStorage::new(StorageConfig {
            base_dir: temp_dir.clone(),
        });

        let jpeg = b"\xff\xd8\xff\xe0dummy_jpeg_payload_001";
        let sha = storage.save_frame(jpeg).await.unwrap();
        assert!(storage.frame_size_bytes(&sha).await >= jpeg.len() as u64);

        let mut frames = BTreeMap::new();
        frames.insert(sha.clone(), jpeg.to_vec());
        let mission_json = br#"{"id":42,"display_id":7}"#.to_vec();
        let fod_groups_json = br#"[{"group_id":1}]"#.to_vec();
        let fods_json = br#"[{"id":"f1"}]"#.to_vec();
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
                mission_id: 42,
                display_id: Some(7),
                exported_at_ms: 1700000000000,
                origin_node: "atc-test".to_string(),
                group_count: 1,
                fod_count: 1,
                cleared_count: 0,
                action_count: 0,
                frame_count: 1,
                frame_bytes: jpeg.len() as u64,
                bundle_sha256,
            },
            mission_json,
            fod_groups_json,
            fods_json,
            cleared_fods_json,
            group_actions_json,
            frames,
        };

        let archive_path = temp_dir.join("mission-42.zoidpack");
        let (size, file_sha) = archive::write_archive_file(&archive_path, bundle).await.unwrap();
        assert!(size > 0);
        assert_eq!(file_sha.len(), 64);

        let decoded = archive::read_archive_file(&archive_path).await.unwrap();
        assert_eq!(decoded.manifest.mission_id, 42);
        assert_eq!(decoded.frames.get(&sha).unwrap(), jpeg);

        // Corrupting the encoded stream must fail checksum verification
        let mut raw = encode_archive_bytes(&decoded).unwrap();
        let last = raw.len() - 5;
        raw[last] ^= 0xff;
        assert!(decode_archive_bytes(&raw).is_err());

        // Delete frame should free >= jpeg.len()
        let (freed, count) = storage.delete_frames(&[sha.clone()]).await;
        assert_eq!(count, 1);
        assert!(freed >= jpeg.len() as u64);
        assert!(storage.read_frame(&sha, false).await.is_err());

        let _ = tokio::fs::remove_dir_all(temp_dir).await;
    }
}
