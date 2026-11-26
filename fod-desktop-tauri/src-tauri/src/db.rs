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
    seed_default_mission_templates(&pool).await?;

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
            "previousTime" DATETIME DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "displayId" INTEGER
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
            "versionVector" TEXT DEFAULT '{}',
            "decidedAtMs" INTEGER DEFAULT 0,
            "updatedBy" TEXT DEFAULT '',
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
        r#"
        CREATE TABLE IF NOT EXISTS "MissionTemplate" (
            "id" TEXT NOT NULL PRIMARY KEY,
            "name" TEXT NOT NULL,
            "description" TEXT NOT NULL DEFAULT '',
            "type" TEXT NOT NULL DEFAULT 'CUSTOM',
            "speed" INTEGER NOT NULL DEFAULT 20,
            "pass" INTEGER NOT NULL DEFAULT 1,
            "overlap" INTEGER NOT NULL DEFAULT 20,
            "direction" TEXT NOT NULL DEFAULT 'LENGTHWISE',
            "reverse" BOOLEAN NOT NULL DEFAULT 0,
            "boundaryPoints" TEXT NOT NULL DEFAULT '[]',
            "isCustom" BOOLEAN NOT NULL DEFAULT 1,
            "isDeleted" BOOLEAN NOT NULL DEFAULT 0,
            "dirty" BOOLEAN DEFAULT 0,
            "createdAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now')),
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS "StoragePolicy" (
            "key" TEXT NOT NULL PRIMARY KEY,
            "policyJson" TEXT NOT NULL,
            "updatedAt" DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now'))
        )
        "#,
    ];

    for sql in statements {
        sqlx::query(sql).execute(pool).await?;
    }

    // Additive column migration for existing SQLite databases.
    let _ = sqlx::query(r#"ALTER TABLE "Mission" ADD COLUMN "displayId" INTEGER"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "Mission" ADD COLUMN "localEvicted" BOOLEAN NOT NULL DEFAULT 0"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "Mission" ADD COLUMN "storageTier" TEXT NOT NULL DEFAULT 'HOT'"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "Mission" ADD COLUMN "storageEpoch" INTEGER NOT NULL DEFAULT 1"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "Mission" ADD COLUMN "archiveSizeBytes" INTEGER"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "Mission" ADD COLUMN "coldStoredAt" DATETIME"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "FodGroup" ADD COLUMN "versionVector" TEXT DEFAULT '{}'"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "FodGroup" ADD COLUMN "decidedAtMs" INTEGER DEFAULT 0"#)
        .execute(pool)
        .await;
    let _ = sqlx::query(r#"ALTER TABLE "FodGroup" ADD COLUMN "updatedBy" TEXT DEFAULT ''"#)
        .execute(pool)
        .await;

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

async fn seed_default_mission_templates(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let count: i64 = sqlx::query_scalar(r#"SELECT COUNT(*) FROM "MissionTemplate""#)
        .fetch_one(pool)
        .await?;

    if count == 0 {
        let seed_ts = "2025-01-01 00:00:00.000";
        let defaults = [
            (
                "tmpl-runway-09-27",
                "Runway 09/27 (Main)",
                "Standard primary runway inspection sweep with dual-pass coverage.",
                "RUNWAY",
                25i32,
                2i32,
                20i32,
                "LENGTHWISE",
                false,
                r#"[{"lat":28.5104,"lon":77.3726},{"lat":28.5115,"lon":77.3726},{"lat":28.5115,"lon":77.3739},{"lat":28.5104,"lon":77.3739}]"#,
            ),
            (
                "tmpl-taxiway-alpha",
                "Taxiway Alpha Sweep",
                "Rapid single-pass scan along high-speed taxiway connecting main apron.",
                "TAXIWAY",
                20i32,
                1i32,
                25i32,
                "LENGTHWISE",
                false,
                r#"[{"lat":28.5096,"lon":77.3718},{"lat":28.5104,"lon":77.3718},{"lat":28.5104,"lon":77.3726},{"lat":28.5096,"lon":77.3726}]"#,
            ),
            (
                "tmpl-apron-central",
                "Apron Central Grid",
                "High-density multi-angle inspection grid of aircraft parking bays.",
                "APRON",
                15i32,
                1i32,
                30i32,
                "LENGTHWISE",
                false,
                r#"[{"lat":28.5108,"lon":77.3739},{"lat":28.5118,"lon":77.3739},{"lat":28.5118,"lon":77.3749},{"lat":28.5108,"lon":77.3749}]"#,
            ),
        ];

        for (id, name, desc, ttype, speed, pass, overlap, dir, rev, pts) in defaults {
            let _ = sqlx::query(
                r#"INSERT OR IGNORE INTO "MissionTemplate"
                   ("id", "name", "description", "type", "speed", "pass", "overlap",
                    "direction", "reverse", "boundaryPoints", "isCustom", "isDeleted",
                    "dirty", "createdAt", "updatedAt")
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 0, 0, 0, $11, $11)"#,
            )
            .bind(id)
            .bind(name)
            .bind(desc)
            .bind(ttype)
            .bind(speed)
            .bind(pass)
            .bind(overlap)
            .bind(dir)
            .bind(rev)
            .bind(pts)
            .bind(seed_ts)
            .execute(pool)
            .await;
        }
    }

    Ok(())
}
