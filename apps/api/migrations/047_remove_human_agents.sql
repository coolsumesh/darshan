-- 047: Remove human agents from agents table
-- Humans belong in the users table only. The agents table is for AI agents.
-- Core schema (002) already correctly separates humans (user_id) from agents
-- (agent_id) in thread_participants, messages, runs, etc.
-- The only violation was auth.ts auto-creating a 'human' row in agents on login.

-- 1. Delete all human agent rows (no FK references exist)
DELETE FROM agents WHERE agent_type = 'human';

-- 2. Tighten constraint — agents table is AI only
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_agent_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type = 'ai_agent');

-- 3. Set default explicitly
ALTER TABLE agents ALTER COLUMN agent_type SET DEFAULT 'ai_agent';

-- 4. Drop user_id column — AI agents are owned via owner_user_id, not user_id
-- (owner_user_id = who created/owns the agent; user_id was the human-agent link)
ALTER TABLE agents DROP COLUMN IF EXISTS user_id;
