-- 045: Agent level system
-- Master level definitions + per-project level tracking with proof/evidence

-- ── Master level definitions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_level_definitions (
  level_id              INT PRIMARY KEY,
  name                  TEXT NOT NULL,
  label                 TEXT NOT NULL,
  description           TEXT NOT NULL,
  can_receive_tasks     BOOLEAN NOT NULL DEFAULT false,
  max_parallel_tasks    INT NOT NULL DEFAULT 0,
  requires_approval     BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO agent_level_definitions (level_id, name, label, description, can_receive_tasks, max_parallel_tasks, requires_approval)
VALUES
  (0, 'unregistered', 'Unregistered', 'Agent exists in registry but not onboarded to any project.',               false, 0, true),
  (1, 'onboarding',   'Onboarding',   'Receiving project context and briefing. No tasks assigned yet.',           false, 0, true),
  (2, 'trial',        'Trial',        'Completed onboarding. Eligible for simple supervised tasks only.',         true,  1, true),
  (3, 'active',       'Active',       'Proven capable. Receives real work autonomously.',                         true,  3, false),
  (4, 'senior',       'Senior',       'High reliability. Trusted with complex and multi-step tasks.',             true,  5, false),
  (5, 'lead',         'Lead',         'Can coordinate sub-agents. Trusted with critical path work.',              true,  10, false)
ON CONFLICT (level_id) DO NOTHING;

-- ── Current level per agent per project ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_project_levels (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id      UUID NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  current_level INT  NOT NULL DEFAULT 0 REFERENCES agent_level_definitions(level_id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_project_levels_project  ON agent_project_levels (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_project_levels_agent    ON agent_project_levels (agent_id);

-- ── Level change event log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_level_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id      UUID NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  from_level    INT  NOT NULL REFERENCES agent_level_definitions(level_id),
  to_level      INT  NOT NULL REFERENCES agent_level_definitions(level_id),
  changed_by    UUID,   -- agent_id or user_id who triggered the change
  changed_by_type TEXT CHECK (changed_by_type IN ('agent', 'user')) DEFAULT 'user',
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_level_events_project ON agent_level_events (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_level_events_agent   ON agent_level_events (agent_id);

-- ── Evidence/proof per level event ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_level_proofs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES agent_level_events(id) ON DELETE CASCADE,
  proof_type    TEXT NOT NULL CHECK (proof_type IN ('task', 'conversation', 'a2a_thread')),
  ref_id        TEXT NOT NULL,   -- task UUID, thread_id, or corr_id
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_level_proofs_event ON agent_level_proofs (event_id);
