-- Per-node version vectors for FOD group status (multi-node conflict-free sync).
-- vv            : {"node_id": counter}; `version` is kept = sum(vv) for compatibility
-- decided_at_ms : wall-clock of the operator decision now held in `status`
-- updated_by    : node/actor that made that decision
-- dirty         : replica-side flag — local change not yet acknowledged by primary
ALTER TABLE fod_groups ADD COLUMN IF NOT EXISTS vv JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE fod_groups ADD COLUMN IF NOT EXISTS decided_at_ms BIGINT NOT NULL DEFAULT 0;
ALTER TABLE fod_groups ADD COLUMN IF NOT EXISTS updated_by TEXT NOT NULL DEFAULT '';
ALTER TABLE fod_groups ADD COLUMN IF NOT EXISTS dirty BOOLEAN NOT NULL DEFAULT false;

-- Seed existing rows: old per-node counters are not comparable across nodes,
-- so they all go under one shared "legacy" key. Equal legacy vectors with a
-- different status are treated as a conflict and merged on first sync.
UPDATE fod_groups
   SET vv = jsonb_build_object('legacy', version),
       decided_at_ms = (EXTRACT(EPOCH FROM updated_at) * 1000)::BIGINT
 WHERE version > 0 AND vv = '{}'::jsonb;

CREATE INDEX IF NOT EXISTS fod_groups_dirty ON fod_groups (mission_id, group_id) WHERE dirty;
