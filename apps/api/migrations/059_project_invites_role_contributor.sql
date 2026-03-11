-- Migration 059: Align project_invites roles with project_users roles
-- DROP constraint first, then backfill, then re-add with updated values

ALTER TABLE project_invites
  DROP CONSTRAINT IF EXISTS project_invites_role_check;

UPDATE project_invites
SET role = 'contributor'
WHERE role = 'member';

ALTER TABLE project_invites
  ADD CONSTRAINT project_invites_role_check
  CHECK (role IN ('admin', 'contributor', 'viewer'));

INSERT INTO schema_migrations (id, applied_at) VALUES ('059_project_invites_role_contributor.sql', NOW())
  ON CONFLICT (id) DO NOTHING;
