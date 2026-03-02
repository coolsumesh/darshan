-- Add platform field to agents (what runtime/framework the agent runs on)
alter table agents add column if not exists platform text not null default 'openclaw';
