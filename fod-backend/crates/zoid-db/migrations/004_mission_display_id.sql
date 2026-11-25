-- Add centralized sequential display_id assigned at the source (Car).
ALTER TABLE missions ADD COLUMN IF NOT EXISTS display_id BIGINT;

-- Backfill existing missions in chronological order (oldest = 1, newest = N).
WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
    FROM missions
)
UPDATE missions m
SET display_id = n.rn
FROM numbered n
WHERE m.id = n.id AND m.display_id IS NULL;
