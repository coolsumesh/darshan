# Attendance / Presence Monitoring (MVP)

This doc proposes a minimal, implementation-oriented plan for **agent attendance** (online/offline/away) in the current **Fastify + Next.js** monorepo.

> Scope: heartbeat endpoint, presence polling, WebSocket `presence.updated` events, DB schema additions, and a minimal MVP code plan.

---

## Implementation

### 1) Definitions (what “attendance” means)

- **Presence**: current state for an agent (`online | offline | unknown`, optionally `away`).
- **Heartbeat**: periodic signal from an agent runtime/connector indicating it is alive.
- **Attendance** (MVP): derive online/offline intervals from heartbeat stream.

Key design choice:
- Do **not** store an event row for every heartbeat forever.
- Store **current presence** (hot path) + optionally store **session intervals** (attendance history).

---

### 2) API: Heartbeat endpoint

#### Endpoint
`POST /api/v1/agents/:agentId/heartbeat`

#### Auth (MVP)
- Use a shared secret per agent connector (e.g., `Authorization: Bearer <AGENT_TOKEN>`), or HMAC signature.
- Keep tokens **out of the DB** rows that are returned to the UI.

#### Request body (example)
```json
{
  "sessionId": "uuid-or-random",
  "state": "online", 
  "meta": {
    "hostname": "ip-172-31-...",
    "pid": 1234,
    "version": "clawdbot-...",
    "capabilities": {"ws": true}
  }
}
```

Notes:
- `state` can be optional; server can treat any heartbeat as “online”.
- `sessionId` allows stable tracking across restarts. If absent, the server can generate/rotate a session.

#### Response
```json
{ "ok": true, "serverTime": "...", "status": "online" }
```

#### Server behavior
On heartbeat:
1. Validate agent + auth.
2. Upsert current presence row.
3. If status transitioned (offline→online, online→offline), write a session boundary (optional, see DB below).
4. Emit WS event `presence.updated` (throttled / only on change).

**Throttling guidance**
- Heartbeats can be frequent (e.g., every 10–30s). Don’t broadcast every ping.
- Emit WS updates when:
  - status changes OR
  - `last_seen_at` is older than some interval (e.g., 30s) and UI needs “freshness”.

---

### 3) Presence calculation & polling

#### Online/offline rules (simple + robust)
- If `now - last_heartbeat_at <= OFFLINE_AFTER_MS` ⇒ `online`
- Else ⇒ `offline`

Recommended MVP values:
- `HEARTBEAT_INTERVAL_MS = 15_000–30_000`
- `OFFLINE_AFTER_MS = 2 * HEARTBEAT_INTERVAL_MS + jitter` (e.g., 70s)

#### Why not rely purely on client “disconnect”
- WS disconnects are noisy (sleep, network blips). Heartbeat-based presence is more stable.

#### UI polling (backup + first MVP)
Even if WS exists, keep a fallback poll:
- `GET /api/v1/agents` returns agents with computed presence fields.
- Poll every 10–20 seconds.

This ensures:
- UI stays correct when WS is down.
- Server can compute presence from DB without pushing.

---

### 4) WebSocket: `presence.updated` events

#### WS endpoint
- Add WS to Fastify (`@fastify/websocket`) at `GET /ws` (as described in `ARCHITECTURE.md`).

#### Event envelope
```json
{
  "type": "presence.updated",
  "ts": "2026-02-15T...Z",
  "data": {
    "agentId": "...",
    "status": "online",
    "lastHeartbeatAt": "...",
    "sessionId": "...",
    "meta": {"hostname": "..."}
  }
}
```

#### When to emit
- Always emit on status transitions.
- Optionally emit periodic refresh (e.g., every 30s) for agents still online.

#### Fanout
MVP: broadcast to all connected UI clients.
Later: RBAC-filter if needed (admin vs user).

---

### 5) DB schema additions

The existing `DB.md` defines `agents` with a `status`. For presence/attendance, add:

#### 5.1 `agent_presence` (current state, hot path)
Stores the latest heartbeat and computed presence.

