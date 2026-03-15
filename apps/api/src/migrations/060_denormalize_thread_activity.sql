-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 060: Denormalize first_message and last_activity to threads table
-- ─────────────────────────────────────────────────────────────────────────────
-- Eliminates LATERAL subqueries by storing the first message body and last
-- activity timestamp directly on the threads table. Triggers keep these in sync.

-- Add denormalized columns to threads table
ALTER TABLE threads
ADD COLUMN first_message_body TEXT,
ADD COLUMN last_activity_at TIMESTAMPTZ;

-- Create indexes for ordering/filtering
CREATE INDEX idx_threads_last_activity_at ON threads (last_activity_at DESC NULLS LAST);
CREATE INDEX idx_threads_first_message_body ON threads USING GIN (to_tsvector('english', COALESCE(first_message_body, '')));

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: Update thread's first_message_body when first message is created
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_thread_first_message()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if this is the first message (or becomes the first message)
  IF NEW.type = 'message' THEN
    UPDATE threads
    SET first_message_body = NEW.body
    WHERE thread_id = NEW.thread_id
      AND first_message_body IS NULL;  -- Only set if not already set
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_thread_first_message ON thread_messages;
CREATE TRIGGER trg_update_thread_first_message
AFTER INSERT ON thread_messages
FOR EACH ROW
EXECUTE FUNCTION update_thread_first_message();

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: Update thread's last_activity_at when any message is created
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_thread_last_activity()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE threads
  SET last_activity_at = NEW.sent_at
  WHERE thread_id = NEW.thread_id
    AND (last_activity_at IS NULL OR NEW.sent_at > last_activity_at);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_thread_last_activity ON thread_messages;
CREATE TRIGGER trg_update_thread_last_activity
AFTER INSERT ON thread_messages
FOR EACH ROW
EXECUTE FUNCTION update_thread_last_activity();

-- ──────────────────────────────────────────────────────────────────────────
-- Backfill: Populate denormalized columns for all existing threads
-- ──────────────────────────────────────────────────────────────────────────
WITH first_messages AS (
  SELECT DISTINCT ON (thread_id)
    thread_id,
    body
  FROM thread_messages
  WHERE type = 'message'
  ORDER BY thread_id, sent_at ASC
),
last_activities AS (
  SELECT DISTINCT ON (thread_id)
    thread_id,
    sent_at
  FROM thread_messages
  ORDER BY thread_id, sent_at DESC
)
UPDATE threads t
SET 
  first_message_body = fm.body,
  last_activity_at = COALESCE(la.sent_at, t.created_at)
FROM first_messages fm
LEFT JOIN last_activities la ON la.thread_id = fm.thread_id
WHERE t.thread_id = fm.thread_id;
