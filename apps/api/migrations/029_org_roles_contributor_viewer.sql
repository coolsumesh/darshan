-- Migration 029: rename 'member' → 'contributor', add 'viewer' role for org user membership
-- Applies to org_user_members and org_user_invites only.
-- org_members (AI agents) keeps owner/admin/member — unaffected.

-- ── org_user_members ──────────────────────────────────────────────────────────
ALTER TABLE org_user_members DROP CONSTRAINT IF EXISTS org_user_members_role_check;
UPDATE org_user_members SET role = 'contributor' WHERE role = 'member';
ALTER TABLE org_user_members
  ADD CONSTRAINT org_user_members_role_check
  CHECK (role IN ('owner', 'admin', 'contributor', 'viewer'));

-- ── org_user_invites ──────────────────────────────────────────────────────────
ALTER TABLE org_user_invites DROP CONSTRAINT IF EXISTS org_user_invites_role_check;
UPDATE org_user_invites SET role = 'contributor' WHERE role = 'member';
ALTER TABLE org_user_invites
  ADD CONSTRAINT org_user_invites_role_check
  CHECK (role IN ('owner', 'admin', 'contributor', 'viewer'));
