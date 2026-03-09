# Messaging Redesign Spec
**Status:** Draft v3  
**Author:** Sanjaya  
**Date:** 2026-03-09  
**Replaces:** v2

---

## 1. Problem

The current `agent_inbox` table mixes three concerns that belong in separate systems:

1. **Conversation messaging** — agent ↔ agent, human ↔ agent messages
2. **Ping / heartbeat tracking** — are agents alive and responding?
3. **Task notifications** — agent was assigned a task

Mixing them causes:

- History lost when inbox is cleared
- Message content duplicated per recipient
- No read receipts
- Reply structure enforced by string IDs, not FK constraints
- Pings and task events contaminate conversation history
- Agent-only naming (`from_agent_id`, `agent_id`) blocks human participation

---

## 2. Three Separate Systems

Each concern gets its own dedicated design. They do not share tables.

| Concern | Solution |
|---|---|
| Conversations | `threads` + `thread_participants` + `thread_messages` + `notifications` |
| Agent pings | `agent_pings` (separate spec) |
| Task events | `tasks` table already exists — no change |

This spec covers **conversations only**.

---

## 3. Goals

- Clean separation from pings and tasks
- Human ↔ agent, agent ↔ agent, human ↔ human in the same schema
- Explicit participant control — who can join, who can be removed
- Message content stored once, notifications fan out per recipient
- Full read receipt tracking: delivered → read → processed
- Reply structure enforced at DB level via FK
- Raw data readable without joining — slugs stored alongside UUIDs

---

## 4. Schema

### 4.1 `threads`

A thread is a named conversation. It owns all messages and defines the participant list.

```sql
CREATE TABLE threads (
  thread_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      text        NOT NULL,
  project_id   uuid        REFERENCES projects(id) ON DELETE SET NULL,
  created_by   uuid        NOT NULL,
  created_slug text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
```

| Column | Description |
|---|---|
| `thread_id` | Unique identifier |
| `subject` | Human-readable topic e.g. "Deploy review needed" |
| `project_id` | Optional — scopes thread to a project |
| `created_by` | UUID of who opened the thread (agent or user) |
| `created_slug` | Slug snapshot of creator e.g. `SANJAYA` — for raw readability |
| `created_at` | When the thread was opened |

**On `created_slug`:** Denormalized at insert time. If a slug changes later, this is a historical snapshot — intentional. Reading the raw table immediately tells you who created a thread without any joins.

---

### 4.2 `thread_participants`

Who is in a thread, when they joined, and whether they are still active.

```sql
CREATE TABLE thread_participants (
  thread_id      uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  participant_id uuid        NOT NULL,
  participant_slug text      NOT NULL,
  added_by       uuid        NOT NULL,
  added_by_slug  text        NOT NULL,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz,
  PRIMARY KEY (thread_id, participant_id)
);
```

| Column | Description |
|---|---|
| `participant_id` | Agent or user UUID |
| `participant_slug` | Slug snapshot e.g. `MITHRAN`, `SUMESH` |
| `added_by` | UUID of who added them |
| `added_by_slug` | Slug snapshot of who added them |
| `joined_at` | When they were added |
| `removed_at` | Null = active. Set = removed. Soft delete for audit trail |

**Rules:**
- Thread creator is auto-added as participant on creation
- **Only the thread creator can add or remove participants**
- Removed participants retain full read access to thread history
- A removed participant can be re-added: update `removed_at = null`, update `joined_at`
- Active participant = `removed_at IS NULL`

---

### 4.3 `thread_messages`

A single message or event within a thread. Content stored once regardless of recipient count.

```sql
CREATE TABLE thread_messages (
  message_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  reply_to    uuid        REFERENCES thread_messages(message_id) ON DELETE SET NULL,
  sender_id   uuid        NOT NULL,
  sender_slug text        NOT NULL,
  type        text        NOT NULL DEFAULT 'message' CHECK (type IN ('message', 'event')),
  body        text        NOT NULL,
  sent_at     timestamptz NOT NULL DEFAULT now()
);
```

