CREATE TABLE IF NOT EXISTS thread_reply_policy (
  thread_id UUID PRIMARY KEY REFERENCES threads(thread_id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'all' CHECK (mode IN ('all', 'restricted')),
  allowed_participant_ids UUID[] NOT NULL DEFAULT '{}',
  next_message_limit INTEGER NULL CHECK (next_message_limit IS NULL OR next_message_limit >= 0),
  expires_at TIMESTAMPTZ NULL,
  updated_by UUID NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_reply_policy_mode
  ON thread_reply_policy(mode)
  WHERE mode = 'restricted';
