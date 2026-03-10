-- ─────────────────────────────────────────────────────────────────────────────
-- 049_workspaces.sql
-- Replace organisations (4 tables, complex) with workspaces (1 table, simple).
-- A workspace is just a named folder that groups projects. No members, no roles,
-- no agent management, no invites. Projects optionally reference workspace_id.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Drop org tables (order matters for FK deps)
DROP TABLE IF EXISTS org_user_invites CASCADE;
DROP TABLE IF EXISTS org_agents        CASCADE;
DROP TABLE IF EXISTS org_users         CASCADE;
DROP TABLE IF EXISTS organisations     CASCADE;

-- 2. Create workspaces
CREATE TABLE workspaces (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text,
  owner_user_id uuid      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_owner ON workspaces(owner_user_id);

-- 3. Add workspace_id to projects (nullable, no cascade delete)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_workspace ON projects(workspace_id) WHERE workspace_id IS NOT NULL;

-- 4. Drop org_id from projects (no longer needed)
ALTER TABLE projects DROP COLUMN IF EXISTS org_id;

-- 5. agent_invites had org_id — make it nullable / remove org coupling
ALTER TABLE agent_invites DROP COLUMN IF EXISTS org_id;
