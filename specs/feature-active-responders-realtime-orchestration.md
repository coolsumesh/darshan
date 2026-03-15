# Feature Spec: Active Responders + Real-time Task Orchestration

- **Author:** Sanjaya
- **Date:** 2026-03-13
- **Status:** Draft (implementation-ready)
- **Project:** Darshan
- **Feature Thread:** `8b888d46-82b8-4229-b09c-1daf0d87c0d0`

---

## 1) Problem Statement

Darshan currently allows this failure pattern:

1. Task thread is created and approved
2. Assignee acknowledges in chat
3. No enforced transition to `in-progress`
4. No real-time stale detection if assignee stops updating

This causes orchestration drift: work appears assigned but execution is not guaranteed.

A second UX issue exists in multi-agent threads: operators cannot easily restrict who should reply without repeatedly tagging agents.

---

## 2) Goals

1. Enforce execution pickup after approval (real-time, SLA-based).
2. Detect stalled execution without heartbeat-only polling.
3. Add thread-level reply control commands to reduce noise and improve operator control.

---

## 3) Scope

### 3.1 Active Responders (thread-level reply policy)

Commands:

- `/active-responders @SANJAYA`
- `/active-responders @SANJAYA @MITHRAN --next 10`
- `/active-responders clear`
- `/active-responders status`

Behavior:

- Policy is **thread-scoped**.
- Only configured responders are allowed for auto-reply dispatch in that thread.
- `--next N` applies for next N user messages, then auto-clears.
- `status` returns current policy + remaining counter/expiry.
- `clear` restores default routing.

---

### 3.2 Real-time Task Orchestration (event-driven SLA)

System events:

- `task.approved`
- `task.in_progress`
- `task.progress`
- `task.blocked`
- `task.review_requested`
- `task.done`

SLA rules:

1. **Pickup SLA:** when task becomes `approved`, assignee must move to `in-progress` within default 10 min.
2. **Progress SLA:** when task is `in-progress`, assignee must post progress within default 30 min (timer refresh on each progress event).
3. **Miss handling:** on SLA miss, system posts thread event + notifies assignee and coordinator.

Enforcement rule:

- First assignee response after `approved` must include status transition (`in-progress`) or explicit `blocked` with reason.
- A plain acknowledgement message does not satisfy pickup.

---

## 4) Non-Goals

- No replacement of core stack (Next.js/Fastify/Postgres/Redis remain).
- No workflow engine migration.
- No historical analytics dashboard in v1.

---

## 5) Technical Design

### 5.1 Data Model Changes

#### A) Thread reply policy

Option 1: new table `thread_reply_policy`

Columns:

- `thread_id uuid primary key references threads(thread_id) on delete cascade`
- `mode text not null check (mode in ('all','restricted')) default 'all'`
- `allowed_participant_ids uuid[] not null default '{}'`
- `next_message_limit int null`
- `expires_at timestamptz null`
- `updated_by uuid null`
- `updated_at timestamptz not null default now()`

#### B) Task SLA state

New table `task_sla_state`

Columns:

- `thread_id uuid primary key references threads(thread_id) on delete cascade`
- `pickup_due_at timestamptz null`
- `progress_due_at timestamptz null`
- `last_progress_at timestamptz null`
- `last_event_type text null`
- `last_event_at timestamptz not null default now()`
- `stale_reason text null`

---

### 5.2 API / Command Handling

#### A) Command parser in thread messages

At thread message ingest:

- Detect command prefix `/active-responders`
- Parse participants and flags (`--next`, later `--until` optional)
- Validate participants belong to thread
- Upsert `thread_reply_policy`
- Insert system/event message with applied policy summary

Supported forms:

- `/active-responders @A @B`
- `/active-responders @A --next 10`
- `/active-responders clear`
- `/active-responders status`

#### B) Router enforcement

Before agent dispatch in a thread:

1. Load `thread_reply_policy`
2. If mode = `all`, proceed
3. If mode = `restricted`, dispatch only to allowed responders
4. Decrement `next_message_limit` per triggering user message
5. Auto-clear when limit reaches 0 or expired

---

### 5.3 Event-driven Orchestration Worker

Add a dedicated worker process (Node/TS) subscribed to task events via Redis-backed queue.

Responsibilities:

- Start pickup timers on `task.approved`
- Convert to progress timers on `task.in_progress`
- Refresh progress deadline on `task.progress`
- Cancel timers on terminal states (`blocked`, `review_requested`, `done`, close)
- Emit stale actions on timeout

Timeout action payload:

- Thread event message: `Pickup SLA missed` / `Progress SLA missed`
- Notification to assignee + coordinator
- Update `task_sla_state.stale_reason`

Recommended queue tech:

- **BullMQ** over plain pub/sub (durability, retries, delayed jobs, observability)

---

### 5.4 UI Changes

Thread/task UI updates:

1. Thread header chip: **Active Responders**
   - shows allowed responders
   - remaining `--next` count / expiry
2. Task SLA panel:
   - `Waiting pickup (mm:ss)`
   - `In progress (next update due mm:ss)`
   - `SLA missed`

Optional v1.1:

- Delivery timeline (`notification created -> delivered -> seen -> acted`)

---

## 6) Reliability & Failure Semantics

- Worker restart-safe deadlines: persisted in `task_sla_state` and queue jobs rehydrated on boot.
- Idempotent timeout handlers using dedupe key (`thread_id + deadline_type + due_at`).
- At-least-once event handling with duplicate guard.
- All policy changes and SLA misses produce system messages for auditability.

---

## 7) Permissions

- Only thread creator/owner/coordinator can run `active-responders` mutation commands (`set/clear`).
- `status` visible to all participants.
- Router-level enforcement applies regardless of sender client.

---

## 8) Config

Project-level defaults (override-capable):

- `TASK_PICKUP_SLA_MINUTES = 10`
- `TASK_PROGRESS_SLA_MINUTES = 30`
- `ACTIVE_RESPONDERS_MAX_NEXT = 100`

---

## 9) Acceptance Criteria

1. `/active-responders @SANJAYA --next 3` restricts auto-agent replies to SANJAYA for next 3 user messages.
2. `/active-responders clear` removes restriction immediately.
3. Approved task without `in-progress` before SLA triggers automatic stale event + notifications.
4. In-progress task without progress update before SLA triggers stale event + notifications.
5. Assignee ack-only message after approval does not count as pickup.
6. SLA actions are visible in thread timeline as system events.

---

## 10) Rollout Plan

### Phase 1 — Active Responders
- command parser
- DB policy persistence
- router enforcement
- status/clear behavior

### Phase 2 — Task Event Emission + SLA state
- emit task lifecycle events
- add `task_sla_state`

### Phase 3 — Worker + Timers
- BullMQ worker
- delayed jobs, retries, timeout handlers

### Phase 4 — UI Telemetry
- active responders header
- SLA countdown/status panel

---

## 11) Tech Stack Impact Summary

No stack rewrite required.

- Keep: Next.js + Fastify + Postgres + Redis
- Add: always-on orchestrator worker process
- Extend: Redis usage for durable delayed-job orchestration (BullMQ)
- Add: DB migrations for policy/SLA state

This is a **layering change** (event-driven orchestration), not a framework change.
