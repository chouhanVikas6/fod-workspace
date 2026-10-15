//! API error envelope — parity-critical.
//!
//! The renderer's HTTP client throws on status ≥ 400 and surfaces
//! `{ status, data }` to the toast layer. Handlers must therefore return the
//! same JSON bodies the Node handlers produced, with the same status codes:
//!   - unhandled handler error → 500 {"error":"Internal server error","details":...}
//!   - unknown route           → 404 {"error":"Not Found: <url>"}
//! (both shapes from src/mainApiRouter.ts).

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

pub type ApiResult<T> = Result<T, ApiError>;

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub data: Value,
}

impl ApiError {
    pub fn new(status: u16, data: Value) -> Self {
        Self {
            status: StatusCode::from_u16(status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            data,
        }
    }

    pub fn msg(status: u16, msg: impl Into<String>) -> Self {
        Self::new(status, json!({ "error": msg.into() }))
    }

    pub fn internal(err: impl std::fmt::Display) -> Self {
        Self::new(
            500,
            json!({ "error": "Internal server error", "details": err.to_string() }),
        )
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.status, Json(self.data)).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!(error = %e, "database error");
        Self::internal(e)
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        tracing::error!(error = %e, "internal error");
        Self::internal(e)
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        Self::internal(e)
    }
}

/// Stub handler for not-yet-ported routes. Replace by implementing the real
/// handler in the owning module — grep for `not_impl` to find remaining stubs.
pub async fn not_impl() -> ApiError {
    ApiError::msg(501, "not implemented (rust port in progress)")
}
