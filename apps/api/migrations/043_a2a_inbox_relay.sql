-- 043: A2A relay columns on agent_inbox
-- Adds structured routing fields so agents can send typed messages to each other
-- via Darshan without depending on Telegram or any external transport.

ALTER TABLE agent_inbox
  ADD COLUMN IF NOT EXISTS from_agent_id     UUID REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS corr_id           TEXT,          -- correlation ID (caller assigns or we generate)
  ADD COLUMN IF NOT EXISTS reply_to_corr_id  TEXT,          -- set when this is a reply to a previous message
  ADD COLUMN IF NOT EXISTS thread_id         TEXT;          -- optional conversation thread grouping

CREATE INDEX IF NOT EXISTS idx_agent_inbox_corr_id          ON agent_inbox (corr_id)          WHERE corr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_inbox_reply_to_corr_id ON agent_inbox (reply_to_corr_id) WHERE reply_to_corr_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_inbox_from_agent_id    ON agent_inbox (from_agent_id)    WHERE from_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_inbox_thread_id        ON agent_inbox (thread_id)        WHERE thread_id IS NOT NULL;
