# Agent-to-Agent Realtime Chat — Architecture Design (Darshan)

## Purpose
Define the architecture for project-scoped realtime chat across:
- agents
- coordinator agent
- human project members

This communication layer is independent from task lifecycle.

## 1) Core Architecture

### A. Project Realtime Chat Service (server-side)
- Introduce a project-scoped chat domain: `/projects/:id/chat` (or `/projects/:id/a2a-chat`).
- Responsibilities:
  - validate identity + authorization
  - persist messages
  - publish realtime events over existing websocket infrastructure

### B. Unified Participant Model
- Support both human and agent senders.
- Canonical sender fields:
  - `sender_type` (`agent` | `human`)
  - `sender_id`
- Authorization maps authenticated caller to participant identity.

### C. Persistence Layer
Create `project_chat_messages` with minimum fields:
- `id`
- `project_id`
- `sender_type` (`agent` | `human`)
- `sender_id`
- `target_type` (`agent` | `channel` | `broadcast`)
- `target_id` (nullable for broadcast)
- `body`
- `created_at`
- `meta` (jsonb, optional)

Optional future table:
- `project_chat_reads` for read receipts / last seen pointers.

### D. Realtime Transport
- Reuse existing websocket bus.
- Emit event: `project_chat:message_created`.
- Client appends message only when `project_id` matches active project context.

## 2) Access Model

### Can Send
- Agents attached to project
- Coordinator agent(s)
- Human project members with project access

### Can Read
- Same as senders above

### Security Boundary
- Enforce strict project boundary checks on every read/send operation.
- Deny cross-project access even when sender identity is valid globally.

## 3) API Surface (MVP)

- `GET /api/v1/projects/:id/chat/messages?limit=&before=`
- `POST /api/v1/projects/:id/chat/messages`
- `GET /api/v1/projects/:id/chat/participants`

All endpoints must enforce identity + project authorization server-side.

## 4) Target Agent System Requirements
For an external/worker agent runtime (e.g., Mithran) to participate:

1. **Stable identity**
   - agent ID
   - valid bearer/callback token

2. **Project context awareness**
   - knows active `project_id`
   - sends only within attached projects

3. **Inbound message handling**
   - websocket client for realtime receive (preferred), or
   - inbox polling fallback when websocket unavailable

4. **Outbound chat capability**
   - POST to project chat endpoint
   - include body + target (agent/broadcast/channel)

5. **Ack/retry behavior**
   - retry transient errors
   - prevent duplicates (client message id / idempotency key)

6. **Safety controls**
   - do not send secrets/tokens
   - respect max length and rate limits
   - use structured escalation messages when blocked

7. **Presence heartbeat (optional, recommended)**
   - online/offline/last_seen visibility for coordinator/humans

## 5) Delivery Plan

### Phase 1 (MVP)
1. DB migration (`project_chat_messages`)
2. API (list/send/participants)
3. websocket event publish + client subscription
4. project chat UI (agents + coordinator + human)

### Phase 2
- threads/replies
- read receipts
- typing/presence indicators
- search/filter/export

## 6) Separation Rule (Non-negotiable)
- Chat transport must not mutate task status directly.
- Task state remains governed by `specs/task-flow.md`.
- Capability testing remains governed by dedicated capability module/specs.
