-- Tasks: agent-proposed, human-approved sprint items
-- Status flow: proposed → approved → in_progress → done | rejected

create table if not exists tasks (
  id               uuid        primary key default gen_random_uuid(),
  seq              bigint      generated always as identity,

  title            text        not null,
  description      text        not null default '',

  status           text        not null default 'proposed'
                               check (status in ('proposed','approved','in_progress','done','rejected')),

  -- Who proposed it (agent or human)
  proposed_by_type text        not null check (proposed_by_type in ('human','agent')),
  proposed_by_user_id  text,
  proposed_by_agent_id uuid    references agents(id) on delete set null,

  -- Who claimed/is working on it
  claimed_by_agent_id  uuid    references agents(id) on delete set null,

  -- Approval metadata
  approved_at      timestamptz,
  rejected_at      timestamptz,
  rejection_reason text,

  -- Completion
  completed_at     timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint tasks_proposed_by_check check (
    (proposed_by_type = 'human' and proposed_by_user_id  is not null and proposed_by_agent_id is null)
    or
    (proposed_by_type = 'agent' and proposed_by_agent_id is not null and proposed_by_user_id  is null)
  )
);

create index if not exists tasks_status_idx      on tasks (status);
create index if not exists tasks_seq_idx         on tasks (seq desc);
create index if not exists tasks_claimed_by_idx  on tasks (claimed_by_agent_id) where claimed_by_agent_id is not null;
create index if not exists tasks_proposed_by_agent_idx on tasks (proposed_by_agent_id) where proposed_by_agent_id is not null;
