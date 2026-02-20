-- Migration 012: Normalize agent_type to only 'ai_agent' | 'human'
-- All ai_* variants collapse to 'ai_agent'; anything else that isn't 'human' becomes 'ai_agent'.

UPDATE agents
SET agent_type = 'ai_agent'
WHERE agent_type NOT IN ('ai_agent', 'human');

-- Add check constraint
ALTER TABLE agents
  DROP CONSTRAINT IF EXISTS agents_agent_type_check;

ALTER TABLE agents
  ADD CONSTRAINT agents_agent_type_check
  CHECK (agent_type IN ('ai_agent', 'human'));

-- Also make agent_type not-null with default
ALTER TABLE agents
  ALTER COLUMN agent_type SET DEFAULT 'ai_agent';
