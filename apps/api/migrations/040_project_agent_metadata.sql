-- Migration 040: Project agent metadata (roles + capability levels + evidence)

-- 1) Per-project agent roles
CREATE TABLE IF NOT EXISTS project_agent_roles (
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id   UUID NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  agent_role TEXT NOT NULL CHECK (agent_role IN ('coordinator','worker','reviewer')),
  updated_by UUID NULL REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, agent_id)
);

-- 2) Global capability levels per agent
CREATE TABLE IF NOT EXISTS agent_capability_levels (
  agent_id          UUID PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  current_level     INTEGER NOT NULL DEFAULT 0 CHECK (current_level >= 0),
  level_confidence  TEXT NOT NULL DEFAULT 'low' CHECK (level_confidence IN ('low','medium','high')),
  last_evaluated_at TIMESTAMPTZ NULL,
  updated_by        UUID NULL REFERENCES users(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3) Capability evidence ledger
CREATE TABLE IF NOT EXISTS agent_capability_evidence (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    UUID NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  project_id  UUID NULL REFERENCES projects(id)    ON DELETE SET NULL,
  task_id     UUID NULL REFERENCES tasks(id)       ON DELETE SET NULL,
  check_type  TEXT NOT NULL,
  result      TEXT NOT NULL CHECK (result IN ('pass','fail')),
  notes       TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID NULL REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_agent_capability_evidence_agent_time
  ON agent_capability_evidence(agent_id, recorded_at DESC);
