# Spec: Attendance (Agent Presence + Attendance History)

## Goal
Provide a reliable, audit-friendly way to answer:
- **Who is online now?** (presence)
- **When were they online/offline?** (attendance history)
- **How much time were they online in a range?** (reporting)

> This spec is product-facing and testable. Implementation details can follow `ATTENDANCE.md`.

---

## Actors
- **Operator (Admin/Manager):** views presence + attendance reports.
- **Agent runtime/connector:** sends heartbeats.
- **System:** derives presence, closes/open sessions, generates reports.

---

## User stories
1. **Live presence**: As an Operator, I can see each agent’s current status (online/offline/unknown/away) and last seen time.
2. **Staleness handling**: As an Operator, agents automatically flip to offline when heartbeats stop.
3. **Attendance history**: As an Operator, I can view an agent’s online sessions over a date range.
4. **Time totals**: As an Operator, I can see total online time and uptime % per agent over a date range.
5. **Export**: As an Operator, I can export attendance data (CSV) for a date range.

---

## MVP scope
### In scope
- Heartbeat ingestion (authenticated) that updates `last_heartbeat_at`.
- Presence computation using a timeout threshold (no reliance on WS disconnect).
- Sessionization into **online intervals** (open session on first heartbeat after offline; close on timeout sweep).
- Read APIs for:
  - agent list with computed presence
  - sessions for a specific agent in a date range
  - aggregated totals per agent in a date range
- Minimal UI:
  - Agents list with presence badge + last seen
  - Attendance report page with date range and per-agent totals
  - Export CSV

### Explicit non-goals (MVP)
- Payroll/HR compliance, “clock-in/out” approvals, breaks/lunch tracking.
- Location/biometric verification.
- Per-heartbeat event storage and forensic timeline.
- Complex RBAC beyond “only authorized Operators can view.”
- SLA calculations beyond simple uptime % in a chosen range.

---

## Functional requirements
### Presence states
- `unknown`: never seen a heartbeat.
- `online`: last heartbeat is within threshold.
- `offline`: last heartbeat older than threshold.
- `away`: optional input from agent/runtime (treated as online for totals unless configured otherwise).

### Presence rule (testable)
Let `OFFLINE_AFTER_MS` be configured.
- If `now - last_heartbeat_at <= OFFLINE_AFTER_MS` → status is `online` (or `away` if last reported away)
- Else → status is `offline`

### Sessions (attendance history)
- Session = interval `[started_at, ended_at)`.
- Open a session when an agent transitions to online from offline/unknown.
- Close an open session when a timeout sweep marks the agent offline.
- A session with no `ended_at` is considered “currently ongoing.”

### Reporting
For each agent and a given `[from, to)` range:
- **Total online seconds** = sum of overlap between each session and the range.
- **Uptime %** = total_online_seconds / (to-from) * 100.
- Report includes: sessions count, first seen, last seen (within range).

---

## Acceptance criteria (with edge cases)
### A. Heartbeat updates presence
- Given an existing agent, when a valid heartbeat is received, the agent’s `last_heartbeat_at` is updated and presence becomes `online`.
- Invalid auth → heartbeat rejected (no DB write).
- Oversized `meta` payload is rejected (bounded request size).

### B. Offline timeout works (sweep)
- Given an agent with `last_heartbeat_at` older than `OFFLINE_AFTER_MS`, when the sweep runs, the agent becomes `offline`.
- Sweep is idempotent: running it twice does not create duplicate transitions/sessions.

### C. Session boundaries are correct
- First heartbeat after `unknown` opens a session.
- Heartbeats while already online do **not** open new sessions.
- When an agent times out to offline, any open session is closed with `ended_at` set.

### D. Flapping & jitter
- If heartbeats are slightly late but within threshold, status remains online and the session remains open.
- If heartbeats repeatedly cross the threshold (flap), sessions may be split; the system must not create overlapping sessions.

### E. Multiple runtimes / session identity
- If two different `sessionId`s heartbeat for the same agent within the threshold, MVP behavior must be deterministic:
  - either (recommended) treat the latest heartbeat as authoritative and keep one open session,
  - or reject concurrent sessions.

### F. Reporting correctness
- Sessions overlapping the report range are clipped to the range when computing totals.
- Ongoing session contributes up to `min(now, to)`.
- Timezone/DST: report range is evaluated in UTC; UI may display in user timezone.

### G. Deletions
- Deleting an agent removes its presence and sessions (or tombstones them); reporting must not error.

---

## Minimal UI (MVP)
### 1) Agents list
- Columns: Agent name, Status badge, Last seen (relative + exact timestamp on hover).
- Filters: status (online/offline/unknown/away).
- Sorting: status then last seen.

### 2) Attendance report
- Inputs: date range picker (`from`, `to`) and optional agent filter.
- Table: Agent, total online (hh:mm), uptime %, sessions count.
- Drill-in: click agent → sessions list (started_at, ended_at, duration).
- Export: “Download CSV” for current filters.

---

## API surface (contract-level)
(Exact paths can follow the existing API conventions.)
- `POST /api/v1/agents/:agentId/heartbeat`
- `GET /api/v1/agents` → includes `status`, `lastHeartbeatAt`.
- `GET /api/v1/agents/:agentId/sessions?from=...&to=...`
- `GET /api/v1/reports/attendance?from=...&to=...&agentId=...` (optional aggregated endpoint)
- `GET /api/v1/reports/attendance.csv?from=...&to=...` (export)

---

## Open questions
- Should `away` count as online for totals? (default: **yes**)
- Should concurrent sessions be rejected or last-writer-wins? (pick one for MVP)
- Retention: how long to keep sessions? (default: 90 days; configurable)