```sql
create table agent_presence (
  agent_id uuid primary key references agents(id) on delete cascade,

  status text not null default 'unknown'
    check (status in ('online','offline','unknown','away')),

  session_id text,
  last_heartbeat_at timestamptz not null,
  last_seen_at timestamptz not null, -- can equal last_heartbeat_at; reserved if later we track WS/user activity

  meta jsonb not null default '{}',

  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index agent_presence_status_idx on agent_presence (status);
create index agent_presence_last_heartbeat_idx on agent_presence (last_heartbeat_at desc);
```

Implementation detail:
- Keep `agents.status` as a denormalized convenience OR deprecate it and compute from `agent_presence`.
- If you keep it, update it transactionally with the presence upsert.

#### 5.2 `agent_sessions` (optional MVP+, for attendance history)
Tracks online intervals without storing every heartbeat.

```sql
create table agent_sessions (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references agents(id) on delete cascade,

  session_id text, -- from heartbeat payload; useful for debugging

  started_at timestamptz not null,
  ended_at timestamptz,

  start_reason text, -- 'heartbeat' | 'manual' | 'admin'
  end_reason text,   -- 'timeout' | 'shutdown' | 'admin'

  meta jsonb not null default '{}',

  created_at timestamptz not null default now()
);

create index agent_sessions_agent_started_idx on agent_sessions (agent_id, started_at desc);
create index agent_sessions_open_idx on agent_sessions (agent_id) where ended_at is null;
```

Session boundary rules:
- On first heartbeat when currently offline/unknown ⇒ open a session (`started_at=now`).
- On a timeout sweep or explicit offline transition ⇒ close open session (`ended_at=now`).

#### 5.3 Presence “timeout sweep”
Because heartbeats may stop without a final message:
- Run a periodic job (in-process interval for MVP) that marks agents offline when `last_heartbeat_at` is too old.
- When it flips an agent to offline, also close the open `agent_sessions` row.

MVP note: the job can live in the API server process (setInterval). Production: move to a worker.

---

### 6) Minimal MVP code plan (Fastify + Next)

This is the smallest set of changes to get a working attendance UI.

#### 6.1 API app (`apps/api`)
1. **Add DB access layer** (if not present yet)
   - For MVP, `pg` is fine (later Drizzle).
   - Create `packages/shared` types for presence payloads.

2. **Add routes**
   - `POST /api/v1/agents/:id/heartbeat`
   - `GET /api/v1/agents` includes `presence` fields:
     - `status`
     - `lastHeartbeatAt`
     - `sessionId`

3. **Add WebSocket server**
   - Register `@fastify/websocket`.
   - Add `GET /ws` that upgrades and stores connections in a simple in-memory set.
   - Implement `broadcast(event)` helper.

4. **Presence logic module**
   - `computeStatus(lastHeartbeatAt)`
   - `upsertPresence(agentId, sessionId, meta)`
   - `transitionIfNeeded(prevStatus, nextStatus)` ⇒ maybe create/close session.

5. **Timeout sweep (in-process)**
   - Every 15–30 seconds:
     - query `agent_presence` where `status='online'` and `last_heartbeat_at < now()-OFFLINE_AFTER`.
     - mark them offline, close sessions, emit `presence.updated`.

#### 6.2 Web app (`apps/web`)
1. **Agents list page/panel**
   - Display status badge + last seen.

2. **Data transport (choose order of implementation)**
   - MVP-0: polling only (`GET /api/v1/agents` every 10–20s).
   - MVP-1: add WS subscription to receive `presence.updated` and patch local state.

3. **UI behavior**
   - If WS connected: optimistic live updates.
   - If WS disconnected: fall back to polling.

#### 6.3 Connector / agent runtime changes (outside Darshan UI)
Wherever agent processes live (Clawdbot connector layer):
- Add a timer to call `POST /api/v1/agents/:id/heartbeat` every N seconds.
- Include a stable `sessionId` per process start.

---

### 7) MVP milestones (practical)

1. **Presence stored + visible**
   - Heartbeat endpoint updates `agent_presence`.
   - `GET /agents` shows computed status.

2. **Offline timeout**
   - Sweep flips status and closes sessions.

3. **Realtime WS updates**
   - Broadcast `presence.updated` on transitions.

4. **Attendance report (optional)**
   - Simple endpoint: `GET /api/v1/agents/:id/sessions?from=...&to=...`
   - UI: basic “hours online” in a date range.
