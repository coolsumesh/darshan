-- Add 'review' status to tasks (Monday.com-style board)
DO $$ BEGIN
  ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
  ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
    CHECK (status IN ('proposed', 'approved', 'in-progress', 'review', 'done'));
END $$;
