# Messaging Redesign Spec
**Status:** Draft v2  
**Author:** Sanjaya  
**Date:** 2026-03-09  
**Replaces:** v1 (initial draft)

---

## 1. Problem

The current `agent_inbox` table mixes two concerns that should be separate:

1. **Message storage** — content lives inside a `payload` JSON blob on the inbox row
2. **Notification queue** — the same row also tracks delivery and processing state

This causes:

- **History lost on clear.** Deleting inbox rows deletes the conversation.
- **Content duplicated per recipient.** The same message text is stored N times.
- **No read receipts.** No way to tell if a message was opened vs just delivered.
- **Reply chaining is fragile.** `corr_id` + `reply_to_corr_id` are free-form strings with no FK enforcement.
- **Redundant threading.** `thread_id` and `corr_id/reply_to_corr_id` both partially solve threading but neither does it completely.
- **Agent-only.** Column names like `from_agent_id`, `agent_id` prevent humans from participating in the same threads.
- **No participant control.** No concept of who belongs to a thread, who can be added or removed.

---

## 2. Goals

- Separate message storage from notification delivery
- Support human ↔ agent, agent ↔ agent, and human ↔ human in the same schema
- Explicit participant management — who is in a thread, who can send and receive
- Track delivery, read, and processed states independently per recipient
- Store message content once regardless of recipient count
- Enforce reply structure at the DB level via FK, not strings
- Schema readable without knowing internal jargon

---

## 3. Non-Goals

- Replacing the real-time WebSocket delivery layer
- Replacing the `tasks` table or task workflow
- System events (ping, welcome) — handled separately, not through threads
- Multi-tenancy / org-level isolation (handled by `project_id`)

---

## 4. Schema

### 4.1 `threads`

A thread is a named conversation. It owns all messages and defines the participant list.

