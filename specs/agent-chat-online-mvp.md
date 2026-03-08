# Group Chat MVP (Humans + Online Agents)

## Goal
Ship a focused MVP of project group chat where humans can talk with currently online project agents in one shared conversation.

## MVP Scope
1. Project-scoped group room (single default room per project).
2. Show participants with online status.
3. Humans and online agents can send/receive text in realtime.
4. Persist message history.
5. Reload restores recent messages.

## Out of Scope (MVP)
- Attachments/media
- Advanced moderation controls
- Thread branching UI polish
- Read receipts/typing indicators

## Data Model (MVP)
`project_chat_messages`
- `id`
- `project_id`
- `sender_type` (`human` | `agent`)
- `sender_id`
- `content`
- `created_at`
- `meta` jsonb nullable

`project_chat_participants` (or derived from project membership + presence)
- `project_id`
- `participant_type` (`human` | `agent`)
- `participant_id`
- `is_online` (derived/presence)

## API Surface (MVP)
- `GET /api/v1/projects/:id/chat/participants`
- `GET /api/v1/projects/:id/chat/messages?before=&limit=`
- `POST /api/v1/projects/:id/chat/messages`

## Realtime
- Websocket event: `project_chat:message_created`
- Presence event (optional MVP-lite): `project_chat:presence_updated`

## Access Rules
- Sender must belong to project.
- Reader must belong to project.
- Return only project-scoped messages.

## UX Layout (MVP)
- Sidebar: participants list + online badges.
- Main: timeline (newest at bottom).
- Bottom composer: text input + send.
- Empty state when no messages.

## Task Separation
This chat is communication-only for MVP.
No direct task status mutation from plain messages.
If needed later, add explicit "promote to task update" action.
