-- Centralized mission templates synced across Car, ATC, and all GUI devices.
CREATE TABLE IF NOT EXISTS mission_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    template_type TEXT NOT NULL DEFAULT 'CUSTOM',
    speed INT NOT NULL DEFAULT 20,
    pass INT NOT NULL DEFAULT 1,
    overlap INT NOT NULL DEFAULT 20,
    direction TEXT NOT NULL DEFAULT 'LENGTHWISE',
    reverse BOOLEAN NOT NULL DEFAULT false,
    boundary_points_json TEXT NOT NULL DEFAULT '[]',
    is_custom BOOLEAN NOT NULL DEFAULT true,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mission_templates_updated_at_idx
    ON mission_templates (updated_at);

INSERT INTO mission_templates (
    id, name, description, template_type, speed, pass, overlap,
    direction, reverse, boundary_points_json, is_custom, is_deleted,
    created_at, updated_at
) VALUES
(
    'tmpl-runway-09-27',
    'Runway 09/27 (Main)',
    'Standard primary runway inspection sweep with dual-pass coverage.',
    'RUNWAY', 25, 2, 20, 'LENGTHWISE', false,
    '[{"lat":28.5104,"lon":77.3726},{"lat":28.5115,"lon":77.3726},{"lat":28.5115,"lon":77.3739},{"lat":28.5104,"lon":77.3739}]',
    false, false, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'
),
(
    'tmpl-taxiway-alpha',
    'Taxiway Alpha Sweep',
    'Rapid single-pass scan along high-speed taxiway connecting main apron.',
    'TAXIWAY', 20, 1, 25, 'LENGTHWISE', false,
    '[{"lat":28.5096,"lon":77.3718},{"lat":28.5104,"lon":77.3718},{"lat":28.5104,"lon":77.3726},{"lat":28.5096,"lon":77.3726}]',
    false, false, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'
),
(
    'tmpl-apron-central',
    'Apron Central Grid',
    'High-density multi-angle inspection grid of aircraft parking bays.',
    'APRON', 15, 1, 30, 'LENGTHWISE', false,
    '[{"lat":28.5108,"lon":77.3739},{"lat":28.5118,"lon":77.3739},{"lat":28.5118,"lon":77.3749},{"lat":28.5108,"lon":77.3749}]',
    false, false, '2025-01-01T00:00:00Z', '2025-01-01T00:00:00Z'
)
ON CONFLICT (id) DO NOTHING;