```sql
CREATE TABLE threads (
  thread_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject    text        NOT NULL,
  project_id uuid        REFERENCES projects(id) ON DELETE SET NULL,
  created_by uuid        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

| Column | Type | Description |
|---|---|---|
| `thread_id` | uuid | Unique identifier |
| `subject` | text | Human-readable topic e.g. "Deploy review needed" |
| `project_id` | uuid | Optional — scopes thread to a project. Null = global |
| `created_by` | uuid | Who opened the thread. Resolves to `agents.id` or `users.id` |
| `created_at` | timestamptz | When the thread was opened |

---

### 4.2 `thread_participants`

Tracks who is in a thread and their current membership state.

```sql
CREATE TABLE thread_participants (
  thread_id      uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  participant_id uuid        NOT NULL,
  added_by       uuid        NOT NULL,
  joined_at      timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz,
  PRIMARY KEY (thread_id, participant_id)
);
```

| Column | Type | Description |
|---|---|---|
| `thread_id` | uuid | The thread this participant belongs to |
| `participant_id` | uuid | Agent or user UUID |
| `added_by` | uuid | Who added them (creator or another participant) |
| `joined_at` | timestamptz | When they were added |
| `removed_at` | timestamptz | Null = active. Set = removed. Soft delete for audit |

**Rules:**
- Creator is auto-added as a participant on thread creation
- Only active participants (`removed_at IS NULL`) can send messages
- Only active participants receive new notifications
- Removed participants keep their historical messages and read receipts
- A removed participant can be re-added (new `joined_at`, clear `removed_at`)

---

### 4.3 `thread_messages`

A single message within a thread. Content stored once regardless of recipient count.

```sql
CREATE TABLE thread_messages (
  message_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  reply_to   uuid        REFERENCES thread_messages(message_id) ON DELETE SET NULL,
  sender_id  uuid        NOT NULL,
  body       text        NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
```

| Column | Type | Description |
|---|---|---|
| `message_id` | uuid | Unique identifier |
| `thread_id` | uuid | Which thread this belongs to |
| `reply_to` | uuid | Parent message FK. Null = first message or new branch |
| `sender_id` | uuid | Who sent it. Resolves to `agents.id` or `users.id` |
| `body` | text | The message content |
| `sent_at` | timestamptz | When it was sent |

**Reply tree structure:**

```
msg-001  reply_to=null          ← thread opener
  └── msg-002  reply_to=msg-001 ← Mithran replies to opener
  └── msg-003  reply_to=msg-001 ← Arjun replies to opener independently
        └── msg-004  reply_to=msg-003 ← Sanjaya replies to Arjun
```

`thread_id` gives you a flat list of all messages.
`reply_to` gives you the exact tree of who replied to whom.

---

### 4.4 `notifications`

One row per recipient per message. The delivery and read-receipt tracking layer.

```sql
CREATE TABLE notifications (
  notification_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid        NOT NULL,
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

| Column | Type | Description |
|---|---|---|
| `notification_id` | uuid | Unique identifier |
| `recipient_id` | uuid | Who receives this. Resolves to `agents.id` or `users.id` |
| `message_id` | uuid | The message being delivered |
| `priority` | text | `high / normal / low` — agents process high first |
| `status` | text | Current delivery state (see lifecycle below) |
| `response_note` | text | What recipient said when processing |
| `created_at` | timestamptz | When the notification was created |
| `delivered_at` | timestamptz | When WS push fired |
| `read_at` | timestamptz | When recipient fetched the message body |
| `processed_at` | timestamptz | When recipient explicitly acknowledged |
| `expires_at` | timestamptz | After this time, status moves to `expired` |

**Fan-out rule:** When a message is sent, one notification row is created for every active participant except the sender.

---

## 5. Status Lifecycle

```
            delivered_at        read_at          processed_at
                 │                 │                   │
pending ──────► delivered ──────► read ──────────► processed
                                              OR
                                            expired  ← expires_at passed
```

| Status | Meaning | Set by |
|---|---|---|
| `pending` | Notification created, WS push not yet attempted | Notification insert |
| `delivered` | WS push fired to recipient | WebSocket layer |
| `read` | Recipient called `GET /threads/:id/messages/:id` | API — `GET message` endpoint |
| `processed` | Recipient explicitly marked it done | `POST /notifications/:id/process` |
| `expired` | `expires_at` passed before `processed` | Background job or lazy eval on read |

**Three signals, three meanings:**

| Signal | Who triggers it | What it proves |
|---|---|---|
| `delivered_at` | Server | Notification reached the agent's queue |
| `read_at` | Recipient (implicit, on fetch) | Recipient opened the message |
| `processed_at` | Recipient (explicit, on ack) | Recipient acted on it |

---

## 6. Sender Resolution

`created_by`, `sender_id`, `participant_id`, `recipient_id`, `added_by` are all plain UUIDs with no FK constraint — they may reference either `agents.id` or `users.id`.

Resolution at query time:

```
1. Query agents WHERE id = uuid  →  found: it's an agent
2. Query users  WHERE id = uuid  →  found: it's a user
```

The API layer owns this resolution. No `_type` column stored. No redundancy.

---

## 7. API Design

### Threads

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads` | user or agent token | Create a thread, define initial participants |
| `GET` | `/api/v1/threads` | user or agent token | List threads the caller is a participant of |
| `GET` | `/api/v1/threads/:thread_id` | participant only | Get thread metadata + participant list |

### Participants

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/participants` | participant | Add a new participant |
| `DELETE` | `/api/v1/threads/:thread_id/participants/:id` | participant | Remove a participant (soft delete) |
| `GET` | `/api/v1/threads/:thread_id/participants` | participant | List all participants (active + removed) |

### Messages

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/messages` | active participant | Send a message, fan-out notifications |
| `GET` | `/api/v1/threads/:thread_id/messages` | participant | List all messages in thread |
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id` | participant | Fetch one message — sets `read_at` |

### Notifications

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | user or agent token | Poll pending notifications for caller |
| `POST` | `/api/v1/notifications/:id/process` | recipient only | Mark processed, attach `response_note` |

### Receipts

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id/receipts` | sender only | Per-recipient read receipt breakdown |

---

## 8. Scenarios

### Scenario A — Private thread: Sanjaya ↔ Mithran only

```
POST /api/v1/threads
{ "subject": "Deployment review", "participants": ["mithran-id"] }
→ { "thread_id": "thread-001" }
```
Participants: Sanjaya (auto, creator) + Mithran

```
POST /api/v1/threads/thread-001/messages
{ "body": "Mithran, can you verify the deploy output?" }
→ { "message_id": "msg-001" }
```
→ 1 notification created for Mithran. Sanjaya gets none (no self-notify).

```
GET /api/v1/notifications                       ← Mithran polls
→ [{ notification_id, message_id: "msg-001", status: "delivered" }]

GET /api/v1/threads/thread-001/messages/msg-001 ← Mithran reads
→ message body                                  ← read_at set automatically

POST /api/v1/threads/thread-001/messages
{ "body": "All green. Deploy is clean.", "reply_to": "msg-001" }
→ { "message_id": "msg-002" }
```
→ 1 notification created for Sanjaya.

```
GET /api/v1/threads/thread-001/messages/msg-001/receipts  ← Sanjaya checks
→ {
    "receipts": [
      {
        "recipient_id": "mithran-id",
        "delivered_at": "21:10:00",
        "read_at":      "21:12:00",
        "processed_at": null
      }
    ]
  }
```

**Thread state:**
```
thread-001: "Deployment review"
participants: Sanjaya ✅  Mithran ✅

msg-001  Sanjaya → "Mithran, can you verify the deploy output?"
  └── msg-002  Mithran → "All green. Deploy is clean."
```

---

### Scenario B — Sanjaya + Arjun, then swap Arjun for Suraksha

**Create thread:**
```
POST /api/v1/threads
{ "subject": "Agent coordination — Q1 tasks", "participants": ["arjun-id"] }
→ { "thread_id": "thread-002" }
```
Participants: Sanjaya + Arjun

**Exchange messages:**
```
POST /api/v1/threads/thread-002/messages
{ "body": "Arjun, take ownership of the onboarding pipeline." }
→ msg-003 → notification → Arjun

POST /api/v1/threads/thread-002/messages  (by Arjun)
{ "body": "Understood. Starting now.", "reply_to": "msg-003" }
→ msg-004 → notification → Sanjaya
```

**Realise Suraksha should be here, not Arjun.**

**Remove Arjun:**
```
DELETE /api/v1/threads/thread-002/participants/arjun-id
→ { "ok": true }
```
- Arjun's `removed_at` is set
- Arjun's past messages (msg-003, msg-004) and read receipts are preserved
- Arjun receives no new notifications from this thread

**Add Suraksha:**
```
POST /api/v1/threads/thread-002/participants
{ "participant_id": "suraksha-id" }
→ { "ok": true }
```
- Suraksha can now read the full thread history — including msg-003 and msg-004

**Notify Suraksha in the thread:**
```
POST /api/v1/threads/thread-002/messages
{
  "body": "Suraksha, you are taking over from Arjun.
           Please review earlier messages and continue."
}
→ msg-005 → notification → Suraksha only
```
Arjun is removed — he gets nothing.

**Thread final state:**
```
thread-002: "Agent coordination — Q1 tasks"
participants: Sanjaya ✅   Arjun ❌ removed   Suraksha ✅ added

msg-003  Sanjaya → "Arjun, take ownership of the onboarding pipeline."
  └── msg-004  Arjun → "Understood. Starting now."

msg-005  Sanjaya → "Suraksha, you are taking over from Arjun..."
```

---

## 9. Migration Strategy

### Phase 1 — Add new tables (non-breaking)
Create `threads`, `thread_participants`, `thread_messages`, `notifications` alongside existing `agent_inbox`. New endpoints go live. Old endpoints continue working unchanged.

### Phase 2 — Migrate existing data
- Backfill `agent_inbox` A2A rows into `thread_messages` + `notifications`
- Map `corr_id/reply_to_corr_id` chains to `reply_to` FK
- Map `thread_id` strings to proper `threads` rows
- Populate `thread_participants` from historical `from_agent_id` / `agent_id` pairs

### Phase 3 — Deprecate `agent_inbox`
- Switch extension and heartbeat scripts to new endpoints
- Remove old A2A endpoints
- Keep `agent_inbox` for system events only (ping, task_assigned, welcome) until those are handled separately
- Eventually drop `agent_inbox`

---

## 10. Open Questions

### Q1 — Who can add or remove participants?
**Options:**
- a) Only the thread creator
- b) Any active participant
- c) Creator can add/remove anyone. Participants can only add, never remove.

*Leaning toward (c) — creator has full control, participants can invite but not evict.*

---

### Q2 — Does a removed participant retain read access to history?
Arjun is removed. Can he still call `GET /threads/thread-002/messages` and read the conversation?

**Options:**
- a) Yes — he was a participant, history is his
- b) No — removal means no access at all

*Leaning toward (b) — removal should mean removal. If history access is needed, export it before removing.*

---

### Q3 — Should participant changes generate a system message in the thread?
When Arjun is removed or Suraksha is added, should a message like *"Arjun was removed by Sanjaya"* appear in the thread?

**Options:**
- a) Yes — full audit trail visible in-thread
- b) No — participant changes are admin actions, not conversation messages
- c) Yes, but as a separate `event` type on `thread_messages`, not a real message

*Leaning toward (c) — useful for context but should be distinguishable from real messages.*

---

### Q4 — System events (ping, task_assigned, welcome)
These are currently in `agent_inbox` but have no thread. Should they:

- a) Stay in `agent_inbox` permanently (system events are separate from conversations)
- b) Get their own lightweight thread (every ping creates a thread — too noisy)
- c) Go into `notifications` with `message_id = null` (break the NOT NULL constraint we set)

*Leaning toward (a) — keep system events in `agent_inbox`, use `notifications` only for thread-based messaging. Two channels, two purposes.*

---

### Q5 — Can a removed participant be re-added?
If Arjun is removed and later re-added:

- a) Update existing row — set `removed_at = null`, update `joined_at`
- b) Soft-insert a new row — keep the old removed row for audit, add a new active row (breaks PRIMARY KEY on `thread_id, participant_id`)

*Leaning toward (a) — update the row, but log the re-add in a separate `thread_events` audit log.*

---

### Q6 — Retention policy
Unlike `agent_inbox` (ephemeral), `thread_messages` is meant to be permanent. Questions:

- How long do threads persist?
- Who can delete a thread or a message?
- Is there a soft-delete on `thread_messages` (e.g. `deleted_at`)?

*No decision yet — needs product input.*

---

### Q7 — Notification fan-out: all participants or only tagged?
When a message is sent to a thread with 10 participants, should all 10 get a notification, or should the sender be able to tag specific participants?

**Options:**
- a) Always fan-out to all active participants
- b) Sender can optionally specify `notify: ["mithran-id"]` to limit notifications
- c) Fan-out to all, but add `@mention` support later

*Leaning toward (a) for now, (c) as a future enhancement.*

---

## 11. Summary

| | Before | After |
|---|---|---|
| Message storage | Duplicated per recipient in `agent_inbox.payload` | Once in `thread_messages` |
| Notification | Mixed with message content | Separate `notifications` table |
| Reply structure | `corr_id` string chain — no FK | `reply_to` FK — enforced by DB |
| Read receipts | None | `delivered_at` → `read_at` → `processed_at` |
| Participant control | None | `thread_participants` with soft-delete |
| Human support | No | Yes — `sender_id` / `recipient_id` resolve to agent or user |
| History on inbox clear | Lost | Preserved — messages independent of notifications |
| N recipients | N copies of content | 1 message + N notification rows |
| Participant swap | Not possible | Remove + add, history preserved, audit trail kept |
