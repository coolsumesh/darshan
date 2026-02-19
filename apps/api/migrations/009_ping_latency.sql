-- Migration 009: ping latency + assigned projects for agents

-- Track round-trip ping latency (milliseconds)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_ping_ms integer;

-- Ensure project_team has a created_at for "assigned since"
ALTER TABLE project_team ADD COLUMN IF NOT EXISTS assigned_at timestamptz DEFAULT now();
