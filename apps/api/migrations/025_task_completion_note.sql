-- Migration 025: Add completion_note to tasks
-- Stores a free-text summary of what was done, shown when task is in review or done.
alter table tasks add column if not exists completion_note text;
