-- 066_thread_outbox_and_receipts.sql
-- Durable event outbox + per-recipient message receipts

CREATE TABLE IF NOT EXISTS thread_event_outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  thread_id uuid NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|published|failed|dead_letter
  publish_attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_thread_event_outbox_pending
  ON thread_event_outbox(status, created_at)
  WHERE status IN ('pending','failed');

CREATE TABLE IF NOT EXISTS thread_message_receipts (
  message_id uuid NOT NULL REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  recipient_slug text NOT NULL,
  status text NOT NULL DEFAULT 'sent', -- sent|delivered|read
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_thread_message_receipts_message
  ON thread_message_receipts(message_id);

CREATE INDEX IF NOT EXISTS idx_thread_message_receipts_recipient
  ON thread_message_receipts(recipient_id, status);
