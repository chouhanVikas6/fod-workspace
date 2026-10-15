CREATE TYPE mission_status      AS ENUM ('ACTIVE','INACTIVE','TERMINATED');
CREATE TYPE mission_scan_status AS ENUM ('PLAY','PAUSE');
CREATE TYPE fod_group_status    AS ENUM ('NEW','ACCEPTED','REJECTED','CLEARED');
CREATE TYPE cleared_fod_status  AS ENUM ('found','not_found','false_positive');
CREATE TYPE user_role           AS ENUM ('admin','collector','driver');

CREATE TABLE IF NOT EXISTS missions (
  id BIGINT PRIMARY KEY,
  status mission_status NOT NULL DEFAULT 'ACTIVE',
  timer BIGINT NOT NULL DEFAULT 0,
  scan_status mission_scan_status NOT NULL DEFAULT 'PAUSE',
  speed INT, pass INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT, updated_by TEXT
);

CREATE TABLE IF NOT EXISTS fod_groups (
  id BIGSERIAL PRIMARY KEY,
  mission_id BIGINT NOT NULL REFERENCES missions(id),
  group_id BIGINT NOT NULL,
  status fod_group_status NOT NULL DEFAULT 'NEW',
  version BIGINT NOT NULL DEFAULT 0,
  biggest_fod UUID, biggest_fod_size DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mission_id, group_id)
);

CREATE TABLE IF NOT EXISTS fods (
  id UUID PRIMARY KEY,
  mission_id BIGINT NOT NULL REFERENCES missions(id),
  group_id BIGINT NOT NULL,
  sysid TEXT, cam_id TEXT,
  lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL, sd DOUBLE PRECISION NOT NULL,
  confidence DOUBLE PRECISION, class TEXT,
  velocity DOUBLE PRECISION NOT NULL, size DOUBLE PRECISION NOT NULL,
  image_sha256 CHAR(64), image_size INT, frame_missing BOOLEAN NOT NULL DEFAULT false,
  captured_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fods_mission_group ON fods (mission_id, group_id);
CREATE INDEX IF NOT EXISTS fods_mission_size  ON fods (mission_id, group_id, size DESC);

CREATE TABLE IF NOT EXISTS cleared_fods (
  id UUID PRIMARY KEY,
  mission_id BIGINT NOT NULL REFERENCES missions(id),
  group_id BIGINT NOT NULL,
  status cleared_fod_status NOT NULL,
  before_image_sha256 TEXT[] NOT NULL DEFAULT '{}',
  after_image_sha256  TEXT[] NOT NULL DEFAULT '{}',
  lat DOUBLE PRECISION NOT NULL, lon DOUBLE PRECISION NOT NULL, sd DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), created_by TEXT
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  role user_role NOT NULL DEFAULT 'collector',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replication (car = primary)
CREATE SEQUENCE IF NOT EXISTS change_seq;
CREATE TABLE IF NOT EXISTS change_log (
  seq BIGINT PRIMARY KEY, entity SMALLINT NOT NULL, entity_key TEXT NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS replica_state (
  node_id TEXT PRIMARY KEY, role TEXT NOT NULL,
  acked_cursor BIGINT NOT NULL DEFAULT 0, frames_through_seq BIGINT NOT NULL DEFAULT 0,
  last_seen TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS applied_commands (
  command_id UUID PRIMARY KEY, outcome SMALLINT NOT NULL, group_version BIGINT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS command_audit (
  command_id UUID PRIMARY KEY, mission_id BIGINT NOT NULL, group_id BIGINT NOT NULL,
  operator_id TEXT NOT NULL, origin_node TEXT NOT NULL,
  from_status fod_group_status, to_status fod_group_status NOT NULL,
  outcome SMALLINT NOT NULL, issued_at TIMESTAMPTZ, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Replication (replica side: ATC, desktop)
CREATE TABLE IF NOT EXISTS upstream_cursor (
  upstream_node_id TEXT PRIMARY KEY, cursor BIGINT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pending_commands (
  command_id UUID PRIMARY KEY, mission_id BIGINT NOT NULL, group_id BIGINT NOT NULL,
  desired_status fod_group_status NOT NULL, base_version BIGINT NOT NULL,
  operator_id TEXT NOT NULL, payload BYTEA,
  state SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pending_commands_open ON pending_commands (created_at) WHERE state = 0;
