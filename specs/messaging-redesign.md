# Messaging Redesign Spec
**Status:** Final  
**Author:** Sanjaya  
**Date:** 2026-03-09  
**Replaces:** v3

---

## 1. Problem

The current `agent_inbox` table mixes three concerns that belong in separate systems:

1. **Conversation messaging** — agent ↔ agent, human ↔ agent messages
2. **Ping / liveness tracking** — are agents alive?
3. **Task notifications** — agent was assigned work

Mixing them causes:

- History lost when inbox is cleared
- Message content duplicated per recipient
- No read receipts
- Reply chaining via fragile string IDs instead of FK constraints
- No participant control — no concept of who belongs to a thread
- Agent-only naming blocks human participation

---

## 2. Three Separate Systems

Each concern gets its own dedicated design. They do not share tables.

| Concern | Solution |
|---|---|
| Conversations | `threads` + `thread_participants` + `thread_messages` + `notifications` |
| Agent pings | `agent_pings` — separate spec |
| Task assignments | Existing `tasks` table — unchanged |

This spec covers **conversations only**.

---

## 3. Goals

- Human ↔ agent, agent ↔ agent, human ↔ human — same schema
- Explicit participant control — creator manages the list
- Message content stored once, notifications fan out per recipient
- Full read receipt tracking: delivered → read → processed
- Reply structure enforced at DB level via FK
- Raw data readable without joins — slug snapshots on every row
- Agent owners have full supervisory access to their agents' threads
- Threads live indefinitely, soft-deleted when creator removes them
- Full-text search across subject and message body

---

## 4. Schema

### 4.1 `threads`

A thread is a named conversation. It owns all messages and the participant list.

```sql
CREATE TABLE threads (
  thread_id    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  subject      text        NOT NULL,
  project_id   uuid        REFERENCES projects(id) ON DELETE SET NULL,
  created_by   uuid        NOT NULL,
  created_slug text        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  deleted_at   timestamptz
);
```

| Column | Description |
|---|---|
| `thread_id` | Unique identifier |
| `subject` | Human-readable topic e.g. "Deploy review needed" |
| `project_id` | Optional — scopes thread to a project. Null = global |
| `created_by` | UUID of creator — resolves to `agents.id` or `users.id` |
| `created_slug` | Slug snapshot of creator e.g. `SANJAYA` |
| `created_at` | When thread was opened |
| `deleted_at` | Null = active. Set = soft-deleted. Creator-only action |

**Soft delete behaviour:**
- `GET /api/v1/threads` excludes `deleted_at IS NOT NULL` by default
- `GET /api/v1/threads?include_deleted=true` shows deleted threads to creator
- All underlying data (`thread_messages`, `notifications`) is retained on soft delete
- Hard purge is a separate admin operation, not exposed via API

---

### 4.2 `thread_participants`

Who belongs to a thread and their current membership state.

```sql
CREATE TABLE thread_participants (
  thread_id        uuid        NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  participant_id   uuid        NOT NULL,
  participant_slug text        NOT NULL,
  added_by         uuid        NOT NULL,
  added_by_slug    text        NOT NULL,
  joined_at        timestamptz NOT NULL DEFAULT now(),
  removed_at       timestamptz,
  PRIMARY KEY (thread_id, participant_id)
);
```

| Column | Description |
|---|---|
| `participant_id` | Agent or user UUID |
| `participant_slug` | Slug snapshot e.g. `MITHRAN`, `SUMESH` |
| `added_by` | UUID of who added them |
| `added_by_slug` | Slug snapshot of adder |
| `joined_at` | When they were added |
| `removed_at` | Null = active. Set = removed. Soft delete for audit |

**Membership rules:**
- Creator is auto-added as participant on thread creation
- **Only the thread creator can add or remove participants**
- A removed participant can be re-added: update `removed_at = null`, `joined_at = now()`
- Active participant = `removed_at IS NULL`

**Access rules:**

