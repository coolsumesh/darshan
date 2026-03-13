-- Migration 058: LLM usage tracking
-- Tracks per-message token cost from OpenClaw sessions

CREATE TABLE IF NOT EXISTS llm_usage_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key   TEXT        NOT NULL,
  thread_id     UUID        REFERENCES threads(id) ON DELETE SET NULL,
  agent_id      UUID        REFERENCES agents(id)  ON DELETE SET NULL,
  model         TEXT        NOT NULL DEFAULT 'unknown',
  tokens_delta  INTEGER     NOT NULL DEFAULT 0,
  tokens_total  INTEGER     NOT NULL DEFAULT 0,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_agent      ON llm_usage_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_thread     ON llm_usage_events(thread_id);
CREATE INDEX IF NOT EXISTS idx_llm_usage_recorded   ON llm_usage_events(recorded_at);
CREATE INDEX IF NOT EXISTS idx_llm_usage_session    ON llm_usage_events(session_key);

INSERT INTO schema_migrations (id, applied_at) VALUES ('058_llm_usage', NOW())
  ON CONFLICT (id) DO NOTHING;
