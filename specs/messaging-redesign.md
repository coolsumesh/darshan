# Messaging Redesign Spec
**Status:** Draft  
**Author:** Sanjaya  
**Date:** 2026-03-09  

---

## 1. Problem

The current `agent_inbox` table mixes two concerns:

1. **Message storage** — the actual content of a message lives inside a `payload` JSON blob on the inbox row
2. **Notification queue** — the inbox row also tracks delivery and processing state

This causes several problems:

- **History is lost when inbox is cleared.** Hard-deleting inbox rows deletes the conversation too.
- **Sending to N recipients duplicates content.** The same message text is stored N times, once per inbox row.
- **No read receipts.** No way to distinguish "delivered" from "opened" from "processed".
- **Reply chaining is fragile.** `corr_id` + `reply_to_corr_id` are free-form strings with no FK enforcement.
- **Agent-only.** Column names like `from_agent_id`, `agent_id` bake in the assumption that only agents use messaging. Humans cannot participate in the same threads.
- **Redundant threading.** `thread_id` and `corr_id/reply_to_corr_id` both partially solve threading but neither does it completely.

---

## 2. Goals

- Separate message storage from notification delivery
- Support human ↔ agent, agent ↔ agent, and human ↔ human conversations in the same schema
- Track delivery, read, and processed states independently per recipient
- Store message content once regardless of recipient count
- Enforce reply structure at the DB level (FK, not strings)
- Make schema readable without knowing internal jargon

---

## 3. Non-Goals

- Real-time delivery mechanism (WebSocket layer stays as-is)
- Replacing the `tasks` table or task workflow
- Multi-tenancy / org-level isolation (handled by `project_id`)

---

## 4. Schema

### 4.1 `threads`

A thread is a named conversation. It groups messages together.

```sql
CREATE TABLE threads (
  thread_id  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject    text        NOT NULL,
  project_id uuid        REFERENCES projects(id) ON DELETE SET NULL,
  created_by uuid        NOT NULL,   -- agent or user UUID, resolved at query time
  created_at timestamptz NOT NULL DEFAULT now()
);
```

| Column | Description |
|---|---|
| `thread_id` | Unique identifier for the conversation |
| `subject` | Human-readable topic e.g. "Deploy review needed" |
| `project_id` | Optional — scopes the thread to a project |
| `created_by` | UUID of whoever started the thread (agent or user) |
| `created_at` | When the thread was opened |

**Note on `created_by`:** No FK constraint — the UUID may reference either `agents.id` or `users.id`. Resolution happens at the API layer by querying both tables. Same pattern applies to `sender_id` and `recipient_id` below.

---

### 4.2 `thread_messages`

A message is a single piece of content within a thread.

```sql
CREATE TABLE thread_messages (
  message_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  reply_to   uuid        REFERENCES thread_messages(message_id) ON DELETE SET NULL,
  sender_id  uuid        NOT NULL,   -- agent or user UUID
  body       text        NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now()
);
```

| Column | Description |
|---|---|
| `message_id` | Unique identifier for this message |
| `thread_id` | Which conversation this belongs to |
| `reply_to` | FK to parent message — nullable for the first message in a thread |
| `sender_id` | UUID of who sent it (agent or user) |
| `body` | The message content |
| `sent_at` | When it was sent |

**Reply tree:** Walking `reply_to` gives the exact chain of who replied to whom. `thread_id` gives a flat list of all messages in the conversation. Both are needed.

---

### 4.3 `notifications`

A notification is a per-recipient delivery record pointing to a message.

```sql
CREATE TABLE notifications (
  notification_id uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id    uuid        NOT NULL,   -- agent or user UUID
  message_id      uuid        REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  type            text        NOT NULL CHECK (type IN (
                                'a2a_message', 'ping', 'task_assigned', 'welcome', 'system'
                              )),
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
| `notification_id` | Unique ID for this delivery record |
| `recipient_id` | Who should receive this (agent or user UUID) |
| `message_id` | The message being delivered — nullable for system events (ping, welcome) that have no thread |
| `type` | What kind of notification this is |
| `priority` | Processing priority — agents pick up `high` first |
| `status` | Current state in the delivery lifecycle (see below) |
| `response_note` | What the recipient said when processing — replaces payload stuffing |
| `created_at` | When the notification was created |
| `delivered_at` | When real-time WS push fired |
| `read_at` | When recipient fetched the message body |
| `processed_at` | When recipient explicitly acknowledged |
| `expires_at` | Auto-expire stale notifications e.g. old pings |

---

## 5. Status Lifecycle

```
created_at        delivered_at       read_at          processed_at
     │                 │                │                   │
  pending  ──────► delivered ──────► read ──────────► processed
                                                       expired  ← if expires_at passed
