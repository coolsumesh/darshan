-- Add attachment metadata support for thread messages
ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Helpful for attachment-presence filtering
CREATE INDEX IF NOT EXISTS idx_thread_messages_attachments_gin
  ON thread_messages USING gin (attachments);
