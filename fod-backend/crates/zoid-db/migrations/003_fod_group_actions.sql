-- Audit log of operator actions on FOD group statuses (stored on Car and ATC only).
CREATE TABLE IF NOT EXISTS fod_group_actions (
    id BIGSERIAL PRIMARY KEY,
    mission_id BIGINT NOT NULL,
    group_id BIGINT NOT NULL,
    from_status TEXT NOT NULL,
    to_status TEXT NOT NULL,
    actor TEXT NOT NULL,
    decided_at_ms BIGINT NOT NULL,
    command_id TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS fod_group_actions_mission_idx
    ON fod_group_actions (mission_id, created_at DESC);
