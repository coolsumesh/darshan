# Agent Chat Architecture (Darshan Channel-First)

_Last updated: 2026-03-07_

## Goal
Use **Darshan as a first-class OpenClaw channel** for agent chat flows (similar to Telegram/WhatsApp semantics), while keeping a temporary bridge adapter only as transport glue.

---

## 1) Target Model

### Channel identity
- Channel name: `darshan`
- Chat scopes:
  - direct agent chat: `chat_id = thread_id`
  - project chat mention replies: `chat_id = thread_id` (agent thread linked to project mention)

### Message contract to OpenClaw
Darshan sends channel metadata on every upstream call:
- `x-openclaw-channel: darshan`
- `x-openclaw-chat-id: <thread_id>`
- optional sender headers:
  - `x-openclaw-sender-id`
  - `x-openclaw-sender-name`
- optional project header:
  - `x-openclaw-project-id`

Body also carries metadata mirror:
- `channel`, `chat_id`, `sender_id`, `sender_name`, `project_id`, `darshan_agent_id`

This allows OpenClaw-side policies, routing, memory scope, and future plugin migration to preserve conversation identity.

---

## 2) Runtime Components

### A) Darshan API (`apps/api`)
- Receives user messages.
- Persists messages/runs.
- Calls bridge endpoint with Darshan channel metadata.

### B) Darshan Chat Bridge (`apps/chat-bridge`)
- Authenticated endpoint: `POST /darshan/chat`
- Converts Darshan payload to OpenClaw Chat Completions request.
- Resolves Darshan agent -> OpenClaw agent id via `OPENCLAW_AGENT_ID_MAP_JSON`.

### C) OpenClaw Gateway
- Receives `/v1/chat/completions` with channel headers.
- Executes on selected OpenClaw agent.

---

## 3) Environment and Ownership

### API env (`apps/api/.env`)
- `OPENCLAW_CHAT_BRIDGE_URL=http://127.0.0.1:4400/darshan/chat`
- `OPENCLAW_CHAT_BRIDGE_TOKEN=...`

### Chat bridge env (`apps/chat-bridge/.env`)
- `OPENCLAW_CHAT_BRIDGE_TOKEN=...`
- `OPENCLAW_BASE_URL` (default `http://127.0.0.1:18789`)
- `OPENCLAW_API_KEY=...`
- `OPENCLAW_MODEL=openclaw` (or override)
- `OPENCLAW_AGENT_ID_MAP_JSON={...}`

### Deployment
Workflow writes **both** API and chat-bridge env files and redeploys:
- `darshan-api`
- `darshan-chat-bridge`
- `darshan-web`

---

## 4) Flows

### Direct chat
1. User -> `POST /api/v1/agents/:id/chat/messages`
2. API inserts message/run
3. Connector calls bridge with `channel=darshan`
4. Bridge calls OpenClaw with Darshan channel headers
5. Reply persisted + broadcast

### Project chat mention
1. User -> `POST /api/v1/projects/:id/chat/messages`
2. Mentions resolved (`@AgentName`)
3. API ensures agent thread
4. API calls bridge with sender/project metadata
5. Reply inserted in `project_chat_messages`

---

## 5) Failure semantics

- If bridge/upstream fails, API fallback currently keeps chat responsive.
- Recommended behavior for production hardening:
  - keep fallback, but mark response as degraded source
  - emit structured event with upstream error class
  - show UI badge: `Agent Channel: Connected / Degraded`

---

## 6) Path to true native OpenClaw Darshan plugin

Current state is **channel-first payloads over bridge adapter**.
Next milestone:
1. Implement native `channels.darshan` plugin in OpenClaw runtime.
2. Replace bridge HTTP hop with plugin event ingestion.
3. Preserve same `channel/chat_id/sender/project` identity fields.
4. Keep bridge as optional fallback/dev tool.
