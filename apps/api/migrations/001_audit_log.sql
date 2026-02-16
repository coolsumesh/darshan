-- Minimal DB bootstrap for Darshan API (MVP)

create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,

  actor_type text not null check (actor_type in ('human','agent','system')),
  actor_user_id text,
  actor_agent_id uuid,

  action text not null,

  resource_type text not null,
  resource_id text not null,

  thread_id uuid,
  run_id uuid,

  decision text check (decision in ('allow','block','error')),
  reason text,

  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),

  constraint audit_actor_check check (
    (actor_type = 'human' and actor_user_id is not null and actor_agent_id is null)
    or
    (actor_type = 'agent' and actor_agent_id is not null and actor_user_id is null)
    or
    (actor_type = 'system' and actor_user_id is null and actor_agent_id is null)
  )
);

create index if not exists audit_log_created_at_idx on audit_log (created_at desc);
create index if not exists audit_log_action_created_at_idx on audit_log (action, created_at desc);
create index if not exists audit_log_thread_created_at_idx on audit_log (thread_id, created_at desc);
create index if not exists audit_log_run_created_at_idx on audit_log (run_id, created_at desc);
