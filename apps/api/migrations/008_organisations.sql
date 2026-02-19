-- ── Organisations + Agent Connectivity ──────────────────────────────────────

-- Organisations table
CREATE TABLE IF NOT EXISTS organisations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  description TEXT,
  type        TEXT NOT NULL DEFAULT 'own',     -- 'own' | 'partner' | 'client'
  status      TEXT NOT NULL DEFAULT 'active',
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Org-to-org relationships (friend links)
CREATE TABLE IF NOT EXISTS org_relationships (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_org_id    UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  to_org_id      UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  type           TEXT NOT NULL DEFAULT 'partner',  -- 'partner' | 'client' | 'vendor'
  status         TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'active' | 'blocked'
  invited_by     UUID REFERENCES agents(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(from_org_id, to_org_id)
);

-- Agent inbox (Darshan → Agent communication)
CREATE TABLE IF NOT EXISTS agent_inbox (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,   -- 'ping' | 'task_assigned' | 'message' | 'review_request'
  payload    JSONB NOT NULL DEFAULT '{}',
  status     TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'ack' | 'failed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acked_at   TIMESTAMPTZ
);

-- Add connectivity + org columns to agents
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS org_id          UUID REFERENCES organisations(id),
  ADD COLUMN IF NOT EXISTS agent_type      TEXT NOT NULL DEFAULT 'ai_agent',
  ADD COLUMN IF NOT EXISTS model           TEXT,
  ADD COLUMN IF NOT EXISTS provider        TEXT,
  ADD COLUMN IF NOT EXISTS capabilities    JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS endpoint_type   TEXT NOT NULL DEFAULT 'openclaw_poll',
  ADD COLUMN IF NOT EXISTS endpoint_config JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS callback_token  TEXT,
  ADD COLUMN IF NOT EXISTS ping_status     TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_ping_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_seen_at    TIMESTAMPTZ;

-- Add org to projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organisations(id);

-- ── Seed MithranLabs as home org ────────────────────────────────────────────
INSERT INTO organisations (id, name, slug, type, description)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  'MithranLabs',
  'mithranlabs',
  'own',
  'AI-powered product engineering team'
) ON CONFLICT (id) DO NOTHING;

-- Assign existing agents + projects to MithranLabs
UPDATE agents  SET org_id = '00000000-0000-0000-0001-000000000001' WHERE org_id IS NULL;
UPDATE projects SET org_id = '00000000-0000-0000-0001-000000000001' WHERE org_id IS NULL;

-- Update Mithran with full connectivity info
UPDATE agents SET
  agent_type      = 'ai_coordinator',
  model           = 'claude-sonnet-4-6',
  provider        = 'anthropic',
  capabilities    = '["code","deploy","plan","review","api","infra","coordinate"]',
  endpoint_type   = 'openclaw_poll',
  endpoint_config = '{"poll_interval_sec": 120, "session_key": "agent:mithran:main"}',
  callback_token  = encode(gen_random_bytes(32), 'hex'),
  status          = 'online',
  last_seen_at    = now()
WHERE LOWER(name) LIKE 'mithran%';

-- Update Komal
UPDATE agents SET
  agent_type   = 'ai_agent',
  model        = 'claude-sonnet-4-6',
  provider     = 'anthropic',
  capabilities = '["frontend","ui","ux","design","react","tailwind"]',
  endpoint_type   = 'openclaw_poll',
  endpoint_config = '{"poll_interval_sec": 120, "session_key": "agent:komal:main"}'
WHERE LOWER(name) LIKE 'komal%';
