-- Core data model: agents, threads, thread_participants, messages, runs, a2a_routes
-- Aligned with DB.md (does not alter audit_log to avoid FK issues with existing data)

-- ─────────────────────────────────────────────────────────────────────────────
-- agents
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists agents (
  id             uuid        primary key default gen_random_uuid(),
  name           text        not null,
  status         text        not null default 'unknown'
                             check (status in ('online','offline','unknown')),
  capabilities   jsonb       not null default '{}',
  connector_ref  text        not null default '',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists agents_name_uq   on agents (lower(name));
create        index if not exists agents_status_idx on agents (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- threads
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists threads (
  id                  uuid        primary key default gen_random_uuid(),
  title               text,
  visibility          text        not null default 'private'
                                  check (visibility in ('private','shared')),
  created_by_user_id  text        not null,
  archived_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists threads_created_by_idx  on threads (created_by_user_id);
create index if not exists threads_created_at_idx  on threads (created_at desc);
create index if not exists threads_archived_at_idx on threads (archived_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- thread_participants  (ACL membership)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists thread_participants (
  id               uuid        primary key default gen_random_uuid(),
  thread_id        uuid        not null references threads(id) on delete cascade,

  participant_type text        not null check (participant_type in ('human','agent')),

  user_id          text,
  agent_id         uuid        references agents(id) on delete cascade,

  can_read         boolean     not null default true,
  can_write        boolean     not null default false,
  can_share        boolean     not null default false,

  created_at       timestamptz not null default now(),

  constraint thread_participants_exactly_one_actor check (
    (participant_type = 'human' and user_id  is not null and agent_id is null)
    or
    (participant_type = 'agent' and agent_id is not null and user_id  is null)
  )
);

create unique index if not exists thread_participants_thread_human_uq
  on thread_participants (thread_id, user_id)
  where participant_type = 'human';

create unique index if not exists thread_participants_thread_agent_uq
  on thread_participants (thread_id, agent_id)
  where participant_type = 'agent';

create index if not exists thread_participants_thread_idx on thread_participants (thread_id);
create index if not exists thread_participants_user_idx   on thread_participants (user_id)   where participant_type = 'human';
create index if not exists thread_participants_agent_idx  on thread_participants (agent_id)  where participant_type = 'agent';

-- ─────────────────────────────────────────────────────────────────────────────
-- messages
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists messages (
  id              uuid        primary key default gen_random_uuid(),
  seq             bigint      generated always as identity,

  thread_id       uuid        not null references threads(id) on delete cascade,

  author_type     text        not null check (author_type in ('human','agent','system')),
  author_user_id  text,
  author_agent_id uuid        references agents(id) on delete set null,

  content         text        not null,
  payload         jsonb       not null default '{}',

  run_id          uuid,       -- soft ref to runs; FK added after runs table below

  created_at      timestamptz not null default now(),

  constraint messages_author_check check (
    (author_type = 'human'  and author_user_id  is not null and author_agent_id is null)
    or
    (author_type = 'agent'  and author_agent_id is not null and author_user_id  is null)
    or
    (author_type = 'system' and author_user_id  is null     and author_agent_id is null)
  )
);

create index if not exists messages_thread_seq_idx        on messages (thread_id, seq desc);
create index if not exists messages_thread_created_at_idx on messages (thread_id, created_at desc);
create index if not exists messages_run_id_idx            on messages (run_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- runs  (agent invocations)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists runs (
  id                    uuid        primary key default gen_random_uuid(),
  seq                   bigint      generated always as identity,

  thread_id             uuid        not null references threads(id)  on delete cascade,

  requested_by_type     text        not null check (requested_by_type in ('human','agent')),
  requested_by_user_id  text,
  requested_by_agent_id uuid        references agents(id) on delete set null,

  target_agent_id       uuid        not null references agents(id)   on delete restrict,

  status                text        not null default 'queued'
                                    check (status in ('queued','running','succeeded','failed','canceled','timeout')),

  input_message_id      uuid        references messages(id) on delete set null,

  trace_id              uuid,
  parent_run_id         uuid        references runs(id) on delete set null,
  delegation_path       jsonb       not null default '[]',
  idempotency_key       text,

  started_at            timestamptz,
  ended_at              timestamptz,

  error_code            text,
  error_message         text,
  output_summary        jsonb       not null default '{}',

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint runs_requested_by_check check (
    (requested_by_type = 'human' and requested_by_user_id  is not null and requested_by_agent_id is null)
    or
    (requested_by_type = 'agent' and requested_by_agent_id is not null and requested_by_user_id  is null)
  )
);

create index if not exists runs_thread_seq_idx      on runs (thread_id, seq desc);
create index if not exists runs_target_status_idx   on runs (target_agent_id, status);
create index if not exists runs_parent_idx          on runs (parent_run_id);

create unique index if not exists runs_idempotency_uq on runs (idempotency_key)
  where idempotency_key is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- a2a_routes  (agent↔agent delegation policies)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists a2a_routes (
  id            uuid        primary key default gen_random_uuid(),

  from_agent_id uuid        not null references agents(id) on delete cascade,
  to_agent_id   uuid        not null references agents(id) on delete cascade,

  policy        text        not null check (policy in ('allowed','blocked','requires_human_approval')),

  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint a2a_routes_no_self check (from_agent_id <> to_agent_id)
);

create unique index if not exists a2a_routes_pair_uq on a2a_routes (from_agent_id, to_agent_id);
create        index if not exists a2a_routes_to_idx  on a2a_routes (to_agent_id);
