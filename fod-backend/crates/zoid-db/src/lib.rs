pub mod models;
pub mod repos;

use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use zoid_core::{Result, ZoidError};

#[derive(Clone)]
pub struct Db {
    pool: PgPool,
}

impl Db {
    pub async fn connect(database_url: &str, max_connections: u32) -> Result<Self> {
        let pool = PgPoolOptions::new()
            .max_connections(max_connections)
            .connect(database_url)
            .await
            .map_err(|e| ZoidError::Database(e.to_string()))?;

        sqlx::migrate!("./migrations")
            .run(&pool)
            .await
            .map_err(|e| ZoidError::Database(format!("Migration failed: {e}")))?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &PgPool {
        &self.pool
    }
}
