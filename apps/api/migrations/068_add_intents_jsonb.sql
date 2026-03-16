-- Migration 068: Add intents JSONB array to thread_messages
-- Replaces single intent string with flexible JSONB array to support multiple
-- intents per message (e.g., ["answer", "question", "blocked"]).

-- Add new intents column (JSONB array, default empty array)
ALTER TABLE thread_messages
ADD COLUMN IF NOT EXISTS intents JSONB DEFAULT '[]'::jsonb;

-- Create GIN index for fast intent filtering
CREATE INDEX IF NOT EXISTS idx_thread_messages_intents
ON thread_messages USING GIN(intents);

-- Backfill: Convert existing single intent strings to JSONB arrays
UPDATE thread_messages
SET intents = CASE
  WHEN intent IS NOT NULL AND intent != '' THEN jsonb_build_array(intent)
  ELSE '[]'::jsonb
END
WHERE intents = '[]'::jsonb;

-- Note: intent column kept for backward compatibility during transition.
-- Drop via separate migration after all clients migrated to intents array.
