-- 044: Add slug to agents
-- Slug is the canonical env var prefix (e.g. "SANJAYA" -> AGENT_SANJAYA_ID).
-- Set once at creation, never changes even if the agent is renamed.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS slug TEXT;

-- Backfill from existing names
UPDATE agents
   SET slug = upper(regexp_replace(name, '[^A-Za-z0-9]', '_', 'g'))
 WHERE slug IS NULL;

-- Make it NOT NULL + unique after backfill
ALTER TABLE agents ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS agents_slug_uq ON agents (slug);
