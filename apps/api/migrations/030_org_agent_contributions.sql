-- Migration 030: Contributed agents — contributors can lend agents to orgs
-- Agent ownership stays in agents.org_id; this table tracks lending relationships

create table if not exists org_agent_contributions (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references organisations(id) on delete cascade,
  agent_id        uuid not null references agents(id) on delete cascade,
  contributed_by  uuid not null references users(id),
  status          text not null default 'active' check (status in ('active', 'withdrawn')),
  created_at      timestamptz default now(),
  unique (org_id, agent_id)
);

create index if not exists idx_oac_org   on org_agent_contributions(org_id);
create index if not exists idx_oac_agent on org_agent_contributions(agent_id);
create index if not exists idx_oac_user  on org_agent_contributions(contributed_by);
