-- Migration 069: Drop legacy intent CHECK constraint
-- The intents JSONB array (migration 068) is now the source of truth.
-- API-layer validation enforces the new intent model (request/response/thinking
-- + optional not_handled/handled_incorrectly modifier).
-- The old CHECK constraint only allowed the 9 legacy intent values and blocks
-- insertion of new intent types, so it is removed here.
-- The legacy intent VARCHAR column is kept for backward compat but no longer
-- constrained at the DB level.

ALTER TABLE thread_messages DROP CONSTRAINT IF EXISTS thread_messages_intent_check;
