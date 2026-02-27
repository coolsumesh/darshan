-- Migration 022: Project user membership (human collaboration)
-- Allows multiple users to access the same project with different roles.

create table if not exists project_user_members (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  user_id     uuid not null references users(id)    on delete cascade,
  role        text not null default 'member'         check (role in ('owner', 'admin', 'member')),
  invited_by  uuid references users(id)             on delete set null,
  joined_at   timestamptz not null default now(),
  unique (project_id, user_id)
);

create index if not exists project_user_members_project_idx on project_user_members(project_id);
create index if not exists project_user_members_user_idx    on project_user_members(user_id);
