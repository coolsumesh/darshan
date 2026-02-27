-- 021_agent_user_link: link agents to their owning user account
alter table agents
  add column if not exists user_id uuid references users(id) on delete set null;

create index if not exists agents_user_id_idx on agents(user_id);
