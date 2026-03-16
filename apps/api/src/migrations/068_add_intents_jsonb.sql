-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 068: Add intents JSONB array to thread_messages
-- ─────────────────────────────────────────────────────────────────────────────
-- Replaces single intent string with flexible JSONB array to support multiple
-- intents per message (e.g., ["answer", "question", "blocked"]).

-- Add new intents column (JSONB array)
ALTER TABLE thread_messages
ADD COLUMN intents JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for fast intent filtering
CREATE INDEX idx_thread_messages_intents 
ON thread_messages USING GIN(intents);

-- ──────────────────────────────────────────────────────────────────────────
-- Backfill: Convert existing single intent strings to JSONB arrays
-- ──────────────────────────────────────────────────────────────────────────
-- For messages with existing intent, wrap in array
UPDATE thread_messages
SET intents = CASE 
  WHEN intent IS NOT NULL AND intent != '' THEN jsonb_build_array(intent)
  ELSE '[]'::jsonb
END
WHERE intents = '[]'::jsonb;

-- ──────────────────────────────────────────────────────────────────────────
-- Drop old intent column (keep for backward compatibility during transition)
-- Uncomment after verifying intents column is working:
-- ALTER TABLE thread_messages DROP COLUMN intent;
-- ──────────────────────────────────────────────────────────────────────────
