# Darshan — Architecture (v1)

Darshan is the MithranLabs dashboard for **human↔agent** and **agent↔agent** collaboration.

This doc is intentionally **execution-oriented**: it describes the minimal architecture needed to complete `TODO.md` in phases.

---

## 1) Goals / Non-goals

### Goals (v1)
- A web dashboard where **Sumesh can chat with one agent** or **broadcast to many**.
- A reliable backend that persists:
  - threads/messages
  - agent “runs” (invocations, status, outputs)
  - audit records (who did what, when)
- Realtime updates via WebSocket (message/runs/presence).
- A controlled **agent connector** layer (Darshan → Clawdbot agents).
- Support for **agent→agent delegation/handoff** with policy + audit.

### Non-goals (v1)
- Full workflow engine / complex DAG scheduling.
- Arbitrary tool execution from UI.
- Multi-tenant SaaS features.

---

## 2) System overview (components)

### 2.1 Web UI (Dashboard)
- 3-pane layout (Agents | Conversation | Context).
- Can:
  - list agents
  - create/select threads
  - send messages (direct/broadcast)
  - view streaming or incremental replies
  - view run timeline + A2A console

### 2.2 Backend API (Darshan Server)
Single service for v1.

Responsibilities:
- Auth + RBAC
- REST API (CRUD + actions)
- WebSocket realtime event stream
- Orchestrator (routing/broadcast/delegation)
- Persistence + audit

### 2.3 Storage
- **Postgres**: source of truth
  - agents, threads, messages, runs, a2a_routes, audit_log
- **Redis**: pubsub + lightweight queues
  - fanout WS events
  - enqueue agent invocations

### 2.4 Agent Connector
A backend module/service that provides a stable interface for:
- sending a message to a given agent
- receiving replies (streamed or chunked)
- translating connector events into Darshan runs/messages

Implementation detail (v1): adapter(s) to Clawdbot APIs/bridges.

---

## 3) Primary data model (v1)

This is the minimum set implied by `TODO.md`.

### Agents
- `id`, `name`, `status` (online/offline/unknown)
- `capabilities` (optional JSON)
- `connector_ref` (how to route to Clawdbot)

### Threads
- `id`, `title`, `created_by`, `visibility` (private/shared)

### Messages
- `id`, `thread_id`
- `author_type` (human|agent|system)
- `author_id` (user_id or agent_id)
- `content` (text + optional structured payload)
- `created_at`

### Runs (agent invocations)
Tracks an “agent action” requested by a human or another agent.
- `id`, `thread_id`
- `requested_by_type` (human|agent)
- `requested_by_id`
- `target_agent_id`
- `status` (queued|running|succeeded|failed|canceled|timeout)
- `input_message_id` (optional)
- `started_at`, `ended_at`
- `error` (optional)

### A2A Routes (agent↔agent delegation)
- `id`, `from_agent_id`, `to_agent_id`
- `policy` (allowed|blocked|requires_human_approval)
- `notes`

### Audit Log
Append-only security and debugging trail.
- `id`, `actor_type`, `actor_id`
- `action` (string)
- `resource_type`, `resource_id`
- `metadata` (JSON)
- `created_at`

---

## 4) APIs

Principle: **REST for commands/CRUD**, **WebSocket for events**.

### 4.1 REST API (v1)
Base: `/api/v1`

#### Auth
- `POST /auth/login` (MVP can be simple token exchange; OIDC later)
- `POST /auth/logout`
- `GET /me`

#### Agents
- `GET /agents` — list agents
- `GET /agents/:id` — agent details
- `POST /agents/:id/ping` — health/presence probe (optional)

#### Threads
- `GET /threads` — list threads (filtered by ACL)
- `POST /threads` — create thread
- `GET /threads/:id` — get thread
- `POST /threads/:id/archive` — archive/hide

#### Messages
- `GET /threads/:id/messages` — list messages
- `POST /threads/:id/messages` — create human message
  - request body: `{ content, targets?: { agentIds?: string[] }, mode?: "direct"|"broadcast" }`
  - behavior:
    - persists message
    - enqueues run(s)
    - emits WS events

#### Runs
- `GET /threads/:id/runs` — list runs for thread
- `GET /runs/:id` — run status
- `POST /runs` — create run explicitly (advanced UI action)
- `POST /runs/:id/cancel`

#### Agent↔Agent (A2A)
- `GET /a2a/routes` — view routes/policies
- `POST /a2a/routes` — create/update a route policy
- `POST /a2a/delegate` — initiate delegation
  - `{ fromAgentId, toAgentId, threadId, messageId?, instructions? }`

#### Audit
- `GET /audit` — filtered audit query (admin)

Notes:
- Keep payloads small; store full detail in Postgres.
- Prefer server-generated ids and timestamps.

