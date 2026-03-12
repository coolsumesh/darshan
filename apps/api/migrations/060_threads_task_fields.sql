ALTER TABLE threads
  ADD COLUMN IF NOT EXISTS assignee_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('high', 'medium', 'normal', 'low')),
  ADD COLUMN IF NOT EXISTS task_status TEXT
    CHECK (task_status IN ('proposed', 'approved', 'in-progress', 'review', 'blocked')),
  ADD COLUMN IF NOT EXISTS completion_note TEXT,
  ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS done_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS done_by_agent_id UUID REFERENCES agents(id) ON DELETE SET NULL;

ALTER TABLE threads
  DROP CONSTRAINT IF EXISTS threads_thread_type_check;

ALTER TABLE threads
  ADD CONSTRAINT threads_thread_type_check
    CHECK (thread_type IN ('conversation', 'feature', 'level_test', 'dm', 'task'));

CREATE INDEX IF NOT EXISTS idx_threads_thread_type ON threads(thread_type);
CREATE INDEX IF NOT EXISTS idx_threads_task_status ON threads(task_status) WHERE thread_type = 'task';
CREATE INDEX IF NOT EXISTS idx_threads_assignee_agent ON threads(assignee_agent_id) WHERE assignee_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_threads_assignee_user ON threads(assignee_user_id) WHERE assignee_user_id IS NOT NULL;