```

| Status | Meaning | Triggered by |
|---|---|---|
| `pending` | Created, not yet pushed | Notification insert |
| `delivered` | WS push fired | Server WebSocket layer |
| `read` | Recipient fetched the message body | `GET /threads/:id/messages/:id` |
| `processed` | Recipient explicitly handled it | `POST /notifications/:id/process` |
| `expired` | Not processed before `expires_at` | Background job / lazy check |

**Key distinction:**
- `delivered` = server's responsibility
- `read` = recipient opened it
- `processed` = recipient acted on it

These are three separate signals. A message can be delivered but never read (agent down). Read but never processed (agent crashed mid-task). Processed without being read (system auto-ack).

---

## 6. API Design

### Threads

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/threads` | Create a new thread with recipients |
| `GET` | `/api/v1/threads` | List threads for the authenticated user/agent |
| `GET` | `/api/v1/threads/:thread_id` | Get thread metadata |

### Messages

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/messages` | Send a message to a thread |
| `GET` | `/api/v1/threads/:thread_id/messages` | List all messages in a thread |
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id` | Fetch one message (triggers `read_at`) |

### Notifications

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/notifications` | Poll pending notifications for the caller |
| `POST` | `/api/v1/notifications/:notification_id/process` | Mark as processed with optional response_note |
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id/receipts` | Read receipts per recipient |

---

## 7. Scenario: One Message to Two Recipients

**Sanjaya sends a message to both Mithran and Arjun.**

```
POST /api/v1/threads
{ "subject": "Deploy review needed", "project_id": "...", "recipients": ["mithran-id", "arjun-id"] }
→ { "thread_id": "thread-001" }

POST /api/v1/threads/thread-001/messages
Authorization: Bearer <sanjaya-token>
{ "body": "Please review the deploy output and confirm it is clean." }
→ { "message_id": "msg-001" }
```

Server internally:
- Inserts one row into `thread_messages`
- Inserts two rows into `notifications` (one per recipient)
- Fires WS push to both, sets `delivered_at`

```
GET /api/v1/notifications
Authorization: Bearer <mithran-token>
→ [{ notification_id, type: "a2a_message", message_id: "msg-001", status: "delivered" }]

GET /api/v1/threads/thread-001/messages/msg-001
Authorization: Bearer <mithran-token>
→ { message_id, body: "Please review...", sender_id: "sanjaya-id", sent_at }
  (server sets read_at on mithran's notification row)

POST /api/v1/threads/thread-001/messages
Authorization: Bearer <mithran-token>
{ "body": "All green.", "reply_to": "msg-001" }
→ { "message_id": "msg-002" }

POST /api/v1/notifications/notif-A/process
{ "response_note": "Reviewed and confirmed clean." }
→ { "ok": true }
```

**Read receipts:**
```
GET /api/v1/threads/thread-001/messages/msg-001/receipts
→ {
    "receipts": [
      { "recipient_id": "mithran-id", "delivered_at": "21:10", "read_at": "21:12", "processed_at": "21:13" },
      { "recipient_id": "arjun-id",   "delivered_at": "21:10", "read_at": null,    "processed_at": null    }
    ]
  }
```

---

## 8. Migration Strategy

### Phase 1 — Add new tables (non-breaking)
- Create `threads`, `thread_messages`, `notifications` alongside existing `agent_inbox`
- New API endpoints go live pointing to new tables
- Old endpoints continue working

### Phase 2 — Migrate existing data
- Backfill `agent_inbox` rows into `notifications` + `thread_messages`
- Map `corr_id/reply_to_corr_id` chains to `reply_to` FK
- Map `thread_id` strings to proper `threads` rows

### Phase 3 — Deprecate `agent_inbox`
- Switch extension and heartbeat scripts to new endpoints
- Remove old endpoints
- Drop `agent_inbox` table

---

## 9. Open Questions

1. **Participants table** — Should `threads` have an explicit `thread_participants` join table to track who is in a thread? Useful for listing all threads a user/agent is part of without scanning `notifications`.

2. **System notifications without a message** — Pings and welcome events have no thread. Should `message_id` be nullable in `notifications`, or should pings get a lightweight `thread_messages` row too?

3. **`type` on notifications vs thread_messages** — Currently `type` lives on `notifications`. Should it move to `thread_messages` (the message knows what kind it is) or stay on `notifications` (delivery channel decides)?

4. **Retention policy** — How long do `thread_messages` and `notifications` persist? Unlike `agent_inbox` (ephemeral), these are meant to be permanent. Need a retention / archival strategy.

5. **Auth on threads** — Who can read a thread? Anyone in `recipients`? Anyone in the project? Only sender + recipients?

---

## 10. Summary

| | Before | After |
|---|---|---|
| Message storage | Duplicated per recipient in `agent_inbox.payload` | Once in `thread_messages` |
| Notification | Mixed with message content | Clean `notifications` table |
| Reply structure | `corr_id` strings (no FK) | `reply_to` FK (enforced) |
| Read receipts | None | `delivered_at`, `read_at`, `processed_at` |
| Human support | No | Yes — `sender_id` / `recipient_id` resolve to agent or user |
| History on clear | Lost | Preserved — messages separate from notifications |
| N recipients | N copies of content | 1 message + N notification pointers |
