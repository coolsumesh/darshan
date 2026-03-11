CREATE TABLE IF NOT EXISTS llm_usage_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_key    text NOT NULL,
  thread_id      uuid REFERENCES threads(thread_id) ON DELETE SET NULL,
  agent_id       uuid REFERENCES agents(id) ON DELETE SET NULL,
  model          text NOT NULL DEFAULT 'unknown',
  tokens_delta   integer NOT NULL DEFAULT 0,
  tokens_total   integer NOT NULL DEFAULT 0,
  context_tokens integer,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_llm_usage_thread    ON llm_usage_events(thread_id);
CREATE INDEX idx_llm_usage_agent     ON llm_usage_events(agent_id);
CREATE INDEX idx_llm_usage_recorded  ON llm_usage_events(recorded_at DESC);
