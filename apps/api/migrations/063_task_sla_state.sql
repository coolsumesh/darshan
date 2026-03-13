CREATE TABLE IF NOT EXISTS task_sla_state (
  thread_id UUID PRIMARY KEY REFERENCES threads(thread_id) ON DELETE CASCADE,
  pickup_due_at TIMESTAMPTZ NULL,
  progress_due_at TIMESTAMPTZ NULL,
  last_progress_at TIMESTAMPTZ NULL,
  last_event_type TEXT NULL,
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  stale_reason TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_task_sla_pickup_due
  ON task_sla_state(pickup_due_at)
  WHERE pickup_due_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_task_sla_progress_due
  ON task_sla_state(progress_due_at)
  WHERE progress_due_at IS NOT NULL;
