-- Migration 041: Human <-> agent chat thread mapping

create table if not exists agent_chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  agent_id uuid not null references agents(id) on delete cascade,
  thread_id uuid not null references threads(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, agent_id)
);

create index if not exists idx_agent_chats_user on agent_chats(user_id);
create index if not exists idx_agent_chats_agent on agent_chats(agent_id);
