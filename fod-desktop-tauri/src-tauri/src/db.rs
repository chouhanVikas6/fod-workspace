//! SQLite database initialization and schema setup.
//!
//! Replaces the external PostgreSQL + Prisma setup with an embedded SQLite
//! database (`zoid_client.db`) initialized automatically on startup.

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use std::str::FromStr;
use std::time::Duration;

pub async fn init_db(database_url: &str) -> Result<SqlitePool, sqlx::Error> {
    let url = if database_url.starts_with("postgres://")
        || database_url.starts_with("postgresql://")
        || database_url.trim().is_empty()
    {
        "sqlite://zoid_client.db?mode=rwc"
    } else {
        database_url
    };

    let options = SqliteConnectOptions::from_str(url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(10))
        .foreign_keys(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(options)
        .await?;

    run_migrations(&pool).await?;
    seed_default_users(&pool).await?;

    Ok(pool)
}

async fn run_migrations(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let statements = [
        r#"
        CREATE TABLE IF NOT EXISTS "Mission" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "status" TEXT NOT NULL DEFAULT 'ACTIVE',
            "timer" REAL NOT NULL DEFAULT 0,
            "scanStatus" TEXT NOT NULL DEFAULT 'PAUSE',
            "pass" INTEGER DEFAULT 0,
            "speed" INTEGER DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "createdBy" TEXT DEFAULT '2',
            "updatedBy" TEXT DEFAULT '2',
            "dirty" BOOLEAN DEFAULT 0,
            "previousTime" DATETIME DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS "FodGroup" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "groupId" INTEGER NOT NULL,
            "missionId" INTEGER NOT NULL,
            "status" TEXT NOT NULL DEFAULT 'NEW',
            "biggestFodId" TEXT,
            "biggestFodSize" INTEGER,
            "dirty" BOOLEAN DEFAULT 0,
            "version" INTEGER DEFAULT 1,
            "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            CONSTRAINT "FodGroup_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
        "#,
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS "FodGroup_missionId_groupId_key" ON "FodGroup"("missionId", "groupId")
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS "Fod" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "sysid" TEXT DEFAULT 'ZFT-01',
            "location" TEXT NOT NULL,
            "confidence" REAL,
            "timestamp" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "class" TEXT DEFAULT 'UNKNOWN',
            "velocity" REAL NOT NULL,
            "size" REAL NOT NULL,
            "missionId" INTEGER NOT NULL,
            "groupId" INTEGER NOT NULL,
            "dirty" BOOLEAN DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "fodGroupId" TEXT,
            CONSTRAINT "Fod_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            CONSTRAINT "Fod_fodGroupId_fkey" FOREIGN KEY ("fodGroupId") REFERENCES "FodGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS "Fod_missionId_idx" ON "Fod"("missionId")
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS "Fod_groupId_idx" ON "Fod"("groupId")
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS "ClearedFod" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "status" TEXT NOT NULL,
            "beforeClearImg" TEXT NOT NULL DEFAULT '[]',
            "afterClearImg" TEXT NOT NULL DEFAULT '[]',
            "location" TEXT NOT NULL,
            "groupId" INTEGER NOT NULL,
            "missionId" INTEGER NOT NULL,
            "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "createdBy" TEXT DEFAULT '2',
            "updatedBy" TEXT DEFAULT '2',
            "dirty" BOOLEAN DEFAULT 0,
            CONSTRAINT "ClearedFod_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
        )
        "#,
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS "ClearedFod_groupId_missionId_key" ON "ClearedFod"("groupId", "missionId")
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS "ClearedFod_missionId_idx" ON "ClearedFod"("missionId")
        "#,
        r#"
        CREATE INDEX IF NOT EXISTS "ClearedFod_groupId_idx" ON "ClearedFod"("groupId")
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS "User" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "username" TEXT NOT NULL,
            "firstName" TEXT NOT NULL,
            "lastName" TEXT NOT NULL,
            "password" TEXT NOT NULL,
            "isActive" BOOLEAN NOT NULL DEFAULT 1,
            "role" TEXT NOT NULL DEFAULT 'GUEST',
            "dirty" BOOLEAN DEFAULT 1,
            "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
        )
        "#,
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username")
        "#,
    ];

    for sql in statements {
        sqlx::query(sql).execute(pool).await?;
    }

    Ok(())
}

async fn seed_default_users(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "User""#)
        .fetch_one(pool)
        .await?;

    if count == 0 {
        let now = crate::services::now_naive();
        if let Ok(hashed) = bcrypt::hash("admin123", 10) {
            let id = uuid::Uuid::new_v4().to_string();
            let _ = sqlx::query(
                r#"INSERT INTO "User"
                   ("id", "username", "firstName", "lastName", "password",
                    "isActive", "role", "dirty", "createdAt", "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)"#,
            )
            .bind(id)
            .bind("admin")
            .bind("System")
            .bind("Admin")
            .bind(hashed)
            .bind(true)
            .bind("ADMIN")
            .bind(true)
            .bind(now)
            .bind(now)
            .execute(pool)
            .await;
        }
    }

    Ok(())
}