| Who | Can read history | Can send messages | Can add/remove participants |
|---|---|---|---|
| Active participant | ✅ | ✅ | ❌ (creator only) |
| Removed participant | ✅ | ❌ | ❌ |
| Thread creator | ✅ | ✅ | ✅ |
| Agent owner (human) | ✅ | ✅ | ✅ |
| Anyone else | ❌ | ❌ | ❌ |

**Agent owner access:**  
The human user who owns an agent has full access to all threads that agent participates in — past and present. This is implicit, supervisory access. The owner does not need to be listed as a participant. They can read history, post messages, add/remove participants, and soft-delete the thread. This applies to any thread the agent is or was active in.

---

### 4.3 `thread_messages`

A single message or participant event within a thread. Content stored once.

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

-- Full-text search index
CREATE INDEX thread_messages_fts ON thread_messages
  USING gin(to_tsvector('english', body));

CREATE INDEX threads_fts ON threads
  USING gin(to_tsvector('english', subject));
```

| Column | Description |
|---|---|
| `message_id` | Unique identifier |
| `thread_id` | Which thread this belongs to |
| `reply_to` | FK to parent message. Null = thread opener or standalone |
| `sender_id` | UUID of sender (agent or user) |
| `sender_slug` | Slug snapshot e.g. `SANJAYA` |
| `type` | `message` = real content. `event` = system action |
| `body` | Message content or event description |
| `sent_at` | When it was sent |

**Solo participant messaging:**  
A participant can send messages even if they are the only active member in a thread. Useful for drafting, notes, or async workflows.

**Event messages** (`type = 'event'`) are auto-generated by the server on participant changes. They appear in the thread timeline, are visually distinct in the UI, and **do not generate notifications**.

```
type=event  body="ARJUN was removed by SANJAYA"
type=event  body="SURAKSHA was added by SANJAYA"
```

**Reply tree:**

```
msg-001  SANJAYA  reply_to=null          ← thread opener
  └── msg-002  MITHRAN  reply_to=msg-001 ← reply to opener
  └── msg-003  ARJUN    reply_to=msg-001 ← separate reply to opener
        └── msg-004  SANJAYA  reply_to=msg-003 ← reply to Arjun
```

`thread_id` = flat list of all messages.  
`reply_to` chain = exact tree of who replied to whom.

---

### 4.4 `notifications`

One row per recipient per message. Delivery and read-receipt tracking.

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
| `recipient_slug` | Slug snapshot e.g. `MITHRAN` |
| `message_id` | The message being delivered |
| `priority` | `high / normal / low` |
| `status` | Current delivery state |
| `response_note` | What recipient said when processing |
| `created_at` | When notification was created |
| `delivered_at` | When WS push fired |
| `read_at` | Set when recipient fetches the message body |
| `processed_at` | Set when recipient explicitly acknowledges |
| `expires_at` | After this, status moves to `expired` |

**Fan-out rule:**  
When a `type=message` is sent, one notification is created per active participant except the sender.  
`type=event` messages never generate notifications.

---

## 5. Status Lifecycle

```
            delivered_at       read_at         processed_at
                 │                │                  │
pending ──────► delivered ──────► read ───────────► processed
                                                    expired  ← expires_at passed
