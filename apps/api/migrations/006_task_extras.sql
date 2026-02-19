-- Add type and estimated story points to tasks (Monday.com-style table view)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'Task',
  ADD COLUMN IF NOT EXISTS estimated_sp integer NOT NULL DEFAULT 0;