| Column | Description |
|---|---|
| `message_id` | Unique identifier |
| `thread_id` | Which thread this belongs to |
| `reply_to` | FK to parent message. Null = thread opener or new branch |
| `sender_id` | UUID of sender (agent or user) |
| `sender_slug` | Slug snapshot e.g. `SANJAYA` — for raw readability |
| `type` | `message` = real content. `event` = system action (participant added/removed) |
| `body` | The message content or event description |
| `sent_at` | When it was sent |

**Event messages** (`type = 'event'`) are auto-generated by the server when participant changes occur. They appear in the thread timeline but are visually distinct in the UI.

Examples:
```
type=event  body="ARJUN was removed by SANJAYA"
type=event  body="SURAKSHA was added by SANJAYA"
```

**Reply tree:**

```
msg-001  sender_slug=SANJAYA   reply_to=null
  └── msg-002  sender_slug=MITHRAN  reply_to=msg-001
  └── msg-003  sender_slug=ARJUN    reply_to=msg-001
        └── msg-004  sender_slug=SANJAYA  reply_to=msg-003
```

---

### 4.4 `notifications`

One row per recipient per message. Tracks delivery state independently per person.

```sql
CREATE TABLE notifications (
  notification_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid        NOT NULL,
  recipient_slug  text        NOT NULL,
  message_id      uuid        NOT NULL REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  priority        text        NOT NULL DEFAULT 'normal' CHECK (priority IN (
                                'high', 'normal', 'low'
                              )),
  status          text        NOT NULL DEFAULT 'pending' CHECK (status IN (
                                'pending', 'delivered', 'read', 'processed', 'expired'
                              )),
  response_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz,
  read_at         timestamptz,
  processed_at    timestamptz,
  expires_at      timestamptz
);
```

| Column | Description |
|---|---|
| `notification_id` | Unique identifier |
| `recipient_id` | Agent or user UUID |
| `recipient_slug` | Slug snapshot e.g. `MITHRAN` — for raw readability |
| `message_id` | The message being delivered |
| `priority` | `high / normal / low` — agents process high first |
| `status` | Current delivery state |
| `response_note` | What recipient said when processing |
| `created_at` | When notification was created |
| `delivered_at` | When WS push fired |
| `read_at` | When recipient fetched the message body |
| `processed_at` | When recipient explicitly acknowledged |
| `expires_at` | Auto-expire stale notifications |

**Fan-out rule:**  
When a message is sent, one notification row is created for every **active participant** (`removed_at IS NULL`) except the sender.

---

## 5. Raw Data Readability

Every table stores a slug snapshot alongside each UUID. Reading raw DB output requires no joins to understand who did what.

**Example — reading `thread_messages` raw:**

```
message_id   thread_id    sender_slug  type     body                                    sent_at
-----------  -----------  -----------  -------  --------------------------------------  -------------------
msg-001      thread-002   SANJAYA      message  "Arjun, take ownership of onboarding."  2026-03-09 21:10:00
msg-002      thread-002   ARJUN        message  "Understood. Starting now."             2026-03-09 21:11:00
msg-003      thread-002   SANJAYA      event    "ARJUN was removed by SANJAYA"          2026-03-09 21:15:00
msg-004      thread-002   SANJAYA      event    "SURAKSHA was added by SANJAYA"         2026-03-09 21:15:01
msg-005      thread-002   SANJAYA      message  "Suraksha, you are taking over."        2026-03-09 21:16:00
```

No UUID lookups needed to understand the conversation.

---

## 6. Status Lifecycle

```
            delivered_at        read_at          processed_at
                 │                 │                   │
pending ──────► delivered ──────► read ──────────► processed
                                                    expired  ← expires_at passed
```

| Status | Triggered by |
|---|---|
| `pending` | Notification row inserted |
| `delivered` | WS push fired by server |
| `read` | Recipient calls `GET /threads/:id/messages/:message_id` |
| `processed` | Recipient calls `POST /notifications/:id/process` |
| `expired` | Background job when `now() > expires_at` |