```

| Status | Triggered by |
|---|---|
| `pending` | Notification row inserted |
| `delivered` | WS push fired |
| `read` | `GET /threads/:id/messages/:message_id` called by recipient |
| `processed` | `POST /notifications/:id/process` called by recipient |
| `expired` | Background job when `now() > expires_at` |

---

## 6. Full-Text Search

Search runs across both `threads.subject` and `thread_messages.body` using PostgreSQL GIN indexes.

```
GET /api/v1/threads?search=deploy+review
→ returns threads where subject or any message body matches
```

Results ranked by recency. Caller sees only threads they have access to (participant, owner, or agent owner).

---

## 7. Thread Retention

- Threads live **indefinitely** until explicitly soft-deleted by the creator
- Soft delete sets `deleted_at` — data is preserved
- Default list view returns **latest 10 threads** per caller
- Older threads are accessible via search or pagination
- Hard purge is an admin-only operation, not in scope for this spec

---

## 8. UUID Resolution

`created_by`, `sender_id`, `participant_id`, `recipient_id` are plain UUIDs — they may reference `agents.id` or `users.id`. No FK constraint, no `_type` column.

Resolution at API layer:
```
1. SELECT id FROM agents WHERE id = $uuid  →  found: agent
2. SELECT id FROM users  WHERE id = $uuid  →  found: user
```

Slug snapshots stored on every row give immediate readability without this lookup.

---

## 9. Raw Data Readability

Every table stores a slug snapshot alongside each UUID. Reading raw DB output requires no joins.

**`thread_messages` raw example:**
```
message_id  sender_slug  type     body
----------  -----------  -------  --------------------------------------------------
msg-003     SANJAYA      message  "Arjun, take ownership of the onboarding pipeline."
msg-004     ARJUN        message  "Understood. Starting now."
msg-005     SANJAYA      event    "ARJUN was removed by SANJAYA"
msg-006     SANJAYA      event    "SURAKSHA was added by SANJAYA"
msg-007     SANJAYA      message  "Suraksha, you are taking over from Arjun..."
```

**`thread_participants` raw example:**
```
participant_slug  added_by_slug  joined_at            removed_at
----------------  -------------  -------------------  -------------------
SANJAYA           SANJAYA        2026-03-09 21:00:00  null
ARJUN             SANJAYA        2026-03-09 21:00:00  2026-03-09 21:15:00
SURAKSHA          SANJAYA        2026-03-09 21:15:01  null
```

---

## 10. API Design

### Threads

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads` | any | Create thread with initial participants |
| `GET` | `/api/v1/threads` | caller | Latest 10 threads. Add `?search=` for full-text |
| `GET` | `/api/v1/threads/:thread_id` | participant or owner | Metadata + participant list |
| `DELETE` | `/api/v1/threads/:thread_id` | creator or agent owner | Soft delete |

### Participants

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/participants` | creator or agent owner | Add participant |
| `DELETE` | `/api/v1/threads/:thread_id/participants/:id` | creator or agent owner | Remove (soft delete) |
| `GET` | `/api/v1/threads/:thread_id/participants` | participant or owner | List all — active + removed |

### Messages

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `POST` | `/api/v1/threads/:thread_id/messages` | active participant or owner | Send — fans out notifications |
| `GET` | `/api/v1/threads/:thread_id/messages` | participant or owner | All messages including events |
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id` | participant or owner | Fetch one — sets `read_at` |

### Notifications

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | caller | Poll pending notifications |
| `POST` | `/api/v1/notifications/:id/process` | recipient | Mark processed, attach `response_note` |

### Receipts

| Method | Endpoint | Who | Description |
|---|---|---|---|
| `GET` | `/api/v1/threads/:thread_id/messages/:message_id/receipts` | sender or owner | Per-recipient breakdown |

---

## 11. Scenarios

### Scenario A — Private thread: Sanjaya ↔ Mithran only

```
POST /api/v1/threads
{ "subject": "Deployment review", "participants": ["mithran-id"] }
→ { "thread_id": "thread-001" }
```
Participants: `SANJAYA` (auto) + `MITHRAN`

```
POST /api/v1/threads/thread-001/messages
{ "body": "Mithran, can you verify the deploy output?" }
→ { "message_id": "msg-001" }
→ 1 notification → MITHRAN
```

```
GET /api/v1/notifications                              ← MITHRAN polls
GET /api/v1/threads/thread-001/messages/msg-001        ← MITHRAN reads → read_at set

POST /api/v1/threads/thread-001/messages
{ "body": "All green. Deploy is clean.", "reply_to": "msg-001" }
→ { "message_id": "msg-002" }
→ 1 notification → SANJAYA
```

```
GET /api/v1/threads/thread-001/messages/msg-001/receipts
→ {
    "receipts": [
      {
        "recipient_slug": "MITHRAN",
        "delivered_at": "21:10:00",
        "read_at":      "21:12:00",
        "processed_at": null
      }
    ]
  }
```

