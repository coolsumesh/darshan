-- (agent_capability_evidence not in schema — skipped)

CREATE TEMP TABLE task_thread_migration_map (
  task_id UUID PRIMARY KEY,
  thread_id UUID NOT NULL
) ON COMMIT DROP;

INSERT INTO task_thread_migration_map (task_id, thread_id)
SELECT id, gen_random_uuid()
FROM tasks;

INSERT INTO threads (
  thread_id,
  project_id,
  subject,
  thread_type,
  status,
  assignee_agent_id,
  priority,
  task_status,
  completion_note,
  done_at,
  created_by,
  created_slug,
  created_at
)
SELECT
  map.thread_id,
  t.project_id,
  t.title,
  'task',
  CASE WHEN t.status = 'done' THEN 'closed' ELSE 'open' END,
  a.id,
  CASE
    WHEN lower(coalesce(t.priority, '')) IN ('high', 'medium', 'low') THEN lower(t.priority)
    ELSE 'normal'
  END,
  CASE
    WHEN t.status = 'done' THEN NULL
    WHEN t.status IN ('proposed', 'approved', 'in-progress', 'review', 'blocked') THEN t.status
    ELSE 'proposed'
  END,
  t.completion_note,
  t.completed_at,
  p.owner_user_id,
  COALESCE(
    upper(regexp_replace(owner_user.name, '[^A-Za-z0-9]', '_', 'g')),
    'SYSTEM'
  ),
  t.created_at
FROM tasks t
JOIN task_thread_migration_map map ON map.task_id = t.id
JOIN projects p ON p.id = t.project_id
LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id
LEFT JOIN agents a ON lower(a.name) = lower(t.assignee);

INSERT INTO thread_participants (
  thread_id,
  participant_id,
  participant_slug,
  added_by,
  added_by_slug,
  joined_at
)
SELECT DISTINCT
  map.thread_id,
  p.owner_user_id,
  COALESCE(
    upper(regexp_replace(owner_user.name, '[^A-Za-z0-9]', '_', 'g')),
    'SYSTEM'
  ),
  p.owner_user_id,
  COALESCE(
    upper(regexp_replace(owner_user.name, '[^A-Za-z0-9]', '_', 'g')),
    'SYSTEM'
  ),
  t.created_at
FROM tasks t
JOIN task_thread_migration_map map ON map.task_id = t.id
JOIN projects p ON p.id = t.project_id
LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id
WHERE p.owner_user_id IS NOT NULL
ON CONFLICT (thread_id, participant_id) DO NOTHING;

INSERT INTO thread_participants (
  thread_id,
  participant_id,
  participant_slug,
  added_by,
  added_by_slug,
  joined_at
)
SELECT DISTINCT
  map.thread_id,
  a.id,
  COALESCE(a.slug, upper(regexp_replace(a.name, '[^A-Za-z0-9]', '_', 'g'))),
  p.owner_user_id,
  COALESCE(
    upper(regexp_replace(owner_user.name, '[^A-Za-z0-9]', '_', 'g')),
    'SYSTEM'
  ),
  t.created_at
FROM tasks t
JOIN task_thread_migration_map map ON map.task_id = t.id
JOIN projects p ON p.id = t.project_id
LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id
JOIN agents a ON lower(a.name) = lower(t.assignee)
ON CONFLICT (thread_id, participant_id) DO NOTHING;

INSERT INTO thread_messages (
  thread_id,
  sender_id,
  sender_slug,
  type,
  body,
  sent_at
)
SELECT
  map.thread_id,
  p.owner_user_id,
  COALESCE(
    upper(regexp_replace(owner_user.name, '[^A-Za-z0-9]', '_', 'g')),
    'SYSTEM'
  ),
  'message',
  t.description,
  t.created_at
FROM tasks t
JOIN task_thread_migration_map map ON map.task_id = t.id
JOIN projects p ON p.id = t.project_id
LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id
WHERE NULLIF(BTRIM(t.description), '') IS NOT NULL;

INSERT INTO thread_messages (
  thread_id,
  sender_id,
  sender_slug,
  type,
  body,
  sent_at
)
SELECT
  map.thread_id,
  p.owner_user_id,
  COALESCE(
    upper(regexp_replace(owner_user.name, '[^A-Za-z0-9]', '_', 'g')),
    'SYSTEM'
  ),
  'event',
  CASE ta.action
    WHEN 'created' THEN ta.actor_name || ' created this task'
    WHEN 'status_changed' THEN ta.actor_name || ' changed status from ' || COALESCE(ta.from_value, 'unknown') || ' to ' || COALESCE(ta.to_value, 'unknown')
    WHEN 'assigned' THEN ta.actor_name || ' reassigned from ' || COALESCE(ta.from_value, 'unassigned') || ' to ' || COALESCE(ta.to_value, 'unassigned')
    ELSE ta.actor_name || ' updated the task'
  END,
  ta.created_at
FROM task_activity ta
JOIN task_thread_migration_map map ON map.task_id = ta.task_id
JOIN tasks t ON t.id = ta.task_id
JOIN projects p ON p.id = t.project_id
LEFT JOIN users owner_user ON owner_user.id = p.owner_user_id;

-- (agent_capability_evidence not in schema — skipped)

-- (agent_capability_evidence not in schema — skipped)

DROP INDEX IF EXISTS task_activity_task_idx;
DROP INDEX IF EXISTS task_activity_project_idx;

DROP TABLE IF EXISTS task_activity;
DROP TABLE IF EXISTS tasks;
