use crate::models::ImageFolderItem;
use image::{imageops::FilterType, DynamicImage, ImageBuffer, ImageFormat, Rgb};
use sha2::{Digest, Sha256};
use std::io::Cursor;
use std::path::Path;
use std::sync::{Arc, RwLock};

#[derive(Clone)]
pub struct ImageFeeder {
    folder_path: Arc<RwLock<Option<String>>>,
    indexed_files: Arc<RwLock<Vec<String>>>,
}

impl ImageFeeder {
    pub fn new() -> Self {
        Self {
            folder_path: Arc::new(RwLock::new(None)),
            indexed_files: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub fn scan_folder(&self, dir_path: &str) -> Result<Vec<ImageFolderItem>, String> {
        let path = Path::new(dir_path);
        if !path.exists() || !path.is_dir() {
            return Err(format!("Directory does not exist: {}", dir_path));
        }

        let mut raw_files = Vec::new();
        Self::collect_image_files(path, &mut raw_files);
        raw_files.sort();

        let mut file_paths = Vec::new();
        let mut items = Vec::new();

        for p in raw_files {
            let filename = p
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("unknown")
                .to_string();

            let size_bytes = p.metadata().map(|m| m.len()).unwrap_or(0);
            let full_path = p.to_string_lossy().to_string();

            // Generate small thumbnail base64 for first 30 images to keep IPC light
            let thumbnail_base64 = if items.len() < 30 {
                Self::create_thumbnail_base64(&p).unwrap_or_default()
            } else {
                String::new()
            };

            items.push(ImageFolderItem {
                path: full_path.clone(),
                filename,
                size_bytes,
                thumbnail_base64,
            });

            file_paths.push(full_path);
        }

        *self.folder_path.write().unwrap() = Some(dir_path.to_string());
        *self.indexed_files.write().unwrap() = file_paths;

        Ok(items)
    }

    fn collect_image_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
        if let Ok(entries) = std::fs::read_dir(dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    Self::collect_image_files(&p, out);
                } else if p.is_file() {
                    let ext = p
                        .extension()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_lowercase();

                    if ext == "jpg" || ext == "jpeg" || ext == "png" {
                        out.push(p);
                    }
                }
            }
        }
    }

    pub fn get_sample_frame(
        &self,
        index: usize,
        corrupt: bool,
    ) -> (Vec<u8>, String) {
        if corrupt {
            let bad_bytes = b"CORRUPTED_JPEG_PAYLOAD_FOR_TESTING".to_vec();
            let mut hasher = Sha256::new();
            hasher.update(&bad_bytes);
            return (bad_bytes, format!("{:x}", hasher.finalize()));
        }

        let files = self.indexed_files.read().unwrap();
        if !files.is_empty() {
            let file_path = &files[index % files.len()];
            if let Ok(bytes) = std::fs::read(file_path) {
                // If it's already a JPEG, compute hash and return
                let mut hasher = Sha256::new();
                hasher.update(&bytes);
                let sha = format!("{:x}", hasher.finalize());
                return (bytes, sha);
            }
        }

        // Fallback: Generate clean synthetic JPEG pattern
        Self::generate_synthetic_pattern(index)
    }

    fn create_thumbnail_base64(path: &Path) -> Result<String, Box<dyn std::error::Error>> {
        let img = image::open(path)?;
        let thumb = img.resize(160, 120, FilterType::Nearest);
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        thumb.write_to(&mut cursor, ImageFormat::Jpeg)?;
        Ok(format!("data:image/jpeg;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &buffer)))
    }

    fn generate_synthetic_pattern(seq: usize) -> (Vec<u8>, String) {
        let width = 640;
        let height = 480;
        let mut img: ImageBuffer<Rgb<u8>, Vec<u8>> = ImageBuffer::new(width, height);

        let bg_color = Rgb([24, 28, 36]);
        let grid_color = Rgb([40, 48, 60]);
        let box_color = match seq % 4 {
            0 => Rgb([239, 68, 68]),  // Metallic (Red)
            1 => Rgb([59, 130, 246]), // Non-Metallic (Blue)
            2 => Rgb([16, 185, 129]), // Organic (Green)
            _ => Rgb([245, 158, 11]), // Rocks (Amber)
        };

        for (x, y, pixel) in img.enumerate_pixels_mut() {
            if x % 40 == 0 || y % 40 == 0 {
                *pixel = grid_color;
            } else {
                *pixel = bg_color;
            }
        }

        // Draw simulated bounding box in center
        let cx = (width / 2) as i32 + ((seq as i32 % 5) - 2) * 20;
        let cy = (height / 2) as i32 + (((seq / 5) as i32 % 5) - 2) * 15;
        let bw = 60;
        let bh = 45;

        for x in (cx - bw / 2).max(0)..(cx + bw / 2).min(width as i32) {
            for y in (cy - bh / 2).max(0)..(cy + bh / 2).min(height as i32) {
                if x == cx - bw / 2
                    || x == cx + bw / 2 - 1
                    || y == cy - bh / 2
                    || y == cy + bh / 2 - 1
                {
                    img.put_pixel(x as u32, y as u32, box_color);
                }
            }
        }

        let dyn_img = DynamicImage::ImageRgb8(img);
        let mut buffer = Vec::new();
        let mut cursor = Cursor::new(&mut buffer);
        let _ = dyn_img.write_to(&mut cursor, ImageFormat::Jpeg);

        let mut hasher = Sha256::new();
        hasher.update(&buffer);
        let sha = format!("{:x}", hasher.finalize());

        (buffer, sha)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_synthetic_pattern_generation() {
        let (bytes, sha) = ImageFeeder::generate_synthetic_pattern(0);
        assert!(!bytes.is_empty(), "JPEG bytes should not be empty");
        assert_eq!(sha.len(), 64, "SHA-256 hash must be 64 characters hex string");
        // Verify JPEG magic bytes FF D8
        assert_eq!(bytes[0], 0xFF);
        assert_eq!(bytes[1], 0xD8);
    }

    #[test]
    fn test_corrupt_frame_generation() {
        let feeder = ImageFeeder::new();
        let (bytes, sha) = feeder.get_sample_frame(0, true);
        assert_eq!(bytes, b"CORRUPTED_JPEG_PAYLOAD_FOR_TESTING");
        assert_eq!(sha.len(), 64);
    }
}

