-- 019_slug_per_user_unique: scope slug uniqueness per user instead of globally
-- This lets two different users each have an org/project with the same slug.

-- Projects: drop global unique index, add per-user unique index
drop index if exists projects_slug_uq;
create unique index if not exists projects_slug_owner_uq
  on projects (lower(slug), owner_user_id);

-- Organisations: drop global unique constraint, add per-user unique index
alter table organisations drop constraint if exists organisations_slug_key;
create unique index if not exists orgs_slug_owner_uq
  on organisations (lower(slug), owner_user_id);
