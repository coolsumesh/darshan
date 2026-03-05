# Agent Chat (Online Agents) — MVP Spec

## Purpose
Deliver a simple realtime chat page where a human can chat with any currently online agent.

## Why first
This is a foundational human↔agent communication layer before implementing full agent↔agent (A2A) communication.

## Transport Decision (Confirmed)
- This chat must be integrated through an **OpenClaw custom channel plugin** (Darshan channel), not a standalone ad-hoc transport.
- MVP may ship minimal capabilities, but the plumbing should align with channel-plugin architecture so A2A can extend on the same base.

## Scope (MVP)
- Dedicated **Agent Chat** page.
- List online agents.
- Human selects an online agent and chats in realtime.
- Persist chat messages for basic history.
- Keep architecture intentionally minimal and extensible.

## Out of Scope (for this phase)
- Agent↔Agent chat (A2A)
- Capability testing workflow integration
- Advanced thread branching
- Rich media and attachments (text-first MVP)

## Functional Requirements
1. Show currently online agents in a sidebar/list.
2. Allow human to open a conversation with one online agent.
3. Allow human to send text messages to selected agent.
4. Show agent replies in realtime.
5. Persist message history with timestamps.
6. Reloading page should show recent history for selected agent.

## Data Model (MVP)
Create a minimal message store (naming can vary):
- `id`
- `agent_id`
- `sender_type` (`human` | `agent`)
- `sender_id`
- `message`
- `created_at`

Optional now / ready for later:
- `project_id` nullable
- `meta` jsonb

## API Surface (MVP)
- `GET /api/v1/agents/online`
  - Returns online/reachable agents visible to the user.

- `GET /api/v1/agents/:id/chat?before=&limit=`
  - Returns chat history for selected agent.

- `POST /api/v1/agents/:id/chat`
  - Sends a human message to selected agent.
  - Persists message and triggers realtime delivery.

## Realtime
- Reuse existing websocket infrastructure.
- Emit event: `agent_chat:message_created`.
- Client appends message if active chat matches `agent_id`.

## Access Control
- Only authorized users can chat with/view messages for an agent.
- Online list should include only agents the user has visibility to.
- Validate sender identity server-side.

## UX Requirements
- Left panel: online agents (with presence indicator).
- Main panel: message timeline.
- Input composer at bottom (text).
- Optional empty-state when no agent selected.

## Non-Functional
- Low latency UX via websocket updates.
- Message persistence for audit/history.
- Basic rate limiting to avoid spam.

## Future Evolution Path
After MVP is stable:
1. Extend to project-scoped A2A channels.
2. Add coordinator/human oversight views.
3. Add delivery/read states, typing, and richer controls.

## Separation Rule
This feature is communication-only.
It must not mutate task lifecycle directly; task flow remains governed by `specs/task-flow.md`.
