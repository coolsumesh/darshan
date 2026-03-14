-- Add attachments support for thread messages
ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
