# Darshan Chat Architecture (Current)

_Last updated: 2026-03-06_

## 1) Chat surfaces

Darshan currently has **two chat surfaces**:

1. **Direct Agent Chat (1:1)**
   - API routes: `apps/api/src/routes/agentChat.ts`
   - DB tables: `agent_chats`, `threads`, `thread_participants`, `messages`, `runs`
   - UI flow: user chats with a single agent

2. **Project Group Chat**
   - API routes: `apps/api/src/routes/projectChat.ts`
   - DB table: `project_chat_messages`
   - UI location: Project Detail → `Chat` tab (`apps/web/src/app/(proto)/projects/[id]/page.tsx`)
   - Group timeline for project members

---

## 2) Core backend components

### A) API server
- Entry: `apps/api/src/index.ts`
- Registers all chat routes and websocket route.

### B) Connector worker loop (for direct chat runs)
- File: `apps/api/src/connector.ts`
- Polls queued runs every ~2s (`processQueued`)
- Attempts bridge call first; falls back to canned response if bridge unavailable.

### C) WebSocket broadcast
- `broadcast(...)` helper emits events to connected clients.
- Events used by chat UIs:
  - Direct chat: `message.created`, `run.updated`
  - Project chat: `project_chat:message_created`

---

## 3) Direct Agent Chat flow (1:1)

## Request path
1. User sends message to `POST /api/v1/agents/:id/chat/messages`
2. API ensures a private thread exists for `(user, agent)` in `agent_chats`
3. API inserts user message into `messages`
4. API creates a queued `run`
5. Connector picks queued run and processes it
6. Connector calls OpenClaw bridge (`OPENCLAW_CHAT_BRIDGE_URL`)
7. If bridge returns reply → stored as agent message
8. If bridge fails/unavailable → fallback response is generated
9. WebSocket broadcasts new message to clients

## Persistence
- Conversation state lives in `threads/messages`
- Execution state lives in `runs`

---

## 4) Project Group Chat flow

## Request path
1. User sends message to `POST /api/v1/projects/:id/chat/messages`
2. API stores message in `project_chat_messages`
3. Message is broadcast to project chat subscribers
4. Mention parser extracts tags like `@Sanjaya`, `@Mithran`
5. Only mentioned agents are targeted (noise control)
6. For each mentioned agent:
   - API ensures per-user agent thread exists (reuses `agent_chats` model)
   - Calls OpenClaw bridge with that thread context
   - Stores agent reply in `project_chat_messages`
   - Broadcasts reply to project chat
7. If bridge unavailable, a fallback response is inserted so chat remains responsive

## Important behavior
- **No mention = no auto-agent reply**
- **Mention one = one agent replies**
- **Mention multiple = multiple replies**

---

## 5) Bridge dependency and env vars

Darshan bridge integration expects:

- `OPENCLAW_CHAT_BRIDGE_URL`
- `OPENCLAW_CHAT_BRIDGE_TOKEN` (optional depending on bridge policy)

These are written into server `.env` by GitHub Actions deploy workflow:
- `.github/workflows/deploy.yml`

If these vars are missing/empty, bridge calls return null and fallback logic is used.

---

## 6) Why it may have "worked before"

Likely reasons:

1. **Fallback looked like normal response**
   - Even without bridge, direct/project chat can still return canned fallback text.

2. **Env drift during deploy**
   - If workflow rewrites `.env` and bridge vars are not included, a previously working server can lose bridge connectivity after redeploy.

3. **Mixed path behavior**
   - Direct chat and project chat initially had different fallback handling, which could make one seem broken while the other appears to work.

---

## 7) Data model summary

### Direct chat
- `agent_chats` maps `(user_id, agent_id) -> thread_id`
- `threads` stores conversation container
- `thread_participants` stores access
- `messages` stores actual messages
- `runs` stores execution lifecycle

### Project group chat
- `project_chat_messages`
  - `project_id`
  - `author_type` (`human|agent|system`)
  - optional `author_user_id` / `author_agent_id`
  - `content`, `created_at`

---

## 8) Current operational posture

- Chat will remain responsive even if bridge is down (fallback path).
- Mention-gated group chat prevents agent spam.
- Real LLM/agent-quality replies still depend on bridge env + bridge service health.

---

## 9) Recommended hardening next

1. Add startup health check endpoint for bridge status.
2. Add UI badge: `Bridge: Connected / Degraded`.
3. Add structured telemetry for bridge failures (status code + reason).
4. Add retry policy with backoff for transient bridge errors.
5. Add per-agent mention alias table (nickname support).
