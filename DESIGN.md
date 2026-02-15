# Darshan Dashboard — UX Spec (3‑Pane Layout)

Darshan is an operations dashboard for coordinating and observing multiple agents. The UX focuses on: **fast routing of messages**, **real‑time visibility into agent activity**, and **safe intervention** when agents need help.

---

## 0) Layout overview (3 panes)

**Left pane (Navigation + Triage)**
- Primary: *Needs attention queue*, *Agents list*, *Saved views/filters*
- Secondary: *Search*, *Status filters*, *Tags*

**Center pane (Conversation / Activity timeline)**
- Threaded chat with streaming responses
- System events (handoffs, tool calls, errors) in-line
- Multi-agent “run” timeline when observing agent-to-agent work

**Right pane (Inspector / Controls)**
- Context: selected agent or thread metadata
- Controls: assign, broadcast, intervene, stop, escalate
- Diagnostics: last heartbeat, capabilities, recent runs, logs

Principle: **Left selects, Center acts, Right explains & controls.**

---

## 1) Information architecture (IA) + key screens

### 1.1 IA (top level)
1. **Dashboard (default)**
   - Needs Attention (queue)
   - Active Threads (recent)
   - Agents (roster)
2. **Thread / Run view** (same shell; center changes)
   - Direct thread (human ↔ agent)
   - Broadcast thread (human ↔ many agents)
   - Multi-agent run (agent ↔ agent with supervision)
3. **Agent profile**
   - Status + capability sheet
   - Recent threads/runs
   - Config (role, tags, routing rules) — MVP read-only unless required
4. **Audit & History**
   - Search across threads/messages/runs
   - Filters: agent, time, outcome, severity
5. **Settings** (MVP minimal)
   - Notification preferences
   - Role-based access

### 1.2 Key screens (within the 3‑pane shell)

#### A) Dashboard: “Needs Attention” (default landing)
- Left: Needs Attention queue + filters
- Center: Preview of selected item (thread excerpt + last events)
- Right: Suggested actions (assign, reply, escalate, close)

#### B) Direct Thread: “Chat with Agent”
- Left: agent list + recent threads
- Center: chat transcript with streaming
- Right: agent inspector (status, context summary, tools used, stop/retry)

#### C) Broadcast Thread
- Left: broadcast templates / groups (tags)
- Center: message composer + aggregated responses
- Right: recipients list, delivery status, retry failed, “convert to tasks”

#### D) Multi-agent Run (observe/intervene)
- Left: agents participating + run stages
- Center: run timeline (messages + key tool events)
- Right: intervention panel (nudge, redirect, pause, take over, add agent)

#### E) Agent Profile / Diagnostics
- Left: agent roster; select agent
- Center: recent activity feed
- Right: capabilities, last seen, error rate, links to runs/threads

---

## 2) Interaction flows

Notation:
- **User** = operator (Sumesh)
- **System** = Darshan UI/backend/orchestrator
- **Agent(s)** = connected assistants

### 2.1 Flow: Select agent (from roster to working thread)
**Goal:** quickly open the right thread for an agent.

1. **User** clicks *Agents* in Left pane (or uses search).
2. **System** shows roster rows with: name, status (online/busy/error), current thread/run indicator, “needs attention” badge.
3. **User** selects an agent row.
4. **System** opens:
   - **Center:** most recent thread with that agent (or “Start new thread”).
   - **Right:** agent inspector (status, tags, capabilities, last heartbeat).
5. **User** optionally switches thread via center header (thread dropdown).

Acceptance notes:
- Selection should be **single-click**, not modal.
- Preserve context: switching agents retains drafts per agent/thread.

### 2.2 Flow: Message an agent (direct)
**Goal:** send an instruction and receive a streaming reply with traceability.

1. **User** types in the composer at bottom of Center pane.
2. **User** hits **Enter** (send) or **Shift+Enter** (newline).
3. **System** appends message bubble; shows state: *queued → sent → delivered*.
4. **Agent** begins streaming response.
5. **System** renders streaming with:
   - token streaming indicator
   - expandable “events” (tool calls, delegation, errors)
6. **User** can:
   - **Stop** response (Right pane control)
   - **Regenerate** (if supported)
   - **Add clarification** (send follow-up)

Edge cases:
- If agent is offline: prompt to *queue message* vs *choose another agent*.
- If tool call fails: show inline error event with *Retry tool* (if safe) or *Escalate*.

### 2.3 Flow: Broadcast message (one-to-many)
**Goal:** send one prompt to multiple agents and compare results.

1. **User** clicks **Broadcast** action (header or Left pane shortcut).
2. **System** opens Broadcast mode:
   - Left: recipient picker (by tags/groups + individual override)
   - Center: composer + response grid/timeline
   - Right: recipient list with delivery + status
3. **User** selects recipients (min 2) and writes message.
4. **User** sends.
5. **System** shows per-agent lanes (or collapsible cards) with streaming replies.
6. **User** can:
   - pin best reply
   - request follow-up from a subset
   - “merge into summary” (MVP can be manual copy; later can auto-summarize)

MVP constraint:
- Do not allow recursive broadcasts triggered by agents; broadcast is operator-initiated.

### 2.4 Flow: Agent-to-agent observe/intervene (supervised run)
**Goal:** watch delegation/handoff between agents and intervene safely.

