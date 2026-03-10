-- 051_drop_unused_tables.sql
-- Drop tables superseded by the threads/notifications redesign and unused runs.
-- agent_chats       → replaced by threads + thread_participants
-- project_chat_messages → replaced by thread_messages
-- runs              → no API routes; premature, never used

DROP TABLE IF EXISTS agent_chats CASCADE;
DROP TABLE IF EXISTS project_chat_messages CASCADE;
DROP TABLE IF EXISTS runs CASCADE;
