-- Add agent_briefing field to projects (freeform markdown: what this project is,
-- what tools are needed, how to execute tasks — read by agents on project_onboarded)
alter table projects add column if not exists agent_briefing text not null default '';