### 4.2 WebSocket API (v1)
Endpoint: `GET /ws` (auth via cookie or token)

Clients subscribe by default to events allowed by RBAC/ACL.

Event envelope:
```json
{ "type": "message.created", "ts": "...", "data": { /* event */ } }
```

Core events:
- `presence.user` / `presence.agent`
- `thread.created`
- `message.created`
- `run.created`
- `run.updated` (status transitions, progress)
- `run.output` (optional chunked streaming)

Streaming strategy (v1):
- Prefer `run.output` chunks and finalize into a persisted `message.created` from the agent.
- UI should handle both: (a) live chunks and (b) eventual persisted agent message.

---

## 5) Data flow (end-to-end)

### 5.1 Sumesh → agent (direct)
1. UI `POST /threads/:id/messages` with `mode=direct` and a single `target agentId`.
2. Backend:
   - persists the human message
   - creates a `run` (queued)
   - enqueues invocation via Redis
   - emits `message.created` + `run.created`
3. Connector:
   - consumes queue
   - calls the target agent (Clawdbot)
   - forwards partial outputs as `run.output` (optional)
4. Backend:
   - updates `run` state (`running → succeeded/failed`)
   - persists the final agent response as a `message` (author_type=agent)
   - emits `run.updated` and `message.created`

### 5.2 Sumesh → broadcast (human to many agents)
Same as direct, except:
- backend creates **N runs**, one per agent
- backend emits `run.created` for each
- UI groups runs under the human message for display

Fanout rules (v1):
- Each agent receives the same human message content.
- Context passed is thread-scoped and ACL-filtered.

### 5.3 Agent → agent (delegation/handoff)
1. An agent requests delegation via connector callback *or* UI `POST /a2a/delegate`.
2. Backend authorizes using A2A route policy:
   - allowed
   - blocked
   - requires human approval (creates a pending item for UI)
3. If allowed:
   - backend creates a `run` targeting the delegated-to agent
   - audit logs delegation intent + outcome
   - emits `run.created`/`run.updated` events

Policy intent: prevent silent lateral movement and make delegation visible.

---

## 6) Security: auth, RBAC, ACLs, audit

### 6.1 Authentication
MVP options (pick one early; keep pluggable):
- **Token auth** for internal use (fastest)
- Upgrade path to **OIDC** (later phase)

### 6.2 RBAC (roles)
Minimum roles:
- `admin`: manage agents, view all audit, configure A2A policies
- `user`: create threads, send messages, view own/shared threads
- `viewer` (optional): read-only access

### 6.3 Thread/message ACL
- Thread visibility governs which users can read messages and see runs.
- Agents only receive the minimum context required:
  - v1 default: last K messages in the thread (server-controlled)

### 6.4 Agent connector isolation
- Connector uses a server-side credential/config; UI never sees it.
- Per-run timeouts + max output limits.
- Loop protection:
  - limit delegation depth
  - rate limits per actor + per thread

### 6.5 Audit log
Always record:
- message send actions (actor, thread)
- run creation, status transitions, cancellations
- broadcast fanout targets
- A2A delegation attempts and whether they were allowed/blocked

---

## 7) Observability (v1)
- Structured logs with `thread_id`, `run_id`, `actor_id`.
- Basic metrics:
  - run latency
  - run failure rate
  - queue depth
- Admin debug view can be built later; start with logs.

---

## 8) Phased roadmap (maps to TODO.md)

### Phase 0 — Project setup
- Repo layout, docker-compose (Postgres + Redis)
- Backend skeleton + UI skeleton

### Phase 1 — Core data model
- Postgres migrations for Agents/Threads/Messages/Runs/A2A/Audit
- Seed a few agents

### Phase 2 — Backend (REST + WS)
- Implement REST endpoints for threads/messages/runs
- Implement WS events for message + run updates
- Add Redis queue for connector jobs

### Phase 3 — UI (Dashboard)
- 3-pane layout
- thread list + search
- composer + broadcast UI
- run timeline + streaming UI (basic)

### Phase 4 — Agent connector
- Implement “send message → get reply” adapter to Clawdbot
- Map connector outputs to run updates + agent messages

### Phase 5 — Agent↔Agent
- Route policy table + enforcement
- Delegation endpoint + UI visibility

### Phase 6 — Security hardening
- OIDC (if needed)
- strict RBAC/ACL tests
- rate limits, timeouts, depth limits
- audit review tooling

---

## 9) What to build first (practical ordering)
1. **DB schema + migrations** (Threads/Messages/Runs/Audit) so everything else has a spine.
2. **REST create-message → create-run → WS events** (even before real agents).
3. **Fake connector** that returns canned responses to validate end-to-end UI.
4. Replace fake connector with **Clawdbot connector**.
5. Add broadcast + A2A policies after single-agent loop is solid.