---

## 7. UUID Resolution

`created_by`, `sender_id`, `participant_id`, `recipient_id` are plain UUIDs — no FK constraint — they may reference `agents.id` or `users.id`. Resolution at the API layer:

```
1. SELECT id FROM agents WHERE id = $uuid  →  found: agent
2. SELECT id FROM users  WHERE id = $uuid  →  found: user
```

Slugs stored in the table give immediate readability without this lookup.

---

## 8. Thread Retention and Visibility

- **Threads live indefinitely** until explicitly deleted by the creator
- **Frontend default view:** latest 10 threads per user/agent
- **Older threads:** searchable by subject, participant slug, date range
- **Who can see a thread:** active participants + removed participants (read-only)
- **Who can delete a thread:** creator only

---

## 9. API Design

### Threads

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads` | any | Create thread, define initial participants |
| `GET` | `/api/v1/threads` | caller | List threads caller is part of (latest 10 default) |
| `GET` | `/api/v1/threads?search=` | caller | Search threads by subject or participant slug |
| `GET` | `/api/v1/threads/:thread_id` | participant | Thread metadata + participant list |
| `DELETE` | `/api/v1/threads/:thread_id` | creator only | Delete thread and all messages |

### Participants

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/participants` | creator only | Add a participant |
| `DELETE` | `/api/v1/threads/:thread_id/participants/:id` | creator only | Remove a participant (soft delete) |
| `GET` | `/api/v1/threads/:thread_id/participants` | participant | List all — active and removed |

### Messages

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/messages` | active participant | Send message, fan-out notifications |
| `GET` | `/api/v1/threads/:thread_id/messages` | participant | All messages including events |
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id` | participant | Single message — sets `read_at` |

### Notifications

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | caller | Poll pending notifications |
| `POST` | `/api/v1/notifications/:id/process` | recipient | Mark processed, attach `response_note` |

### Receipts

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id/receipts` | sender | Per-recipient read receipt breakdown |

---

## 10. Scenarios

### Scenario A — Private thread: Sanjaya ↔ Mithran only

```
POST /api/v1/threads
{ "subject": "Deployment review", "participants": ["mithran-id"] }
→ { "thread_id": "thread-001" }
```

Participants: `SANJAYA` (auto, creator) + `MITHRAN`

```
POST /api/v1/threads/thread-001/messages
{ "body": "Mithran, can you verify the deploy output?" }
→ { "message_id": "msg-001" }
```
Server fans out: 1 notification → `MITHRAN`. Sanjaya gets none.

```
GET /api/v1/notifications                              ← MITHRAN polls
GET /api/v1/threads/thread-001/messages/msg-001        ← MITHRAN reads → read_at set

POST /api/v1/threads/thread-001/messages               ← MITHRAN replies
{ "body": "All green. Deploy is clean.", "reply_to": "msg-001" }
→ { "message_id": "msg-002" }
```
Server fans out: 1 notification → `SANJAYA`.

```
GET /api/v1/threads/thread-001/messages/msg-001/receipts   ← SANJAYA checks
→ {
    "receipts": [
      {
        "recipient_slug": "MITHRAN",
        "delivered_at":   "21:10:00",
        "read_at":        "21:12:00",
        "processed_at":   null
      }
    ]
  }
```

**Raw thread_messages:**
```
msg-001  SANJAYA  message  "Mithran, can you verify the deploy output?"
  └── msg-002  MITHRAN  message  "All green. Deploy is clean."
```

---

### Scenario B — Swap Arjun for Suraksha

```
POST /api/v1/threads
{ "subject": "Agent coordination — Q1 tasks", "participants": ["arjun-id"] }
→ { "thread_id": "thread-002" }
```

Participants: `SANJAYA` + `ARJUN`

```
POST /api/v1/threads/thread-002/messages
{ "body": "Arjun, take ownership of the onboarding pipeline." }
→ msg-003 → notification → ARJUN

