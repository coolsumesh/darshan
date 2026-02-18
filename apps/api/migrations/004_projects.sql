-- Projects: top-level container for Sprint Board, Tasks, Feedback Threads
-- Agent Registry remains global (agents can participate in multiple projects)

create table if not exists projects (
  id          uuid        primary key default gen_random_uuid(),
  seq         bigint      generated always as identity,
  name        text        not null,
  description text        not null default '',
  status      text        not null default 'active'
                          check (status in ('active', 'archived')),
  created_by  text        not null,   -- user_id
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists projects_name_uq  on projects (lower(name));
create        index if not exists projects_status_idx on projects (status);

-- Project members: which agents are participating in a project
create table if not exists project_members (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null references projects(id) on delete cascade,
  agent_id   uuid        not null references agents(id)   on delete cascade,
  joined_at  timestamptz not null default now(),
  constraint project_members_uq unique (project_id, agent_id)
);

create index if not exists project_members_project_idx on project_members (project_id);
create index if not exists project_members_agent_idx   on project_members (agent_id);

-- Scope tasks to a project (add project_id column)
alter table tasks
  add column if not exists project_id uuid references projects(id) on delete cascade;

create index if not exists tasks_project_idx on tasks (project_id);

-- Scope threads to a project (optional — threads can be project-scoped or global)
alter table threads
  add column if not exists project_id uuid references projects(id) on delete set null;

create index if not exists threads_project_idx on threads (project_id) where project_id is not null;

-- Seed: create the Darshan project as project #1
insert into projects (name, description, created_by)
values ('Darshan', 'The MithranLabs agent collaboration hub — project #1.', 'sumesh')
on conflict do nothing;
