# backend-rs — parallel agent contract

Rust port of the fod-desktop Electron main-process services (migration plan:
`~/workspace/docs/electron-to-tauri-migration-plan.md`, Rust scope:
`~/workspace/docs/full-rust-migration-analysis.md` §2.1 "L1").
Binary `fod-backend`, one HTTP server on `GUI_SERVER_PORT` (7985).

## Ground rules (all agents)

- The Node sources being ported live in THIS repo under `../src/` (pages/api,
  services, schedular, utils, custom-api) — they are the SPEC. Read them; never
  modify them. `~/workspace/fod-desktop` and `~/workspace/zoid-fod-backend` are
  READ-ONLY reference too.
- Parity over polish: same routes, same JSON bodies (field names, casing,
  looseness included), same status codes, same socket.io event names/shapes.
  When the Node code is buggy-but-shipped, port the behaviour and leave a
  `// PARITY:` comment — EXCEPT the known per-connection interval leak
  (socket.ts:264), which we fix (single broadcast task, same cadence/shape).
- Frozen files (do NOT edit): `src/main.rs`, `src/routes/mod.rs`,
  `src/error.rs`, `src/state.rs`, `src/models.rs`, `src/kafka.rs`,
  `src/upstream.rs`, `src/config.rs` (exception: R3 sets the jwt fallback),
  and the module SIGNATURES marked FROZEN in `src/services.rs` /
  `src/scheduler.rs`. If a frozen file blocks you, note it in your report
  instead of editing. Loose payloads → `serde_json::Value`; typed structs only
  where the DB forces it (`src/models.rs`).
- DB: runtime `sqlx::query`/`query_as` only (no `query!` macros). Quote ALL
  identifiers: `SELECT * FROM "Mission" WHERE "scanStatus" = $1`. Dates:
  `NaiveDateTime` + the `iso_millis` serializers. Set `"updatedAt" = now()`
  on updates yourself (Prisma's @updatedAt was client-side).
- `cargo add` only if genuinely needed; single add, re-check `Cargo.toml`
  afterwards (parallel agents may race the file).
- `cargo check` often; `cargo clippy` before finishing. The shared `target/`
  lock serializes concurrent builds — that's normal, wait it out.
- Live stack is running: Postgres :5432 (password 1234), Kafka :9092,
  car-backend :6969, atc :7979. Port 7985 belongs to the RUNNING Electron app
  and 7986 to nobody reserved — for runtime tests use YOUR port only via
  `GUI_SERVER_PORT=<port> cargo run`: R1→7991, R2→7992, R3→7993, R4→7994.
  Kill only processes YOU started (by PID). Read-only DB queries are fine;
  writes should target obviously-test rows you clean up, or be exercised via
  endpoints that are idempotent/reversible. NEVER terminate missions or write
  to car-backend/atc unless the report says exactly what was sent.

## Ownership map

| Agent | Owns |
|---|---|
| R1 | `routes/mission.rs`, `routes/fod_group.rs`, `routes/cleared_fod.rs`, `services.rs` bodies, `imagewriter.rs` |
| R2 | `realtime/**` (socketio, sse, backend_link, kafka_consumer) |
| R3 | `routes/auth.rs`, `routes/camera_feed.rs`, `routes/command.rs`, `routes/health.rs`, config.rs jwt fallback line |
| R4 | `scheduler.rs` bodies |

Cross-module calls only through the frozen signatures in `services.rs` and
`scheduler.rs::sync`.