POST /api/v1/threads/thread-002/messages              ← by ARJUN
{ "body": "Understood. Starting now.", "reply_to": "msg-003" }
→ msg-004 → notification → SANJAYA
```

**Sanjaya removes Arjun:**
```
DELETE /api/v1/threads/thread-002/participants/arjun-id
→ { "ok": true }
```
Server auto-generates event message:
```
msg-005  SANJAYA  event  "ARJUN was removed by SANJAYA"
         → no notifications (event messages do not notify)
```
Arjun retains read access. Gets no new notifications.

**Sanjaya adds Suraksha:**
```
POST /api/v1/threads/thread-002/participants
{ "participant_id": "suraksha-id" }
→ { "ok": true }
```
Server auto-generates event message:
```
msg-006  SANJAYA  event  "SURAKSHA was added by SANJAYA"
         → no notifications (event messages do not notify)
```
Suraksha can now read full history including msg-003, msg-004.

**Sanjaya messages Suraksha:**
```
POST /api/v1/threads/thread-002/messages
{ "body": "Suraksha, you are taking over from Arjun. Please review earlier messages." }
→ msg-007 → notification → SURAKSHA only
            (ARJUN removed — gets nothing)
```

**Raw thread_messages:**
```
msg-003  SANJAYA   message  "Arjun, take ownership of the onboarding pipeline."
  └── msg-004  ARJUN     message  "Understood. Starting now."
msg-005  SANJAYA   event    "ARJUN was removed by SANJAYA"
msg-006  SANJAYA   event    "SURAKSHA was added by SANJAYA"
msg-007  SANJAYA   message  "Suraksha, you are taking over from Arjun..."
```

No joins. No UUID lookups. The thread reads clearly as plain text.

---

## 11. What is NOT in this spec

| Concern | Where it lives |
|---|---|
| Agent pings and liveness checks | Separate `agent_pings` table — own spec |
| Task assignments and status | Existing `tasks` table — unchanged |
| Real-time WS delivery mechanism | Existing WS layer — unchanged |
| Org / project access control | Existing auth middleware — unchanged |

---

## 12. Open Questions

### Q1 — Fan-out on event messages
Should participant-change events (`type=event`) generate notifications, or appear silently in the thread timeline only?

*Decision: silently — event messages do not trigger notifications. Rationale: participants are not actioning an event, just observing it.*

---

### Q2 — Can a participant message themselves?
If a thread has only one active participant (all others removed), can that participant still post?

*No decision yet.*

---

### Q3 — Search scope
`GET /api/v1/threads?search=` — should search cover:
- Subject only
- Subject + participant slugs
- Subject + slugs + message body (full text)

*No decision yet — full text search has indexing implications.*

---

### Q4 — Thread delete behaviour
When the creator deletes a thread:
- Hard delete: all messages and notifications gone permanently
- Soft delete: `deleted_at` set, data retained for a grace period

*No decision yet.*

---

## 13. Summary

| | Before | After |
|---|---|---|
| Message storage | Duplicated per recipient in payload | Once in `thread_messages` |
| Notifications | Mixed with content | Separate `notifications` table |
| Pings | Mixed into `agent_inbox` | Own `agent_pings` table |
| Tasks | Mixed into `agent_inbox` | Existing `tasks` table — no change |
| Reply structure | `corr_id` strings — no FK | `reply_to` FK — DB enforced |
| Read receipts | None | `delivered_at` → `read_at` → `processed_at` |
| Participant control | None | `thread_participants` — creator controls |
| Human support | No | Yes — slug + UUID pattern, no type column |
| Raw readability | UUID everywhere | Slug snapshots on every row |
| History on inbox clear | Lost | Preserved — messages separate from notifications |
| Thread retention | Ephemeral (inbox) | Indefinite until creator deletes |
| N recipients | N copies of content | 1 message + N notification rows |
