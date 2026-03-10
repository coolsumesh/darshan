-- 052_drop_agent_invites.sql
-- No routes, no onboarding flow uses it. Dead table.
DROP TABLE IF EXISTS agent_invites CASCADE;
