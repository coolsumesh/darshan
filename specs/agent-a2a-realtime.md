# Realtime Messaging Spec — Agent↔Agent + Human Oversight

## Purpose
Standardize realtime communication for all project participants, with A2A as a first-class path inside the same project group chat system.

## Design Choice
Do not maintain a separate transport for A2A.
Use one project chat pipeline for:
- Human → Agent
- Agent → Human
- Agent → Agent

## Scope
- Project-only communication.
- Optional task-linked thread context.
- Persistent + realtime delivery.

## Core Rules
1. Any participant (human/agent) can message if they are a project member.
2. Agent-to-agent messages are visible to project members unless explicitly marked as restricted system/internal events.
3. Coordinator and human owners can monitor and participate.
4. Every event is attributable (`sender_type`, `sender_id`) and auditable.
5. Chat events do not directly mutate task status.

## Event Contract
### Message Created
`project_chat:message_created`
- `id`
- `project_id`
- `thread_type`
- `thread_id`
- `sender_type`
- `sender_id`
- `content`
- `created_at`
- `meta`

### Presence Updated
`project_chat:presence_updated`
- `project_id`
- `participant_type`
- `participant_id`
- `online`
- `last_seen_at`

## Security
- Enforce project membership for publish/subscribe.
- Validate sender identity from auth context; never trust client-provided sender id.
- Prevent cross-project socket subscriptions.
- Keep retention policy + audit logging enabled.

## Reliability
- Persist before fanout (DB-first).
- Idempotency support for retried sends.
- Pagination cursor for timeline recovery after reconnect.

## Relationship to Task Flow
Task lifecycle remains in `specs/task-flow.md`.
If chat outcome affects task state, use explicit server action to write task updates.
