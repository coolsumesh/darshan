-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 059: Add read_receipt denormalization to thread_messages
-- ─────────────────────────────────────────────────────────────────────────────
-- Adds a read_receipt JSONB column to thread_messages that stores an aggregated
-- summary of receipt counts, eliminating the need for JOIN on thread_message_receipts.
-- A trigger keeps this column in sync as receipts are created/updated.

-- Add the denormalized receipt summary column
ALTER TABLE thread_messages
ADD COLUMN read_receipt JSONB DEFAULT jsonb_build_object(
  'total_recipients', 0,
  'sent_count', 0,
  'delivered_count', 0,
  'read_count', 0,
  'all_sent', false,
  'all_delivered', false,
  'all_read', false
);

-- Create an index on read_receipt for potential future optimizations
CREATE INDEX idx_thread_messages_read_receipt ON thread_messages USING GIN (read_receipt);

-- ──────────────────────────────────────────────────────────────────────────
-- Trigger: Update parent message read_receipt on receipt changes
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_thread_message_read_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_message_id UUID;
  v_total INT;
  v_sent INT;
  v_delivered INT;
  v_read INT;
BEGIN
  -- Get the message_id from the receipt row
  v_message_id := COALESCE(NEW.message_id, OLD.message_id);

  -- Aggregate receipt counts for this message
  SELECT
    count(*)::int,
    count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read'))::int,
    count(*) FILTER (WHERE status IN ('delivered', 'read'))::int,
    count(*) FILTER (WHERE status = 'read')::int
  INTO v_total, v_sent, v_delivered, v_read
  FROM thread_message_receipts
  WHERE message_id = v_message_id;

  -- Update the message's read_receipt column
  UPDATE thread_messages
  SET read_receipt = jsonb_build_object(
    'total_recipients', v_total,
    'sent_count', v_sent,
    'delivered_count', v_delivered,
    'read_count', v_read,
    'all_sent', v_total > 0 AND v_sent = v_total,
    'all_delivered', v_total > 0 AND v_delivered = v_total,
    'all_read', v_total > 0 AND v_read = v_total
  )
  WHERE message_id = v_message_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS trg_update_thread_message_read_receipt ON thread_message_receipts;

-- Create trigger on INSERT or UPDATE
CREATE TRIGGER trg_update_thread_message_read_receipt
AFTER INSERT OR UPDATE ON thread_message_receipts
FOR EACH ROW
EXECUTE FUNCTION update_thread_message_read_receipt();

-- ──────────────────────────────────────────────────────────────────────────
-- Backfill: Populate read_receipt for all existing messages
-- ──────────────────────────────────────────────────────────────────────────
WITH receipt_summaries AS (
  SELECT
    message_id,
    count(*)::int AS total_recipients,
    count(*) FILTER (WHERE status IN ('sent', 'delivered', 'read'))::int AS sent_count,
    count(*) FILTER (WHERE status IN ('delivered', 'read'))::int AS delivered_count,
    count(*) FILTER (WHERE status = 'read')::int AS read_count
  FROM thread_message_receipts
  GROUP BY message_id
)
UPDATE thread_messages tm
SET read_receipt = jsonb_build_object(
  'total_recipients', COALESCE(rs.total_recipients, 0),
  'sent_count', COALESCE(rs.sent_count, 0),
  'delivered_count', COALESCE(rs.delivered_count, 0),
  'read_count', COALESCE(rs.read_count, 0),
  'all_sent', COALESCE(rs.total_recipients, 0) > 0 AND COALESCE(rs.sent_count, 0) = COALESCE(rs.total_recipients, 0),
  'all_delivered', COALESCE(rs.total_recipients, 0) > 0 AND COALESCE(rs.delivered_count, 0) = COALESCE(rs.total_recipients, 0),
  'all_read', COALESCE(rs.total_recipients, 0) > 0 AND COALESCE(rs.read_count, 0) = COALESCE(rs.total_recipients, 0)
)
FROM receipt_summaries rs
WHERE tm.message_id = rs.message_id;
