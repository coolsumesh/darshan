-- Migration 026: Task activity log
-- Tracks who performed each action on a task (create, status change, assignment).
create table task_activity (
  id          uuid        primary key default gen_random_uuid(),
  task_id     uuid        not null references tasks(id) on delete cascade,
  project_id  uuid        not null references projects(id) on delete cascade,
  actor_name  text        not null default 'System',
  actor_type  text        not null default 'system'
              check (actor_type in ('human', 'agent', 'system')),
  action      text        not null
              check (action in ('created', 'status_changed', 'assigned')),
  from_value  text,
  to_value    text,
  created_at  timestamptz not null default now()
);

create index task_activity_task_idx    on task_activity(task_id,    created_at asc);
create index task_activity_project_idx on task_activity(project_id, created_at desc);
