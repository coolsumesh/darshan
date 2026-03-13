CREATE TABLE IF NOT EXISTS thread_next_reply (
  thread_id UUID PRIMARY KEY REFERENCES threads(thread_id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'any' CHECK (mode IN ('any', 'all')),
  pending_participant_ids UUID[] NOT NULL DEFAULT '{}',
  reason TEXT NULL,
  set_by UUID NULL,
  set_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NULL,
  cleared_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_thread_next_reply_active
  ON thread_next_reply(cleared_at, expires_at);

ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS has_reply_pending BOOLEAN NOT NULL DEFAULT false;

UPDATE threads t
SET has_reply_pending = EXISTS (
  SELECT 1
  FROM thread_next_reply tnr
  WHERE tnr.thread_id = t.thread_id
    AND tnr.cleared_at IS NULL
    AND cardinality(tnr.pending_participant_ids) > 0
);
