# Zoid FOD Desktop — Tauri v2 + Rust Backend

Tauri v2 shell with Rust backend (axum + sqlx + socket.io) replacing the original Electron app. The renderer remains React/Redux/Mapbox, decoupled from platform bindings.

**Status:** Core API routes, realtime, mission domain, and schedulers live-tested against production Postgres/Kafka. Tauri shell runtime (GUI/WebGL) and packaging not yet verified on hardware.

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │  Tauri v2 Shell (src-tauri/)        │
                    │  - Window: 1200×800                 │
                    │  - CSP: localhost + mapbox.com      │
                    │  - Single-instance w/ devtools      │
                    └──────────────┬──────────────────────┘
                                   │
                                   │ localhost:7985
                                   ▼
    ┌───────────────────────────────────────────────────────────┐
    │       Rust Backend (backend-rs/, binary: fod-backend)     │
    │  ┌─────────────────────────────────────────────────────┐  │
    │  │ axum 0.8 Server (one listener per process)          │  │
    │  │ - 33× /api/* routes (auth, missions, images, FOD)  │  │
    │  │ - /api/sse/{health-data,retrive-data}              │  │
    │  │ - socket.io /gui + /rtk namespaces (100ms health)  │  │
    │  │ - /healthz {ok, version, port, startedBy}          │  │
    │  └─────────────────────────────────────────────────────┘  │
    │  ┌─────────────────────────────────────────────────────┐  │
    │  │ Data & Services                                     │  │
    │  │ - sqlx 0.9 (runtime queries, Postgres w/ TZ fix)    │  │
    │  │ - rdkafka (5 topics) + Kafka consumer loop          │  │
    │  │ - Schedulers: dirty-flag push + mission-list sync   │  │
    │  │ - Upstream: car-backend (:6969) + atc (:7979)       │  │
    │  └─────────────────────────────────────────────────────┘  │
    └───────────────────────────────────────────────────────────┘
                    │                    │
        ┌───────────┴────────────┐      │
        │                        │      │
   Postgres              Kafka           Mapbox
   (zoid_client)         (:9092)         (CSP allow)
```

## Quick Start (5 minutes)

### Prerequisites
- Node.js 18+
- Rust 1.70+ (for cargo)
- Postgres running: `zoid_client` database, credentials in `.env`
- Kafka broker at `:9092` (topics: `healthDataAi`, `carDataAi`, `availableDevice`, `update`, `camera`, `commandFromPPM`)
- car-backend at `:6969` and atc at `:7979` (for upstream calls)

### 1. Install & Configure
```bash
cd /home/zoid/workspace/fod-desktop-tauri
npm install
# .env file exists at project root; verify DATABASE_URL, KAFKA_BROKER
cat .env | grep -E 'DATABASE_URL|KAFKA_BROKER|GUI_SERVER_PORT'
```

### 2. Run in Development Mode
```bash
npm run dev
```

This launches concurrently:
- **Rust backend**: `cargo run` (listens on http://localhost:7985)
- **Tauri shell**: `npm run tauri dev` (dev window + hot-reload on renderer changes)

The backend will probe `http://localhost:7985/healthz` on startup:
- If healthy backend exists → adopts it (reuse, second instance safe)
- If not → spawns child `fod-backend` and manages its lifecycle

Once the Tauri window opens, navigate to the app at http://localhost:5174 (dev) or the embedded webview (prod).

### 3. Build for Distribution
```bash
npm run build
```

Runs sequentially:
1. `npm run build:renderer` → React/Vite production bundle
2. `npm run build:backend` → Rust release binary
3. `npm run tauri build` → Creates `.deb` and `.AppImage` (Linux)

Built artifacts:
- Linux deb: `src-tauri/target/release/bundle/deb/*.deb`
- AppImage: `src-tauri/target/release/bundle/appimage/*.AppImage`

## Environment Variables

Set in `.env` at project root (dev) or beside the binary (packaged builds).

### Essential
| Variable | Purpose | Default | Example |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection | (required) | `postgresql://postgres:1234@localhost:5432/zoid_client` |
| `KAFKA_BROKER` | Kafka broker address | (required) | `127.0.0.1:9092` |
| `GUI_SERVER_PORT` | Rust backend listen port | 7985 | `7985` |
| `JWT_SECRET` | JWT signing key (optional) | Node-compatible default | (32+ chars) |
| `SYS_ID` | System identifier | (required) | `345634` |

### Rust-Only (optional)
| Variable | Purpose | Default |
|---|---|---|
| `FOD_NO_SIDECAR` | Set to `1` to skip spawning backend (use existing) | unset |
| `FOD_DISABLE_SCHEDULERS` | Set to `1` to disable dirty-push and mission-list sync | unset |
| `FOD_ENV_PATH` | Explicit .env file path | (auto-discovery) |
| `RUST_LOG` | Tracing filter | `info` |
| `KAFKA_GROUP_ID` | Consumer group override (testing only) | `client${SYS_ID}` |
| `FOD_WEBKIT_DMABUF_WORKAROUND` | Set to `1` to disable DMABUF for Mapbox/WebGL | unset |

### Upstream Services
| Variable | Purpose | Example |
|---|---|---|
| `NEXT_PUBLIC_SERVER_URL` | car-backend address | `http://127.0.0.1:6969` |
| `NEXT_PUBLIC_SECONDARY_SERVER_URL` | atc address | `http://127.0.0.1:7979` |

## Ports

| Port | Component | Purpose |
|---|---|---|
| **5174** | Renderer (Vite dev server) | React app dev; hot-reload |
| **7985** | Rust backend (fod-backend) | API, socket.io, healthz, images |
| **6969** | car-backend (upstream) | External service integration |
| **7979** | atc (upstream) | External service integration |
| **9092** | Kafka | Message bus (topics: update, position, …) |
| **5432** | Postgres | Database (zoid_client) |

## Dev Workflow

### Renderer-Only Changes
If you only modify React/Mapbox code, the dev server will hot-reload without restarting the backend.

### Backend Code Changes
Restart `npm run dev` to rebuild and reload the Rust binary.

### Tests
```bash
# Backend tests (runs against live DB; cleanup included)
cd backend-rs
cargo test

# Renderer type-check (vite build is the gate; tsc has pre-existing issues)
npm run build:renderer
```

### Debugging
- **Backend logs**: Stdout of `cargo run` or the window console
- **Renderer logs**: Browser DevTools (F12 in dev window, or Tauri devtools toggle)
- **Healthz**: `curl http://localhost:7985/healthz`

## Coexistence Rules

**CRITICAL:** The original fod-desktop Electron app remains in `/home/zoid/workspace/fod-desktop/` as a rollback. When running this Tauri app side-by-side with it (for testing), follow these rules strictly:

### 1. Kafka Consumer Group Conflict
The backend uses a **fixed** consumer group `client${SYS_ID}` on single-partition Kafka topics. If both Electron and Rust consume simultaneously, **partition stealing occurs** and messages are lost.

**Rule:** In production (or any side-by-side testing), disable one:
```bash
# Tauri: disable Kafka schedulers, use Electron's
export FOD_DISABLE_SCHEDULERS=1
npm run dev
```

**OR:**

```bash
# Stop the Electron app entirely
# Only run this Tauri instance
npm run dev
```

### 2. Dirty-Flag Scheduler Conflict
Both apps have a background "primary scheduler" that pushes dirty FOD flags at regular intervals.

**Rule:** Only ONE instance must run the scheduler. Use `FOD_DISABLE_SCHEDULERS=1` on the Tauri side if the Electron app is also running and active.

### 3. Backend Port Single-Owner
Port 7985 can only be bound by one process. The Tauri shell's sidecar supervisor checks `http://localhost:7985/healthz` first:
- If healthy → adopts the existing backend (safe for second instance of this app)
- If not → spawns a new child backend

**Rule:** Do not bind port 7985 to other services.

## Build & Package

### Development Build
```bash
npm run build:renderer  # Outputs dist/renderer/
npm run build:backend   # Outputs backend-rs/target/release/fod-backend
```

### Packaged Build (Linux deb/AppImage)
```bash
npm run build
```

**Current Limitations:**
- externalBin configuration for sidecar done for dev; production packaging not tested
- .env seeding at first-run not implemented (app reads .env beside the binary)
- fod-images directory location still relative to cwd (needs migration to app-data dir)
- Deb/AppImage bundle created but not deployed/verified

### Distribution
After `npm run build`, the artifacts are in:
- `src-tauri/target/release/bundle/deb/` (`.deb` packages)
- `src-tauri/target/release/bundle/appimage/` (`.AppImage` bundles)

Copy the `.deb` or `.AppImage` to your deployment target.

## Verification Status

### ✅ Complete (Live Tested)
- **Auth:** Full parity with Node.js backend; JWTs minted by Rust accepted by legacy routes; bcrypt verification; all error envelopes byte-matched
- **Realtime:** socket.io protocol compliance (11/11 tests); SystemHealthStat shape exact; Kafka heartbeat end-to-end
- **SSE:** Event framing byte-identical to Node (dedup cursor, ISO dates); health-data and retrive-data routes live
- **Mission Domain:** All 24 routes ported; live-tested (27MB export, full delete cycle); retrive-data cross-checked against psql
- **Schedulers:** Dirty-flag push survives network failures; mission-list sync live
- **Integrated Smoke Test:** healthz, mission list, stat(32), login, retrive-data, images 404, socket.io health event (all green, schedulers isolated)

### ⏳ Not Yet Verified (Need Display / Real Hardware)
- **GUI/Webview:** Tauri shell window rendering, keyboard/mouse input
- **WebGL/Mapbox:** GPU-accelerated rendering and interactivity
- **Phase 5 Regression:** Full end-to-end flow on built Tauri binary

### ⚠️ Known Issues & Workarounds

#### 1. Sidecar Health Timeout (30s)
If Postgres or Kafka is slow at startup, the healthz probe may time out. The Tauri shell will show an error dialog and retry with exponential backoff (max 3 retries). If this blocks you:
```bash
# Start Postgres and Kafka first, then:
npm run dev
```

#### 2. DMABUF/WebGL Rendering (Potential)
On some systems, WebKit DMABUF causes Mapbox to render black. Workaround:
```bash
export FOD_WEBKIT_DMABUF_WORKAROUND=1
npm run dev
```

#### 3. car-backend Connection Pool Exhaustion
During the original Electron app testing, car-backend endpoints were observed hanging (>20s). This was likely caused by Electron's 1s polling loop exhausting the connection pool. Restart car-backend before running end-to-end tests:
```bash
# In another terminal
pkill -f "car-backend" || true
# Restart car-backend via its deployment method
```

#### 4. TypeScript Type-Check Issue
`npm run typecheck` (tsc) is blocked by a pre-existing TS moduleResolution config issue. However, `npm run build:renderer` (Vite) is the working gate and passes all type checks.

#### 5. Parity Quirks (Intentionally Preserved)
The following behaviors are maintained from the Node.js backend for compatibility:
- `/login` advertises `Allow: POST` but handles `GET`
- `/command` returns 402 with "unidentified type"
- `/camera-feed` returns 200 even if Kafka is down (error is swallowed)
- `/mission/create` always returns 500 (bug in Node too: Mission.id has no DB default)
- `/cleared-fod/response` returns 500 with empty body `{}` when no row exists
- Dirty flag only clears when response body `.status==200`
- biggestFod field silently dropped (Node had a column-name typo)
- `sync("dirty")` is a no-op (commented out in Node source)

## Project Structure

```
fod-desktop-tauri/
├── README.md (this file)
├── package.json (scripts, React/Vite deps)
├── .env (configuration)
├── src/ (React/Redux/Mapbox renderer)
│   ├── components/ (UI)
│   ├── pages/ (Routes)
│   ├── slices/ (Redux state)
│   └── App.tsx (Root)
├── src-tauri/ (Tauri v2 shell)
│   ├── tauri.conf.json (window, CSP, bundle config)
│   ├── Cargo.toml (Tauri deps)
│   └── src/lib.rs (Window setup, sidecar supervision)
├── backend-rs/ (Rust backend — main build)
│   ├── Cargo.toml (axum, sqlx, socketioxide, rdkafka)
│   ├── src/main.rs (Entry, .env resolution, scheduler gates)
│   ├── src/routes/ (33 API endpoints)
│   ├── src/realtime/ (socket.io + Kafka consumer)
│   ├── src/scheduler/ (dirty-push + mission-list sync)
│   ├── src/services/ (business logic)
│   └── src/models/ (Data types)
└── dist/ (Build output: renderer, backend binary)
```

## Migration Notes

This Tauri app is a fork of `fod-desktop` (Electron). The original app remains at `/home/zoid/workspace/fod-desktop/` for rollback. Key differences:

1. **No Electron API:** Zero `electronAPI` calls; renderer is pure web code.
2. **Rust Backend:** Node.js sidecar replaced with axum + sqlx; all 33 routes re-implemented.
3. **Dev Server Port:** Renderer runs on 5174 (5173 is Electron's old port).
4. **Build System:** Cargo + Tauri CLI instead of electron-builder.
5. **Socket.io:** Upgraded to 4.8.3; health broadcast 100ms (no per-connection leak).

See `/home/zoid/workspace/docs/electron-to-tauri-migration-plan.md` for full context.

## Next Steps (Blockers for Release)

1. **Phase 0 Spikes** (CRITICAL — need hardware display):
   - S1: getUserMedia camera capture in WebKitGTK (for clear-FOD flow)
   - S2: Mapbox/WebGL rendering on Linux

2. **Phase 5 Regression Test:** Full workflow on built Tauri binary with real hardware

3. **Packaging (Phase 6):**
   - externalBin sidecar wiring for prod
   - First-run .env seeding and app-data dir migration
   - Deb/AppImage deploy and verification

4. **Restart car-backend** before production end-to-end testing (connection pool issue)

---

**For detailed migration status, open-items, and parity quirks, see:**
`/home/zoid/workspace/docs/tauri-rust-migration-status-2026-08-12.md`