Entry points:
- From a thread event: “Agent delegated to X” → **Open Run**
- From agent profile: “Active run” → **Observe**

Flow:
1. **System** opens Multi-agent Run view.
2. **Left:** participants list + run stages (e.g., Plan → Execute → Validate).
3. **Center:** chronological timeline of:
   - agent messages
   - tool call events (collapsed by default)
   - handoffs (A → B)
   - warnings/errors
4. **Right:** intervention controls:
   - **Nudge** (send short guidance to one agent)
   - **Redirect** (change goal / constraints)
   - **Pause/Resume** run (if supported)
   - **Stop** run (hard stop)
   - **Take over** (operator sends authoritative instruction)
   - **Add agent** (invite a specialist)
5. **System** logs all interventions to audit.

Safety/clarity rules:
- Interventions must be **explicitly labeled** in the transcript (e.g., “Operator Intervention”).
- Provide confirmation for destructive actions (**Stop run**).
- If multiple agents are streaming simultaneously, show per-agent typing indicators.

### 2.5 Flow: Needs-attention queue (triage → resolve)
**Goal:** manage exceptions quickly (stuck runs, errors, approvals needed).

1. **System** continuously adds items to Needs Attention based on triggers:
   - agent error/tool failure
   - run timeout
   - “request approval” event
   - message unanswered beyond threshold
   - explicit “help needed” signal
2. **User** clicks *Needs Attention* (Left).
3. **System** shows queue items with:
   - severity (P0/P1/P2)
   - type (error/approval/unanswered/blocked)
   - agent(s) involved
   - age (time since trigger)
4. **User** selects an item.
5. **Center** shows the relevant context (last ~20 events) and recommended next steps.
6. **Right** offers actions:
   - **Assign to agent** (reroute)
   - **Reply / Approve / Reject**
   - **Retry last step** (if safe)
   - **Escalate** (create high-priority item / notify)
   - **Mark resolved**

Queue behaviors:
- Items are **stateful**: open → in progress → resolved.
- “Snooze” (MVP optional) hides item for a duration.

---

## 3) Component list (UI building blocks)

### 3.1 Global / Shell
- **App header**: product name, global search, connection indicator, user menu
- **3-pane layout container**: resizable panes, persisted widths
- **Global toast/notification system**: errors, successes, reconnecting

### 3.2 Left pane (Navigation + Triage)
- **Needs Attention list**
  - queue item row (severity pill, title, agent chips, timestamp)
  - filters (severity, type, agent, tag)
- **Agents roster**
  - agent row (avatar/initials, status dot, badges)
  - quick actions: message, observe, open profile
- **Saved views** (MVP: optional)
- **Search input** (agents/threads)

### 3.3 Center pane (Thread / Run)
- **Thread header**
  - title, participants, mode (Direct/Broadcast/Run)
  - controls: broadcast, observe, export
- **Message timeline**
  - message bubble (role: operator/agent/system)
  - streaming message renderer
  - event cards (tool calls, delegation, errors) collapsible
  - timestamp + delivery markers
- **Composer**
  - multiline input
  - send button
  - attachments (MVP optional)
  - per-thread draft persistence
- **Broadcast response lanes**
  - agent response cards with status
  - sort by: fastest, best rated, agent name

### 3.4 Right pane (Inspector / Controls)
- **Agent inspector**
  - status, tags, capabilities
  - last heartbeat / uptime
  - recent errors + links
- **Thread inspector**
  - metadata: created, last activity, labels, ACL (MVP read-only)
  - participants, run id
- **Run controls**
  - pause/resume/stop
  - intervention composer (short)
- **Action panel** for queue items
  - approve/reject/retry/assign

### 3.5 States & patterns
- Loading skeletons for lists and timeline
- Offline/reconnect banner
- Empty states (no agents online, no queue items)
- Confirmation dialog for destructive actions

---

## 4) Minimal MVP design (what to build first)

### 4.1 MVP goals
1. **Operator can message a selected agent** and receive responses in real-time.
2. **Operator can broadcast** to a set of agents and view responses side-by-side.
3. **Operator can observe a multi-agent run** as a unified timeline.
4. **Operator can triage Needs Attention** items to resolution.

### 4.2 MVP scope (must-have)
- 3-pane shell with resizable panes (persist locally)
- Left: Agents list + Needs Attention queue
- Center: Direct thread view with streaming
- Center: Broadcast view with per-agent response cards
- Center: Run view (read-only observe) with intervention message (send “nudge”)
- Right: Agent inspector + basic run controls (stop/observe)
- Basic audit labeling: operator interventions clearly marked

### 4.3 MVP out of scope (defer)
- Advanced analytics dashboards
- Complex workflow automation / routing rules UI
- Full RBAC editor (assume basic roles)
- Auto-summarization, evaluation scoring, or LLM-based clustering
- Attachment management, file browser, rich media

### 4.4 MVP success criteria (practical)
- < 2 clicks from landing to sending a message to an agent
- Queue item can be resolved in < 60 seconds for common cases (reply/assign/mark resolved)
- Operator can identify “who is doing what” across agents within 10 seconds of opening a run

---

## Appendix: Suggested triggers for Needs Attention (MVP)
- Tool call error (any)
- No agent response after N minutes
- Agent explicitly emits `needs_attention=true`
- Run exceeds time limit
- Operator @mention in thread
