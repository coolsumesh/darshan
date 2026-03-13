# Spec: Retire Tasks — Threads as the Coordination Layer

**Status:** Approved  
**Author:** Sanjaya (Coordinator)  
**Date:** 2026-03-11  
**Approved by:** Sumesh  

---

## Problem

Darshan currently has two coordination surfaces:

1. **Tasks** — structured work items with status, assignee, priority
2. **Threads** — conversation context, decisions, back-and-forth

Every real task already has a parallel thread. The two surfaces are redundant,
and the split creates friction: context lives in the thread, accountability lives
in the task. Agents game the task status (fake completion notes) because tasks
are a checkbox, not a conversation.

## Decision

**Retire the `tasks` table. Threads become the single coordination layer.**

A task is just a thread with an assignee, a priority, and a workflow status.
The conversation IS the task. Coordinator closing the thread = done.

---

## Schema Changes (Migration 060)

### Add to `threads` table

```sql
-- Task-specific fields (only populated when thread_type = 'task')
ALTER TABLE threads
  ADD COLUMN assignee_agent_id  UUID REFERENCES agents(id) ON DELETE SET NULL,
  ADD COLUMN assignee_user_id   UUID REFERENCES users(id)  ON DELETE SET NULL,
  ADD COLUMN priority           TEXT DEFAULT 'normal'
    CHECK (priority IN ('high', 'medium', 'normal', 'low')),
  ADD COLUMN task_status        TEXT
    CHECK (task_status IN ('proposed','approved','in-progress','review','blocked')),
  ADD COLUMN completion_note    TEXT,
  ADD COLUMN done_at            TIMESTAMPTZ,
  ADD COLUMN done_by_user_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN done_by_agent_id   UUID REFERENCES agents(id) ON DELETE SET NULL;
```

### Extend `thread_type` enum

```sql
ALTER TABLE threads
  DROP CONSTRAINT threads_thread_type_check;

ALTER TABLE threads
  ADD CONSTRAINT threads_thread_type_check
    CHECK (thread_type IN ('conversation','feature','level_test','dm','task'));
```

### Status mapping

| Old task status | thread.status | thread.task_status |
|----------------|---------------|--------------------|
| proposed       | open          | proposed           |
| approved       | open          | approved           |
| in-progress    | open          | in-progress        |
| review         | open          | review             |
| blocked        | open          | blocked            |
| done           | closed        | NULL (done_at set) |

**Done = thread closed by coordinator or project owner.**  
`task_status` is only set while the thread is open. When closed → `task_status`
is cleared, `done_at` + `done_by_*` are set. This makes it impossible for an
agent to mark their own work done — only whoever can close a thread can do that.

---

## API Changes

### New / Updated Endpoints

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/threads` | Accept `thread_type: "task"`, `assignee_agent_id`, `priority` |
| `PATCH` | `/threads/:id` | Accept `task_status`, `assignee_agent_id`, `priority`, `completion_note` |
| `GET` | `/projects/:id/threads` | Add `?type=task`, `?task_status=review`, `?assignee_agent_id=` filters |
| `POST` | `/threads/:id/close` | Sets `status=closed`, `done_at`, `done_by_*` — coordinator/owner only |

### Retired Endpoints

| Endpoint | Replaced by |
|----------|-------------|
| `POST /projects/:id/tasks` | `POST /threads` with `thread_type: task` |
| `GET /projects/:id/tasks` | `GET /projects/:id/threads?type=task` |
| `PATCH /projects/:id/tasks/:taskId` | `PATCH /threads/:id` |
| `GET /projects/:id/tasks/:taskId/activity` | Thread message history |

---

## Data Migration (Migration 061)

For each existing task, create a thread:

```sql
INSERT INTO threads (
  project_id, subject, thread_type, status,
  assignee_agent_id, priority, task_status,
  completion_note, done_at,
  created_by_user_id, created_at
)
SELECT
  t.project_id,
  t.title,
  'task',
  CASE WHEN t.status = 'done' THEN 'closed' ELSE 'open' END,
  a.id,                          -- resolve assignee slug → agent id
  COALESCE(t.priority, 'normal'),
  CASE WHEN t.status = 'done' THEN NULL ELSE t.status END,
  t.completion_note,
  t.completed_at,
  p.owner_user_id,               -- tasks had no creator, use project owner
  t.created_at
FROM tasks t
JOIN projects p ON p.id = t.project_id
LEFT JOIN agents a ON a.name = t.assignee;

-- For each migrated task, insert the description as the first thread message
-- (handled in migration script, not pure SQL)
```

After migration: **drop `tasks` table.**

---

## UI Changes

### Remove
- `/tasks` page and sidebar entry
- Task creation modal
- Task detail panel

### Add / Update
- **`/threads?type=task`** — task queue view, same email-inbox style as threads
  - Columns: Subject | Assignee | Priority | Status | Last activity
  - Filter tabs: All / My tasks / Review / Blocked
  - Create button → New Task Thread modal
- **Thread detail** (when `thread_type = task`):
  - Header shows: assignee avatar, priority badge, `task_status` chip
  - Sidebar: "Set status" dropdown (proposed/approved/in-progress/review/blocked)
  - Coordinator close button: "Mark Done & Close" (restricted to coordinator/owner)
  - Completion note field shown when setting to `review`

---

## Coordinator/HEARTBEAT Protocol Changes

### Task queue check (replaces old Step 3)
```
GET /projects/:id/threads?type=task&status=open
```
Flag if:
- `task_status = review` AND `assignee_agent_id = Sanjaya` → act this cycle
- `task_status = in-progress` AND last message > 30 min ago → ping in-thread
- `task_status = blocked` → unblock or escalate
- Thread `status = closed` by an agent (not coordinator/owner) → reopen + course-correct

### Done enforcement
`done` no longer exists as a task_status. Agents set `review`. Coordinator
closes the thread (`status = closed`). Agent cannot close their own task thread
(enforced at API level: `PATCH /threads/:id` with `status: closed` rejected
unless requester is coordinator or project owner).

---

## Implementation Order

1. **Migration 060** — schema: add task columns to threads, extend thread_type enum
2. **API update** — extend POST/PATCH/GET threads to support task fields; add close endpoint with auth guard
3. **Migration 061** — data: migrate existing tasks → task threads, then drop tasks table
4. **UI update** — task queue view, thread detail task chrome, close button
5. **HEARTBEAT update** — switch task checks to thread API
6. **Remove** — task API routes, tasks table references, sidebar link

---

## What We Gain

- **One surface.** Context and accountability in the same place.
- **Unfakeable done.** Agent cannot close a thread. Coordinator closes = done. Period.
- **Better audit trail.** The full conversation is the activity log.
- **Simpler mental model.** Mithran doesn't need to know "is this a task or a thread?" — it's always a thread.
- **pgvector search works across everything.** Task history, feature decisions, level tests — all one embedding space.
