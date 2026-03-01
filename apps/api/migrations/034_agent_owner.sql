-- Migration 034: Add owner_user_id to agents
-- Tracks which human user created/owns each agent (personal registry model).

ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- Backfill from org_agent_contributions where possible
UPDATE agents a SET owner_user_id = (
  SELECT contributed_by FROM org_agent_contributions
  WHERE agent_id = a.id LIMIT 1
) WHERE owner_user_id IS NULL;
