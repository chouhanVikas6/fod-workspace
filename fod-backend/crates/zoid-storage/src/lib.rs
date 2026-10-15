use sha2::{Digest, Sha256};
use std::path::PathBuf;
use tokio::fs;
use zoid_core::{Result, ZoidError};

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

    /// Saves a frame JPEG asynchronously: writes full frame, generates thumbnail, and returns SHA-256.
    pub async fn save_frame(&self, jpeg_bytes: &[u8]) -> Result<String> {
        let sha256 = Self::compute_sha256(jpeg_bytes);
        let target_path = self.frame_path(&sha256);
        let thumb_target = self.thumb_path(&sha256);

        if target_path.exists() {
            return Ok(sha256);
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).await.map_err(|e| ZoidError::Storage(e.to_string()))?;
        }
        if let Some(parent) = thumb_target.parent() {
            fs::create_dir_all(parent).await.map_err(|e| ZoidError::Storage(e.to_string()))?;
        }

        // Write full image
        fs::write(&target_path, jpeg_bytes).await.map_err(|e| ZoidError::Storage(e.to_string()))?;

        // Generate and write thumbnail in blocking thread
        let bytes_vec = jpeg_bytes.to_vec();
        let thumb_path_clone = thumb_target.clone();
        tokio::task::spawn_blocking(move || {
            if let Ok(img) = image::load_from_memory(&bytes_vec) {
                let thumb = img.thumbnail(320, 320);
                let _ = thumb.save(thumb_path_clone);
            }
        }).await.map_err(|e| ZoidError::Storage(e.to_string()))?;

        Ok(sha256)
    }

    /// Reads frame bytes. If thumbnail is true, reads thumbnail; falls back to full frame if missing.
    pub async fn read_frame(&self, sha256: &str, thumbnail: bool) -> Result<Vec<u8>> {
        let path = if thumbnail {
            let t = self.thumb_path(sha256);
            if t.exists() { t } else { self.frame_path(sha256) }
        } else {
            self.frame_path(sha256)
        };

        if !path.exists() {
            return Err(ZoidError::NotFound(format!("Frame {} not found", sha256)));
        }

        fs::read(path).await.map_err(|e| ZoidError::Storage(e.to_string()))
    }
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
}
