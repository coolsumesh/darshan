-- Projects, tasks, and project team membership

-- ─────────────────────────────────────────────────────────────────────────────
-- projects
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists projects (
  id           uuid        primary key default gen_random_uuid(),
  slug         text        not null,
  name         text        not null,
  description  text        not null default '',
  status       text        not null default 'active'
               check (status in ('active', 'review', 'planned', 'archived')),
  progress     int         not null default 0 check (progress between 0 and 100),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists projects_slug_uq on projects (lower(slug));

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists tasks (
  id           uuid        primary key default gen_random_uuid(),
  project_id   uuid        not null references projects(id) on delete cascade,
  title        text        not null,
  description  text        not null default '',
  status       text        not null default 'proposed'
               check (status in ('proposed', 'approved', 'in-progress', 'done')),
  proposer     text,
  assignee     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists tasks_project_id_idx on tasks (project_id);
create index if not exists tasks_status_idx     on tasks (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- project_team  (agents assigned to a project)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists project_team (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references projects(id) on delete cascade,
  agent_id   uuid        not null references agents(id)   on delete cascade,
  role       text        not null default 'Member',
  joined_at  timestamptz not null default now(),
  constraint project_team_uq unique (project_id, agent_id)
);

create index if not exists project_team_project_idx on project_team (project_id);
create index if not exists project_team_agent_idx   on project_team (agent_id);
