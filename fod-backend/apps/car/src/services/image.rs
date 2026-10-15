use proto_defination::image::image_service_server::ImageService;
use proto_defination::image::{
    ImageChunk, ImageDownloadRequest, UploadImageRequest, UploadImageResponse,
};
use std::pin::Pin;
use std::sync::Arc;
use tonic::{Request, Response, Status};
use zoid_storage::FrameStorage;

pub struct ImageServiceImpl {
    storage: Arc<FrameStorage>,
}

impl ImageServiceImpl {
    pub fn new(storage: Arc<FrameStorage>) -> Self {
        Self { storage }
    }
}

#[tonic::async_trait]
impl ImageService for ImageServiceImpl {
    type DownloadImageStream =
        Pin<Box<dyn tokio_stream::Stream<Item = Result<ImageChunk, Status>> + Send + 'static>>;

    async fn download_image(
        &self,
        request: Request<ImageDownloadRequest>,
    ) -> Result<Response<Self::DownloadImageStream>, Status> {
        let req = request.into_inner();
        let bytes = self
            .storage
            .read_frame(&req.sha256, req.thumbnail)
            .await
            .map_err(|e| Status::not_found(e.to_string()))?;

        let total_size = bytes.len() as i64;
        // Stream in chunks (64KB chunks)
        const CHUNK_SIZE: usize = 64 * 1024;
        let chunks: Vec<Result<ImageChunk, Status>> = bytes
            .chunks(CHUNK_SIZE)
            .map(|chunk| {
                Ok(ImageChunk {
                    data: chunk.to_vec(),
                    total_size,
                    mime_type: "image/jpeg".to_string(),
                })
            })
            .collect();

        let stream = tokio_stream::iter(chunks);
        Ok(Response::new(Box::pin(stream)))
    }

    async fn upload_image(
        &self,
        request: Request<UploadImageRequest>,
    ) -> Result<Response<UploadImageResponse>, Status> {
        let req = request.into_inner();
        let sha256 = self
            .storage
            .save_frame(&req.jpeg)
            .await
            .map_err(|e| Status::internal(e.to_string()))?;

        Ok(Response::new(UploadImageResponse {
            sha256,
            size: req.jpeg.len() as i64,
        }))
    }
}