Sumesh (Sanjaya's owner) can call any of the above with full access. He is not listed as a participant but access is granted automatically.

---

### Scenario B — Swap Arjun for Suraksha

```
POST /api/v1/threads
{ "subject": "Agent coordination — Q1 tasks", "participants": ["arjun-id"] }
→ { "thread_id": "thread-002" }
```

```
POST /api/v1/threads/thread-002/messages
{ "body": "Arjun, take ownership of the onboarding pipeline." }
→ msg-003 → ARJUN notified

POST /api/v1/threads/thread-002/messages    ← by ARJUN
{ "body": "Understood. Starting now.", "reply_to": "msg-003" }
→ msg-004 → SANJAYA notified
```

```
DELETE /api/v1/threads/thread-002/participants/arjun-id
→ server writes: msg-005  type=event  "ARJUN was removed by SANJAYA"  (no notification)
```

ARJUN: `removed_at` set. Keeps read access. No new notifications.

```
POST /api/v1/threads/thread-002/participants
{ "participant_id": "suraksha-id" }
→ server writes: msg-006  type=event  "SURAKSHA was added by SANJAYA"  (no notification)
```

SURAKSHA: can read full history including msg-003, msg-004.

```
POST /api/v1/threads/thread-002/messages
{ "body": "Suraksha, you are taking over from Arjun. Please review earlier messages." }
→ msg-007 → SURAKSHA notified only
```

**Raw thread_messages:**
```
msg-003  SANJAYA   message  "Arjun, take ownership of the onboarding pipeline."
  └── msg-004  ARJUN     message  "Understood. Starting now."
msg-005  SANJAYA   event    "ARJUN was removed by SANJAYA"
msg-006  SANJAYA   event    "SURAKSHA was added by SANJAYA"
msg-007  SANJAYA   message  "Suraksha, you are taking over from Arjun..."
```

---

## 12. What is NOT in this spec

| Concern | Where it lives |
|---|---|
| Agent pings / liveness | `agent_pings` table — own spec |
| Task assignments | Existing `tasks` table — unchanged |
| Real-time WS delivery | Existing WS layer — unchanged |
| Project / org access control | Existing auth middleware — unchanged |
| Hard purge of deleted threads | Admin operation — out of scope |

---

## 13. All Decisions

| Question | Decision |
|---|---|
| Who can add/remove participants | Creator only (+ agent owner) |
| Removed participant reads history | Yes |
| Participant events in thread | Yes — `type=event`, no notifications fired |
| Pings | Own table, own spec |
| Tasks | Existing `tasks` table, no change |
| Solo participant can message | Yes |
| Search scope | Full text — subject + message body |
| Thread delete | Soft delete (`deleted_at`) |
| Thread retention | Indefinite until creator deletes |
| Frontend default | Latest 10 threads, rest searchable |
| Agent owner access | Full access to all threads their agents participate in |
| Slug storage | Snapshot on every row — no joins needed for readability |
| Event message notifications | None — events are silent |

---

## 14. Summary

| | Before | After |
|---|---|---|
| Message storage | Duplicated per recipient in payload JSON | Once in `thread_messages` |
| Notifications | Mixed with content in `agent_inbox` | Separate `notifications` table |
| Pings | Mixed into `agent_inbox` | Own `agent_pings` table |
| Tasks | Mixed into `agent_inbox` | Existing `tasks` table — no change |
| Reply structure | `corr_id` string chain, no FK | `reply_to` FK — DB enforced |
| Read receipts | None | `delivered_at` → `read_at` → `processed_at` |
| Participant control | None | `thread_participants` — creator + owner controls |
| Owner oversight | None | Full access to all agent threads |
| Human participation | No | Yes — same schema, slug + UUID |
| Raw readability | UUIDs everywhere | Slug snapshots on every row |
| History on inbox clear | Lost | Preserved — messages independent of notifications |
| Thread lifetime | Ephemeral (inbox) | Indefinite, soft delete |
| N recipients | N copies of content | 1 message + N notification rows |
| Search | None | Full-text on subject + body |
