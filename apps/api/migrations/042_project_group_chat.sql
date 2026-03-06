-- Migration 042: Project group chat messages (MVP)

create table if not exists project_chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  author_type text not null check (author_type in ('human', 'agent', 'system')),
  author_user_id uuid references users(id) on delete set null,
  author_agent_id uuid references agents(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_chat_messages_project_created
  on project_chat_messages(project_id, created_at desc);
