-- 050_drop_agent_inbox.sql
-- agent_inbox is retired. Delivery now goes through:
--   messages → notifications (for threads)
--   WS push              (for ping + task_assigned)
--   POST /agents response (for welcome)

-- Add last_ping_sent_at to agents so the pong endpoint can compute round-trip
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_ping_sent_at timestamptz;

DROP TABLE IF EXISTS agent_inbox CASCADE;
