# Darshan — Attendance / Agent Presence Monitoring (v1)

This document defines how Darshan tracks **online/offline** status per agent, records presence changes, and exposes realtime UI hooks.

It complements `ARCHITECTURE.md` (presence events) and `DB.md` (core schema). This file focuses on *agent attendance*: system-wide reachability + recent activity.

---

## 1) Goals / Non-goals

### Goals (v1)
- Show each agent as **online / offline / unknown / degraded** with a clear “last seen” timestamp.
- Record every significant presence transition as an **append-only** event for audit/debug.
- Make presence updates available to the UI via **WebSocket** events.
- Keep the model robust to flaky networks and restarts.

### Non-goals (v1)
- Full observability/telemetry (CPU/mem, tracing) beyond a few lightweight health signals.
- Perfect “human-style attendance” semantics (e.g., activity in the last N minutes across tools). v1 is about *connectivity + heartbeat*.

---

## 2) Core concepts

### 2.1 Presence vs. status
- **Presence**: is Darshan currently receiving heartbeats (or has a live connector session) for an agent?
- **Status**: what the UI should show (`online/offline/unknown/degraded`). Status is derived from presence + recent errors.

In v1, we persist the **current status** on `agents.status` for quick list rendering and store detailed history separately.

### 2.2 Sources of truth (signals)
Presence can be derived from one or more signals; order below is typical for v1:
1. **Connector session lifecycle** (best): if Darshan maintains a websocket/session to the agent connector, session up/down is authoritative.
2. **Heartbeat** (good): periodic “I am alive” pings from agent/connector to Darshan.
3. **Active run activity** (weak): runs completing implies reachability, but absence of runs shouldn’t imply offline.
4. **Manual ping** (debug): user triggers a ping; results are recorded.

### 2.3 State machine (UI-facing)
Suggested UI states:
- `online`: last heartbeat within threshold; no recent critical errors.
- `degraded`: last heartbeat within threshold, but recent connector errors/timeouts suggest partial connectivity.
- `offline`: explicit disconnect OR heartbeat stale beyond threshold.
- `unknown`: never seen OR status cannot be determined after startup until first signal arrives.

Recommended transitions are event-driven and monotonic in time (ignore out-of-order signals).

---

## 3) Data model (DB)

### 3.1 Minimal additions
Keep `agents.status` as the current UI status (already in `DB.md`). Add:

#### 3.1.1 `agent_presence`
One row per agent storing “current” presence-derived fields.

```sql
create table agent_presence (
  agent_id uuid primary key references agents(id) on delete cascade,

  -- session tracking (if connector provides it)
  session_id text,

  -- presence timestamps
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  last_heartbeat_at timestamptz,

  -- derived
  computed_status text not null default 'unknown'
    check (computed_status in ('online','offline','unknown','degraded')),

  -- debugging
  last_error_code text,
  last_error_message text,
  last_error_at timestamptz,

  updated_at timestamptz not null default now()
);

create index agent_presence_last_seen_idx on agent_presence (last_seen_at desc);
```

Notes
- `computed_status` is kept in sync with `agents.status` (either duplicate for convenience or choose one canonical location). If you keep both, `agents.status` is the cached copy used by list queries.
- `session_id` is *not secret*; it is a short-lived opaque identifier for debugging.

#### 3.1.2 `agent_presence_events`
Append-only history of presence transitions and key observations.

```sql
create table agent_presence_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,

  agent_id uuid not null references agents(id) on delete cascade,

  event_type text not null,
  -- examples: 'session.connected','session.disconnected',
  --           'heartbeat.received','heartbeat.missed',
  --           'status.changed','ping.requested','ping.succeeded','ping.failed'

  observed_status text,
  -- optional: one of ('online','offline','unknown','degraded')

  session_id text,

  meta jsonb not null default '{}',
  observed_at timestamptz not null default now()
);

create index agent_presence_events_agent_seq_idx on agent_presence_events (agent_id, seq desc);
create index agent_presence_events_observed_at_idx on agent_presence_events (observed_at desc);
```

Why an events table?
- Debugging “why did this agent show offline?” becomes a queryable timeline.
- You can later compute uptime metrics without changing the core UI.

### 3.2 Relationship to `audit_log`
Presence is operational and may be high-volume. Recommendation:
- Store detailed presence signals in `agent_presence_events`.
- Write to `audit_log` **only** for user-initiated actions (e.g., manual ping) and important derived transitions (e.g., online→offline) if you need security-level traceability.

---

## 4) Event flow (backend)

### 4.1 Heartbeat ingestion
**Input**: connector/agent calls `POST /api/v1/agents/:id/heartbeat` (or sends via WS).

