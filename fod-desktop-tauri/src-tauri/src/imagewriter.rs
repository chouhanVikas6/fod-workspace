//! JPEG frame writer — OWNED BY AGENT R1. Port of
//! src/utils/imageWriter/jpegWriter.ts.
//!
//! The Node writer took a base64 string and decoded it before writing; every
//! caller passed `Buffer.from(frame).toString('base64')`, so the encode/decode
//! round-trip is a no-op and this port takes the raw bytes directly. Path
//! segments are the caller's raw template interpolations (Node happily wrote
//! `fod-images/mission/undefined/...` when a field was missing — kept).

use anyhow::{Context, Result};

/// Write `bytes` to ./fod-images/mission/<mission>/<group>/<fod>.jpg
/// (cwd-relative, same base the image route serves). Returns the /mission/...
/// suffix like writeJpegFile returned its savePath argument.
pub async fn write_fod_jpeg(
    mission_seg: &str,
    group_seg: &str,
    fod_seg: &str,
    bytes: &[u8],
) -> Result<String> {
    let save_path = format!("/mission/{mission_seg}/{group_seg}/{fod_seg}.jpg");
    let dir = std::path::Path::new("./fod-images/mission")
        .join(mission_seg)
        .join(group_seg);
    tokio::fs::create_dir_all(&dir)
        .await
        .with_context(|| format!("Failed to write image file (mkdir {})", dir.display()))?;
    let file = dir.join(format!("{fod_seg}.jpg"));
    tokio::fs::write(&file, bytes)
        .await
        .with_context(|| format!("Failed to write image file ({})", file.display()))?;
    Ok(save_path)
}
