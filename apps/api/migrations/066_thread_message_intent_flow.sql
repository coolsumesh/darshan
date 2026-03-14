-- 066_thread_message_intent_flow.sql
-- Adds intent-first flow metadata to thread_messages.

ALTER TABLE thread_messages
  ADD COLUMN IF NOT EXISTS intent text,
  ADD COLUMN IF NOT EXISTS intent_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS awaiting_on text,
  ADD COLUMN IF NOT EXISTS next_expected_from text;

UPDATE thread_messages
SET intent = CASE
  WHEN type = 'event' THEN 'status_update'
  ELSE 'answer'
END
WHERE intent IS NULL;

UPDATE thread_messages
SET awaiting_on = 'none'
WHERE awaiting_on IS NULL;

ALTER TABLE thread_messages
  ALTER COLUMN intent SET NOT NULL,
  ALTER COLUMN awaiting_on SET NOT NULL;

ALTER TABLE thread_messages
  ADD CONSTRAINT thread_messages_intent_check
    CHECK (intent IN (
      'greeting',
      'question',
      'answer',
      'suggest',
      'work_confirmation',
      'status_update',
      'review_request',
      'blocked',
      'closure'
    )),
  ADD CONSTRAINT thread_messages_awaiting_on_check
    CHECK (awaiting_on IN ('user', 'agent', 'none')),
  ADD CONSTRAINT thread_messages_intent_confidence_check
    CHECK (intent_confidence IS NULL OR (intent_confidence >= 0 AND intent_confidence <= 1));

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread_sent_intent
  ON thread_messages(thread_id, sent_at, intent);
