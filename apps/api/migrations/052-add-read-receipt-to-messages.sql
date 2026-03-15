-- Add read_receipt to thread_messages to avoid JOIN/GROUP BY on every query
ALTER TABLE thread_messages
ADD COLUMN read_receipt JSONB DEFAULT NULL;

-- Create index for faster queries
CREATE INDEX idx_thread_messages_thread_id_sent_at ON thread_messages(thread_id, sent_at DESC);

-- Backfill existing messages with their current receipt summaries
UPDATE thread_messages tm
SET read_receipt = (
  SELECT jsonb_build_object(
    'total_recipients', COUNT(*),
    'sent_count', COUNT(*),
    'delivered_count', COUNT(*) FILTER (WHERE status IN ('delivered', 'read')),
    'read_count', COUNT(*) FILTER (WHERE status = 'read'),
    'all_sent', true,
    'all_delivered', COUNT(*) = COUNT(*) FILTER (WHERE status IN ('delivered', 'read')),
    'all_read', COUNT(*) = COUNT(*) FILTER (WHERE status = 'read')
  )
  FROM thread_message_receipts
  WHERE message_id = tm.message_id
)
WHERE tm.message_id IN (
  SELECT DISTINCT message_id FROM thread_message_receipts
);

-- For messages with no receipts, set default
UPDATE thread_messages
SET read_receipt = jsonb_build_object(
  'total_recipients', 0,
  'sent_count', 0,
  'delivered_count', 0,
  'read_count', 0,
  'all_sent', false,
  'all_delivered', false,
  'all_read', false
)
WHERE read_receipt IS NULL;
