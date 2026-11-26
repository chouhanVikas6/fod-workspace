-- Mission storage lifecycle (HOT / COLD_STORED / CAR_DROPPED) & fleet auto-storage policies.
ALTER TABLE missions ADD COLUMN IF NOT EXISTS storage_tier TEXT NOT NULL DEFAULT 'HOT';
ALTER TABLE missions ADD COLUMN IF NOT EXISTS storage_epoch BIGINT NOT NULL DEFAULT 1;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS archive_path TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS archive_size_bytes BIGINT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS archive_sha256 TEXT;
ALTER TABLE missions ADD COLUMN IF NOT EXISTS cold_stored_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS storage_policies (
    key TEXT PRIMARY KEY,
    policy_json JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
