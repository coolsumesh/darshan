-- Migration 039: Align schema with confirmed data model
-- Agents are user-owned (owner_user_id). Orgs and Projects are independent.
-- org_agents = contribution record only (no role).
-- project_agents = assignment record only (no role).
-- Valid membership roles: admin / contributor / viewer (no 'owner', no 'member').

-- 1. Drop agents.org_id — agents are user-owned, not org-owned
ALTER TABLE agents DROP COLUMN IF EXISTS org_id;

-- 2. Drop org_agents.role — contribution records have no role
ALTER TABLE org_agents DROP COLUMN IF EXISTS role;

-- 3. Fix org_users.role — remove 'owner' (ownership lives in organisations.owner_user_id)
--    Drop constraint first so UPDATE can proceed freely
ALTER TABLE org_users DROP CONSTRAINT IF EXISTS org_users_role_check;
UPDATE org_users SET role = 'admin' WHERE role = 'owner';
ALTER TABLE org_users ADD CONSTRAINT org_users_role_check
  CHECK (role IN ('admin', 'contributor', 'viewer'));

-- 4. Fix project_users.role — align with org_users roles
--    Drop constraint first so UPDATEs can proceed freely
ALTER TABLE project_users DROP CONSTRAINT IF EXISTS project_users_role_check;
UPDATE project_users SET role = 'admin'       WHERE role = 'owner';
UPDATE project_users SET role = 'contributor' WHERE role = 'member';
ALTER TABLE project_users ADD CONSTRAINT project_users_role_check
  CHECK (role IN ('admin', 'contributor', 'viewer'));

-- 5. Drop project_agents.role — assignment records have no role
ALTER TABLE project_agents DROP COLUMN IF EXISTS role;
