# Darshan Group Chat Spec (Agents + Humans)

## Purpose
Define a single project-scoped group chat where humans and agents coordinate in realtime without replacing task lifecycle controls.

## Core Principle
- **Chat = coordination + visibility**
- **Tasks = execution source of truth** (`specs/task-flow.md`)

Chat can trigger task updates through explicit actions, but chat messages alone must not mutate task state.

## Scope
- Chat is scoped per project.
- Participants include:
  - Project users (humans)
  - Project-attached agents
- Coordinator agents can participate like any other member, with extra orchestration permissions.

## Conversation Model
### 1) Project Group Channel (default)
- One default room per project: `project:{project_id}:group`
- Used for planning, updates, blockers, decisions, and quick discussions.

### 2) Task-linked Threads (optional)
- Thread key: `task:{task_id}`
- Used when a discussion is tightly tied to one task.
- Thread still lives under project visibility.

## Message Schema (Required)
- `id`
- `project_id`
- `thread_type` (`project` | `task`)
- `thread_id`
- `sender_type` (`human` | `agent`)
- `sender_id`
- `content`
- `created_at`

Recommended:
- `task_id` (nullable)
- `intent` (`question` | `update` | `blocker` | `decision` | `handoff`)
- `mentions` (user/agent ids)
- `meta` jsonb

## Permissions & Access Control
1. Only project members (users + attached agents) can read/send.
2. Enforce project membership server-side for every read/send/subscribe.
3. Prevent cross-project leakage at query + websocket layer.
4. Preserve immutable message history for audit.

## Realtime Behavior
- Use existing websocket infrastructure.
- Emit/consume: `project_chat:message_created`.
- Clients subscribe by `project_id` and optionally `thread_id`.

## Chat ↔ Task Guardrails
- Chat must not auto-change task status.
- Provide explicit action: **Promote to Task Update**.
- If promoted content implies human interaction, task can move to `review` (with assignee = Project Owner).
- Otherwise follow normal task flow to `done` without forced review.

## Coordinator Rules
- Coordinator may:
  - tag/select worker agents
  - summarize thread outcomes
  - create delegation suggestions
- Coordinator must not bypass task ownership/status rules.

## Minimal API (Proposed)
- `GET /api/v1/projects/:id/chat/messages?thread_type=&thread_id=&before=&limit=`
- `POST /api/v1/projects/:id/chat/messages`
- `POST /api/v1/projects/:id/chat/promote` (message/thread summary → task update)
- `GET /api/v1/projects/:id/chat/participants`

## UX Requirements
- Left panel: project participants with online/presence state.
- Main panel: project group timeline.
- Optional right/context panel: task threads.
- Composer supports mentions (`@agent`, `@user`).
- Clear sender chips: Human/Agent + display name.

## Non-Functional
- Low-latency delivery.
- Durable persistence.
- Basic spam/rate limits.
- Audit trail for moderation and incident review.

## Success Criteria
- Humans and agents can coordinate in one shared room per project.
- Coordinator can orchestrate without losing task governance.
- Decisions are visible, searchable, and attributable.
- Task board remains accurate and auditable.
