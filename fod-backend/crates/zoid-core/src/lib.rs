use thiserror::Error;

#[derive(Error, Debug)]
pub enum ZoidError {
    #[error("Database error: {0}")]
    Database(String),

    #[error("Entity not found: {0}")]
    NotFound(String),

    #[error("Conflict: {0}")]
    Conflict(String),

    #[error("Invalid argument: {0}")]
    InvalidArgument(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("Internal service error: {0}")]
    Internal(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),
}

impl From<ZoidError> for tonic::Status {
    fn from(err: ZoidError) -> Self {
        match err {
            ZoidError::NotFound(msg) => tonic::Status::not_found(msg),
            ZoidError::Conflict(msg) => tonic::Status::already_exists(msg),
            ZoidError::InvalidArgument(msg) => tonic::Status::invalid_argument(msg),
            ZoidError::Unauthorized(msg) => tonic::Status::unauthenticated(msg),
            ZoidError::Database(msg) | ZoidError::Storage(msg) | ZoidError::Internal(msg) => {
                tonic::Status::internal(msg)
            }
        }
    }
}

pub type Result<T> = std::result::Result<T, ZoidError>;