Backend steps:
1. Validate agent id + auth (connector credential).
2. Upsert `agent_presence`:
   - set `last_seen_at = now()`
   - set `last_heartbeat_at = now()`
   - if `first_seen_at is null`, set it
3. Compute `computed_status`:
   - if within threshold: `online` (or `degraded` if recent error)
4. If status changed, update `agents.status` and insert `agent_presence_events` rows:
   - `heartbeat.received`
   - optionally `status.changed` (include `from`, `to` in `meta`)
5. Emit WS event(s) to subscribed UIs.

### 4.2 Staleness sweep (offline detection)
Heartbeats can stop silently; Darshan should mark agents offline when stale.

Mechanism (v1): periodic job (every ~10–30s) does:
- for each agent with `agent_presence.last_seen_at < now() - STALE_AFTER`:
  - if currently `computed_status != 'offline'`:
    - set `computed_status='offline'`, update `agents.status='offline'`
    - insert `agent_presence_events`: `heartbeat.missed` and `status.changed`
    - emit WS update

Parameters:
- `HEARTBEAT_INTERVAL`: e.g., 10s
- `STALE_AFTER`: e.g., 30s (3 missed heartbeats)
- `DEGRADED_AFTER_ERRORS`: e.g., if last error within 2 min

Important: ignore out-of-order heartbeats by comparing `observed_at`/`last_seen_at`.

### 4.3 Connector session lifecycle (preferred)
If the connector maintains long-lived sessions, treat these as high-confidence signals:
- On session connect: upsert `agent_presence.session_id`, set `last_seen_at`, mark `online`.
- On session disconnect: mark `offline` immediately (or after a short grace window), insert `session.disconnected`.

This reduces reliance on sweep intervals and improves UI responsiveness.

### 4.4 Manual ping (user-initiated)
**Input**: `POST /api/v1/agents/:id/ping`.

Backend steps:
1. Insert `agent_presence_events`: `ping.requested` (audit_log too).
2. Enqueue a connector ping job (Redis).
3. On result:
   - success: insert `ping.succeeded`, update `last_seen_at`, maybe mark `online`.
   - failure/timeout: insert `ping.failed`, set `last_error_*`, maybe mark `degraded` or keep prior.
4. Emit WS update.

UI should show ping as a transient action; presence should still be primarily heartbeat/session-based.

---

## 5) Realtime UI hooks

### 5.1 WebSocket events
Use the shared envelope described in `ARCHITECTURE.md`.

Recommended events:
- `presence.agent.updated`
  - payload: `{ agentId, status, lastSeenAt, lastHeartbeatAt, sessionId?, lastError? }`
- `presence.agent.event` (optional, for a timeline panel)
  - payload: `{ agentId, eventType, observedAt, meta }`

Best practice:
- UI list uses `presence.agent.updated` to update badges without refetch.
- Only show `presence.agent.event` in an “Events/Debug” drawer to avoid noise.

### 5.2 UI components
- **Agents list row**
  - status badge (online/offline/degraded/unknown)
  - “last seen” tooltip (relative time)
  - optional “ping” button
- **Agent details panel**
  - last heartbeat, last error
  - presence event timeline (last N events)

### 5.3 API endpoints (suggested)
- `GET /api/v1/agents` includes cached fields:
  - `{ id, name, status, lastSeenAt?, lastHeartbeatAt? }`
- `GET /api/v1/agents/:id/presence/events?limit=100` returns timeline from `agent_presence_events`.

---

## 6) Edge cases / rules

### 6.1 Unknown vs offline
- `unknown`: agent has never connected/heartbeated since Darshan started tracking.
- `offline`: agent was seen before but is currently stale/disconnected.

### 6.2 Flapping protection
To avoid UI flicker:
- Use `STALE_AFTER` grace window.
- Optionally require N consecutive missed heartbeats before offline.
- On quick reconnect, record events but the UI can debounce (e.g., 500ms).

### 6.3 Degraded semantics
Set `degraded` when:
- connector ping fails but last heartbeat is recent, or
- a run request times out repeatedly, or
- connector reports partial failure (meta: `{"errorRate":...}` later).

### 6.4 Ordering + idempotency
- Use `agent_presence.last_seen_at` as the monotonic gate: ignore updates older than the stored timestamp.
- For connector callbacks, include an idempotency key (e.g., session id + seq) if needed.

---

## 7) Implementation notes (v1)

- Start with heartbeat-only + staleness sweep. Add session lifecycle when the connector supports it.
- Keep presence events lightweight; don’t store secrets or full logs in `meta`.
- Ensure presence updates are **fast** and don’t contend with message/runs writes:
  - separate indexes
  - small rows
  - consider batching WS broadcasts
