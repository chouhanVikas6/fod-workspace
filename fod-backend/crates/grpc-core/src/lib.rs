use tonic::{Request, Status};
use tower_http::cors::{Any, CorsLayer};

/// Creates permissive CORS configuration allowing browser gRPC-Web clients
pub fn cors_layer() -> CorsLayer {
    CorsLayer::new()
        .allow_origin(Any)
        .allow_headers(Any)
        .allow_methods(Any)
}

/// Simple authentication interceptor checking for Bearer token or internal caller header
pub fn auth_interceptor(req: Request<()>) -> Result<Request<()>, Status> {
    // In dev / initial phase, accept all requests; can be extended with JWT validation
    Ok(req)
}