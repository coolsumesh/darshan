# Attendance Monitoring (Presence) — Product Spec (Darshan v1)

**Owner:** Ops / Dashboard Operator (human)

**Problem:** Operators need a reliable way to know whether each agent is currently reachable, and to answer questions like **“who was offline when?”** for incident response, accountability, and operational planning.

**Scope of this spec:** Operator-facing product behavior and requirements for **presence + attendance history + reporting**. This builds on the implementation notes in `/ATTENDANCE.md` (heartbeat + derived status + optional sessions table).

---

## 1) Concepts & Definitions

- **Agent**: a Darshan-managed worker/assistant.
- **Heartbeat**: periodic signal from an agent runtime/connector to indicate liveness.
- **Presence**: current derived state for an agent.
  - `online`: recent heartbeat within threshold.
  - `offline`: heartbeat is stale beyond threshold.
  - `unknown`: never seen / not yet reported.
  - `away` (optional): agent reported but not actively available (not required for MVP).
- **Attendance** (v1): a **time series of online/offline intervals** derived from heartbeats and an offline timeout sweep.
- **Last seen**: timestamp of most recent heartbeat received by the server.

**Key principle:** presence should be **heartbeat-derived** (not WS-connectedness) to handle sleep/network blips more predictably.

---

## 2) User Stories (Operator View)

### A. Current presence (roster / triage)
1. **As an operator**, I can see a list of agents with a clear **online/offline/unknown** status so I can decide whom to contact.
2. **As an operator**, I can see **how recently** each agent was last seen (e.g., “last seen 12s ago / 5m ago”) so I can judge freshness.
3. **As an operator**, I can sort/filter the roster to show **offline agents** so I can triage connectivity issues.
4. **As an operator**, I can open an agent’s detail view to understand their **recent presence transitions** (online ↔ offline) to diagnose instability.

### B. Attendance history (who was offline when)
5. **As an operator**, I can view a timeline of an agent’s **online/offline intervals** for a selected date range (e.g., last 24h / last 7d) to answer “when did this agent drop?”
6. **As an operator**, I can see **duration totals** (e.g., total offline time in range) so I can quantify impact.

### C. Reporting and exports
7. **As an operator**, I can generate a report for a time range that lists **agents and their offline windows** so I can share it during incident review.
8. **As an operator**, I can export that report (CSV) so I can analyze or attach it to an incident ticket.

### D. Realtime updates
9. **As an operator**, I see presence changes update automatically (WS if available; polling fallback) so the roster stays accurate without refresh.

---

## 3) MVP Scope (v1) and Explicit Non-Goals

### MVP scope (must ship)
- **Current presence**
  - Status badge: `online | offline | unknown`.
  - “Last seen” timestamp and relative time.
  - Update via polling; WS updates optional but supported.
- **Attendance history**
  - Store and display online intervals (sessions) OR an equivalent derived interval model.
  - Per-agent history view: list + simple timeline for a date range.
- **Reporting (v1)**
  - Report: “who was offline when” for a time range across all agents.
  - CSV export of the same.

### Explicit non-goals (v1)
- **Payroll/compliance attendance** (no HR-grade guarantees, no shift scheduling).
- **User-level presence** (only agents).
- **Geolocation-based attendance**.
- **High-assurance tamper-proof telemetry** (signed heartbeats, nonce/seq enforcement) — recommended later (see `/ATTENDANCE.md` Security section).
- **Storing every heartbeat forever** (avoid unbounded event storage).
- **SLA alerting / paging** (basic UI visibility only; alerts can come later).
- **“Away/Busy” semantics** beyond basic online/offline/unknown.

---

## 4) Product Requirements & Behavior

### 4.1 Presence computation
- Presence is derived from `last_heartbeat_at` and a configured threshold:
  - If `now - last_heartbeat_at <= OFFLINE_AFTER_MS` ⇒ `online`
  - Else ⇒ `offline`
- `unknown` is used when the agent has no recorded heartbeat.

**Operator-visible expectation:** the “online” badge means “heartbeat recently received”, not “guaranteed responsive”.

### 4.2 Status transitions and history
- When an agent becomes online (first heartbeat or after being offline), start an **online interval**.
- When an agent becomes offline (timeout sweep determines heartbeat stale), close the interval.
- UI should reflect transitions within one polling cycle (or via WS).

### 4.3 Time range handling
- History and reports must support a time range (`from`, `to`):
  - Default quick ranges: last 1h, 24h, 7d.
  - Display times in operator’s local time zone; store in UTC.

