-- Migration 059: Align project_invites roles with project_users roles
-- Old invite rows could contain role='member' (legacy). Map them to contributor.

UPDATE project_invites
SET role = 'contributor'
WHERE role = 'member';

ALTER TABLE project_invites
  DROP CONSTRAINT IF EXISTS project_invites_role_check;

ALTER TABLE project_invites
  ADD CONSTRAINT project_invites_role_check
  CHECK (role IN ('admin', 'contributor', 'viewer'));
