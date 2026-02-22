-- Migration 015: add 'active' to agents status constraint
ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_status_check;
ALTER TABLE agents ADD CONSTRAINT agents_status_check
  CHECK (status = ANY(ARRAY['online','offline','unknown','active']));
