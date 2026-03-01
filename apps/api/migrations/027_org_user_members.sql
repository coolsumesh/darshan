-- Migration 027: Org user members
-- Links users directly to organisations, granting access to all org-owned projects.
-- Separate from org_members (which links agents to orgs).
-- External guests who need only project-level access use project_user_members instead.
create table org_user_members (
  id         uuid        primary key default gen_random_uuid(),
  org_id     uuid        not null references organisations(id) on delete cascade,
  user_id    uuid        not null references users(id) on delete cascade,
  role       text        not null default 'member'
             check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index org_user_members_org_idx  on org_user_members(org_id);
create index org_user_members_user_idx on org_user_members(user_id);