---

## 5) Acceptance Criteria + Edge Cases

### 5.1 Agents list (roster)
**Acceptance criteria**
- Each agent row shows:
  - Name
  - Presence badge (`online/offline/unknown`)
  - Last seen (absolute + relative)
- Presence updates without full page refresh:
  - Polling interval ≤ 20s (configurable)
  - If WS present, status changes reflect within ~2s.
- Filtering:
  - Filter by status (at minimum: offline).

**Edge cases**
- **Never seen** agent: status = `unknown`, last seen = “—”.
- **Clock skew**: if heartbeat timestamp is server-side, display based on server time; if client provides timestamps, server must prefer received time (avoid “last seen in the future”).
- **Flapping**: agents that alternate online/offline rapidly should not spam the UI; show transitions in detail view, but list view remains stable.

### 5.2 Agent detail view (presence + history)
**Acceptance criteria**
- Detail view shows:
  - Current status + last seen
  - A history section for chosen range
  - Each interval displays start, end (or “ongoing”), and duration
- If an interval overlaps the requested range boundaries, it must be **clipped** to the range for duration calculations.

**Edge cases**
- **Ongoing session**: end is null; display “Online since …” and compute duration to now.
- **No data in range**: show empty state (“No presence data for this range”).
- **Agent deleted**: history should be inaccessible or clearly labeled; depends on retention policy.

### 5.3 Offline determination & sweep
**Acceptance criteria**
- If no heartbeat for > `OFFLINE_AFTER_MS`, agent becomes offline.
- A status transition to offline creates/ends an interval entry so reporting can answer “when”.

**Edge cases**
- **Network blip shorter than threshold**: should not mark offline.
- **Server restarts**: sweep resumes; open intervals should be closed when timeout is detected.
- **Duplicate heartbeats**: should not create duplicate sessions.

### 5.4 Reporting (“who was offline when”) v1
**Acceptance criteria**
- A report for range [`from`, `to`] returns, for each agent:
  - Total offline duration in range
  - List of offline windows (start/end/duration)
- CSV export matches on-screen report and includes timezone/UTC clarity.

**Edge cases**
- **Partial intervals**: if offline started before `from`, start time is clipped to `from` for report.
- **Ongoing offline** at `to` or “now”: end is `to` (or now for “current range”).

---

## 6) Minimal UI Requirements (v1)

### 6.1 Agents list (Left pane roster)
Must show per agent:
- **Name**
- **Presence badge** (color + label): online / offline / unknown
- **Last seen** (relative, e.g., “12s ago”, plus tooltip absolute timestamp)
- Optional (nice-to-have, not required): session id / hostname in tooltip.

Must support:
- Filter: status = offline (at minimum)
- Sort: last seen desc (optional but helpful)

### 6.2 Agent detail view (Right pane inspector or dedicated page)
Must show:
- Current presence badge
- Last heartbeat / last seen timestamp
- “Online since” (if online) OR “Offline since” (if offline), derived from most recent transition
- History range selector (1h/24h/7d + custom)
- History list/table of intervals:
  - Status (online/offline)
  - Start time
  - End time (or “ongoing”)
  - Duration

### 6.3 History visualization (minimal)
MVP visualization can be simple:
- A vertical list of intervals OR
- A basic horizontal timeline bar segmented by online/offline

No advanced charts required.

---

## 7) Reporting Requirements (v1): “Who was offline when”

### 7.1 Report types
1. **Offline Windows Report (primary v1)**
   - Input: time range (`from`, `to`)
   - Output: per agent list of offline windows + totals.

2. **Agent Attendance Summary (secondary, if cheap)**
   - Per agent: total online time, offline time, availability percentage.

### 7.2 Minimum report fields
Per agent:
- Agent name + id
- Total offline duration in range
- Offline windows (each): start, end, duration
- Count of offline events

### 7.3 Export
- CSV export of Offline Windows Report
- Columns (suggested):
  - agent_id, agent_name, window_start_utc, window_end_utc, duration_seconds
- If UI displays local time, CSV should either be UTC or include timezone offset columns.

---

## 8) Notes for Engineering Alignment (from existing docs)

Darshan already proposes (see `/ATTENDANCE.md`):
- `POST /api/v1/agents/:agentId/heartbeat`
- `agent_presence` table for current state
- Optional `agent_sessions` table for intervals
- Offline timeout sweep job
- WS event `presence.updated` (plus polling fallback)

This spec does **not** prescribe schema details, but assumes the system can produce interval-based history needed for reporting.
