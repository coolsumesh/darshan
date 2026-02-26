-- Migration 016: fix agent_invites FK to cascade on agent delete
-- Ensures deleting an agent also removes their invite records
ALTER TABLE agent_invites
  DROP CONSTRAINT IF EXISTS agent_invites_agent_id_fkey,
  ADD CONSTRAINT agent_invites_agent_id_fkey
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE;
