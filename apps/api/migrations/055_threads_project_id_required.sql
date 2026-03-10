-- Migration 055: Make threads.project_id mandatory
-- Step 1: backfill any null project_id rows to the first known project
UPDATE threads
SET project_id = (SELECT id FROM projects ORDER BY created_at LIMIT 1)
WHERE project_id IS NULL;

-- Step 2: enforce NOT NULL
ALTER TABLE threads ALTER COLUMN project_id SET NOT NULL;

-- Step 3: add FK constraint if not already present
ALTER TABLE threads
  DROP CONSTRAINT IF EXISTS threads_project_id_fkey;
ALTER TABLE threads
  ADD CONSTRAINT threads_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;
