-- Migration 035: Rename/consolidate membership tables for consistency (Option B)
-- Old → New:
--   org_user_members            → org_users
--   org_members                 ┐
--   org_agent_contributions     ┘ → org_agents  (merged)
--   project_user_members        → project_users
--   project_team                → project_agents

-- ─── 1. org_users (was org_user_members) ─────────────────────────────────────
CREATE TABLE org_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'contributor'
             CHECK (role IN ('owner', 'admin', 'contributor', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

INSERT INTO org_users (id, org_id, user_id, role, created_at)
SELECT id, org_id, user_id, role, created_at FROM org_user_members;

CREATE INDEX org_users_org_idx  ON org_users(org_id);
CREATE INDEX org_users_user_idx ON org_users(user_id);

-- ─── 2. org_agents (merges org_members + org_agent_contributions) ─────────────
CREATE TABLE org_agents (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID        NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  agent_id       UUID        NOT NULL REFERENCES agents(id)        ON DELETE CASCADE,
  role           TEXT        NOT NULL DEFAULT 'member'
                 CHECK (role IN ('owner', 'admin', 'member')),
  contributed_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  status         TEXT        NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'withdrawn')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, agent_id)
);

INSERT INTO org_agents (org_id, agent_id, role, contributed_by, status, created_at)
SELECT
  om.org_id,
  om.agent_id,
  om.role,
  oac.contributed_by,
  COALESCE(oac.status, 'active'),
  om.created_at
FROM org_members om
LEFT JOIN org_agent_contributions oac
  ON oac.org_id = om.org_id AND oac.agent_id = om.agent_id;

CREATE INDEX org_agents_org_idx   ON org_agents(org_id);
CREATE INDEX org_agents_agent_idx ON org_agents(agent_id);

-- ─── 3. project_users (was project_user_members) ─────────────────────────────
CREATE TABLE project_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member'
             CHECK (role IN ('owner', 'admin', 'member')),
  invited_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

INSERT INTO project_users (id, project_id, user_id, role, invited_by, joined_at)
SELECT id, project_id, user_id, role, invited_by, joined_at FROM project_user_members;

CREATE INDEX project_users_project_idx ON project_users(project_id);
CREATE INDEX project_users_user_idx    ON project_users(user_id);

-- ─── 4. project_agents (was project_team) ────────────────────────────────────
CREATE TABLE project_agents (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  agent_id   UUID        NOT NULL REFERENCES agents(id)   ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'member',
  added_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, agent_id)
);

INSERT INTO project_agents (project_id, agent_id, role, joined_at)
SELECT project_id, agent_id, role, COALESCE(assigned_at, joined_at, now())
FROM project_team;

CREATE INDEX project_agents_project_idx ON project_agents(project_id);
CREATE INDEX project_agents_agent_idx   ON project_agents(agent_id);

-- ─── Drop old tables ──────────────────────────────────────────────────────────
DROP TABLE IF EXISTS org_agent_contributions;
DROP TABLE IF EXISTS org_members;
DROP TABLE IF EXISTS org_user_members;
DROP TABLE IF EXISTS project_user_members;
DROP TABLE IF EXISTS project_team;
