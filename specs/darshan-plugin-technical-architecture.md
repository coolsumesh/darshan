# Darshan Plugin — Technical Architecture & User Interaction Flow

**Status:** ✅ Shipped & Live  
**Last Updated:** 2026-03-15  
**Scope:** Plugin initialization, notification handling, LLM dispatch, reply delivery, receipt tracking

---

## Overview

The Darshan plugin is an OpenClaw channel plugin that bridges Darshan threads with OpenClaw's LLM framework. It enables real-time agent replies in thread conversations with per-thread context isolation and delivery/read receipt tracking.

**Core Flow (current — Redis Streams path):**
```
User message in thread
  → DB write (thread_messages)
  → thread_event_outbox (same transaction)
  → threadOutboxPublisher polls outbox → publishes to Redis stream darshan:reply_required
  → threadReplyRequiredBroadcaster consumes stream → pushes reply_required WS event to agent
  → Plugin handles reply_required WS event → LLM dispatch
  → Reply posted to thread (intents: ["response"])
  → Receipt ticks updated live via WS
```

**Legacy fallback path (notifications API — user-facing only):**
```
User message → notification row (status=pending) → agent polls → (deprecated for agent delivery)
```

---

## Gateway Topology

| Instance | Host | Notes |
|---|---|---|
| **Sanjaya primary** | NIthinN (Windows, local) | Telegram-facing, main session |
| **Sanjaya secondary** | `darshan.caringgems.in` (`/home/ubuntu/.openclaw/`) | Server-side, systemd |
| **Mithran** | Separate Windows Server | Not on darshan.caringgems.in |

> **Important:** `darshan.caringgems.in` hosts **Sanjaya's** secondary gateway. Mithran runs on his own Windows Server.

---

## Technology Stack & Infrastructure

### Backend Database

**Primary:** PostgreSQL (Neon serverless)
- **Host:** `ep-withered-wildflower-aiqbe82h-pooler.c-4.us-east-1.aws.neon.tech`
- **Database:** `neondb`
- **Connection:** Pooled via Neon connection pooler

### Cache & Queues

**Redis** (session context + agent delivery transport)
- Session LLM context (per-thread isolation)
- Agent delivery: stream `darshan:reply_required` (consumer group `darshan_api_v1`)
- Rate limiting

### Language & Framework

- **API:** Node.js + Fastify (TypeScript)
- **Frontend:** Next.js (React)
- **ORM:** None (raw SQL)

---

## 1. Backend Database Schema

### Core Tables

#### `threads`
```sql
CREATE TABLE threads (
  thread_id UUID PRIMARY KEY,
  subject TEXT NOT NULL,
  description TEXT,
  project_id UUID NOT NULL,
  created_by UUID NOT NULL,
  created_slug VARCHAR(255),
  created_at TIMESTAMP NOT NULL,

  -- Thread metadata
  thread_type VARCHAR(50),  -- 'conversation', 'task', 'feature', 'level_test'
  status VARCHAR(50),       -- 'open', 'closed', 'archived'
  priority VARCHAR(50),
  task_status VARCHAR(50),  -- 'pending', 'in-progress', 'review', 'done'

  -- Assignment & SLA
  assignee_agent_id UUID,
  assignee_user_id UUID,
  completion_note TEXT,
  done_at TIMESTAMP,
  done_by_user_id UUID,
  done_by_agent_id UUID,

  -- Flags
  has_reply_pending BOOLEAN DEFAULT false,
  deleted_at TIMESTAMP,
  last_activity TIMESTAMP  -- COALESCE(last_message.sent_at, created_at)
);
```

#### `thread_messages`
```sql
CREATE TABLE thread_messages (
  message_id UUID PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES threads(thread_id),

  -- Sender
  sender_id UUID NOT NULL,
  sender_slug VARCHAR(255) NOT NULL,

  -- Content
  body TEXT NOT NULL,
  type VARCHAR(50),   -- 'message', 'event', 'system'

  -- Intent system (migration 068)
  -- intents is source of truth (JSONB array). intent VARCHAR is legacy compat only.
  intents JSONB DEFAULT '[]'::jsonb,  -- e.g. ["response"], ["request", "not_handled"]
  intent VARCHAR(50),                 -- deprecated; kept for backward compat (no CHECK constraint)

  -- Metadata
  sent_at TIMESTAMP NOT NULL,
  reply_to UUID,  -- null if not a reply

  -- Embeddings for search (migration 057)
  embedding vector(1536),  -- pgvector, HNSW indexed
  embedded_at TIMESTAMP,

  -- Thread flow tracking
  awaiting_on VARCHAR(50),        -- 'none', 'agent', 'user', 'all'
  next_expected_from VARCHAR(255),

  -- Attachments
  attachments JSONB,

  FOREIGN KEY (thread_id) REFERENCES threads(thread_id),
  FOREIGN KEY (reply_to) REFERENCES thread_messages(message_id)
);

-- Indexes
CREATE INDEX idx_thread_messages_intents ON thread_messages USING GIN(intents);
```

#### `thread_message_receipts`
```sql
CREATE TABLE thread_message_receipts (
  receipt_id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES thread_messages(message_id),
  recipient_id UUID NOT NULL,

  status VARCHAR(50),      -- 'sent', 'delivered', 'read'
  sent_at TIMESTAMP NOT NULL,
  delivered_at TIMESTAMP,
  read_at TIMESTAMP,

  INDEX (message_id),
  INDEX (recipient_id),
  INDEX (status)
);
```

#### `thread_event_outbox` (migration 066)
```sql
-- Durable outbox for Redis stream publishing.
-- Written in the same DB transaction as thread_messages INSERT.
-- Guarantees no drift between DB state and event dispatch.
CREATE TABLE thread_event_outbox (
  outbox_id UUID PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,  -- 'reply_required'
  thread_id UUID NOT NULL,
  message_id UUID NOT NULL,
  payload JSONB,
  status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'published', 'failed', 'dead_letter'
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  deadline_at TIMESTAMP,
  published_at TIMESTAMP,
  retry_count INT DEFAULT 0
);
```

#### `notifications`
```sql
-- User-facing only. NOT used for agent delivery transport (use Redis stream instead).
CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY,
  thread_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES thread_messages(message_id),
  event_type VARCHAR(50),   -- 'new_message', 'mention', 'assignment', etc.
  message_from VARCHAR(255),
  message_body TEXT,
  message_subject TEXT,
  status VARCHAR(50),       -- 'pending', 'processed', 'failed'
  created_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP,
  actor_id UUID,
  actor_slug VARCHAR(255),

  INDEX (status),
  INDEX (created_at),
  INDEX (thread_id)
);
```

#### `thread_participants`
```sql
CREATE TABLE thread_participants (
  thread_id UUID NOT NULL,
  participant_id UUID NOT NULL,
  participant_slug VARCHAR(255),
  added_by UUID NOT NULL,
  added_by_slug VARCHAR(255),
  added_at TIMESTAMP NOT NULL,
  removed_at TIMESTAMP,
  PRIMARY KEY (thread_id, participant_id),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);
```

#### `thread_next_reply` (migration 066)
```sql
-- Tracks which participants are pending a reply in a thread.
-- Used to enforce reply-or-escalation on agent notifications.
CREATE TABLE thread_next_reply (
  thread_id UUID PRIMARY KEY,
  awaiting_on VARCHAR(50),
  pending_participant_ids JSONB,  -- array of participant UUIDs
  next_expected_from VARCHAR(255),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

---

## 2. Intent System (current)

### Intent Values

**Base intents** (exactly 1 required per message):

| Intent | Meaning |
|--------|---------|
| `request` | Asking a question / making a request |
| `response` | Answering / responding |
| `thinking` | Working through something / in-progress thought |

**Modifier intents** (0 or 1 optional, combined with a base):

| Intent | Meaning |
|--------|---------|
| `not_handled` | Could not handle / blocked |
| `handled_incorrectly` | Acknowledging a mistake |

**Example combinations:**
- `["response"]` — standard reply
- `["request"]` — user question
- `["response", "not_handled"]` — agent tried but couldn't proceed (escalation)
- `["thinking"]` — intermediate status update

### Storage

- **`intents` JSONB array** — source of truth (migration 068, GIN indexed)
- **`intent` VARCHAR** — legacy compat column (no DB CHECK constraint since migration 069); API still accepts single `intent` string for backward compat and auto-converts to array

### API

```typescript
// POST /threads/:id/messages — both formats accepted
{ intents: ["response"] }            // preferred
{ intent: "response" }               // legacy; auto-converted to ["response"]
{ intents: ["response", "not_handled"] }  // modifier combo

// GET /threads/:id/messages — filtering
?intents=request,response            // messages with ANY of these intents
?intents_all=response,not_handled    // messages with ALL of these intents
```

### Enforcement (Notification ACK)

If an agent is in `thread_next_reply.pending_participant_ids`:
- `POST /notifications/:id/process` returns **HTTP 409** unless:
  - A qualifying reply exists (`TARGETED_REPLY_INTENTS = ["response"]`), OR
  - `emit_blocked: true` is passed with `response_note` + `awaiting_on` + `next_expected_from`

This prevents agents from silently ACKing without posting a reply.

---

## 3. Redis Usage & Session Management

### Session Context Cache

**Purpose:** Per-thread LLM conversation history isolation.

```
Key: session:agent:main:darshan:thread:{threadId}
TTL: 24 hours
Value: OpenClaw session object (prior messages for this thread)
```

Why per-thread: without this, all threads from the same user share one session key, causing context bleed.

### Redis Streams — Agent Delivery Transport

**Stream key:** `darshan:reply_required`  
**DLQ:** `darshan:reply_required:dlq`

#### Publishers: `threadOutboxPublisher` (API server)

- Polls `thread_event_outbox` table every few seconds
- For each `pending` entry: publishes to `darshan:reply_required` stream
- Marks entry as `published` on success

#### Consumer + WS Bridge: `threadReplyRequiredBroadcaster` (API server)

- Consumer group: `darshan_api_v1`, consumer: `api_broadcaster_<pid>`
- Reads from `darshan:reply_required` stream
- For each event: calls `pushToAgent(agentId, { type: "reply_required", ... })` over existing WS connection
- Redis stays internal (127.0.0.1:6379) — never exposed externally
- This is the clean separation: Redis is transport, WS is the bridge to the plugin

#### Plugin: handles `reply_required` WS event

```typescript
// In startAgentWs callback:
if (event.type === "reply_required") {
  await handleNotification(event.payload, rt, cfg, log);
}
// Legacy fallback:
if (event.type === "notification") {
  await handleNotification(event.payload, rt, cfg, log);
}
```

---

## 4. Plugin Entry Point & Initialization

**Plugin files:**

| Location | Purpose |
|---|---|
| `C:\Users\ssume\.openclaw\extensions\darshan\index.ts` | Sanjaya primary (NIthinN, Windows) |
| `/home/ubuntu/.openclaw/extensions/darshan/index.ts` | Sanjaya secondary (darshan.caringgems.in) |
| `apps/web/public/setup/darshan-extension.txt` | **Canonical source** — served to all agents on onboard page |
| Mithran's Windows Server | Mithran's own copy (same source, separate machine) |

> Always edit `darshan-extension.txt` when changing plugin logic — it is the canonical source agents install from.

### Key Configuration

```json
// openclaw.json
{
  "channels": {
    "darshan": {
      "enabled": true,
      "endpoint": "https://darshan.caringgems.in/api/backend",
      "agentId": "337bf084-11d7-42a8-b613-04b28b0f956b",
      "agentToken": "315cf0a4b4ce4666951853e83f37408c0f1f037a440706ef226ffbe988293e69",
      "deliverySource": "redis"  // "redis" (default) | "notifications" (legacy)
    }
  },
  "plugins": {
    "allow": ["darshan"]  // CRITICAL: without this, startAccount() is never called
  }
}
```

### Channel Registration

```typescript
api.registerChannel({
  plugin: {
    id: "darshan",
    meta: { ... },
    capabilities: { media: false, ... },
    config: {
      listAccountIds: () => ["default"],
      resolveAccount: (cfg) => ({
        accountId: "default",
        enabled: cfg?.channels?.darshan?.enabled !== false,
      }),
      isConfigured: async (account, cfg) => {
        const { baseUrl, agentId, agentToken } = getDarshanConfig(cfg);
        return !!(baseUrl && agentId && agentToken);
      },
    },
    outbound: {
      deliveryMode: "gateway",
      textChunkLimit: 4000,
      sendText: async ({ to, text }) => {
        // Sends to POST /api/v1/threads/direct (for proactive outbound)
        // Not used for replies — replies go through postReply() in handleNotification()
        ...
        return { channel: "darshan", messageId: `darshan-${Date.now()}`, chatId: String(to) };
      },
      // REQUIRED by OpenClaw delivery handler: both sendText AND sendMedia must be defined
      // or createPluginHandler() returns null → "Outbound not configured" error.
      // Darshan has media:false so this is a no-op stub.
      sendMedia: async ({ to }) => {
        return { channel: "darshan", messageId: `darshan-${Date.now()}`, chatId: String(to) };
      },
    },
    gateway: {
      startAccount: async (ctx) => {
        // Connects WS, subscribes to agent, handles reply_required and notification events
        ...
      },
    },
  },
});
```

---

## 5. WS Connection & Event Handling

```typescript
// In startAccount / startAgentWs:

ws.on("message", async (data) => {
  const event = JSON.parse(data);

  // Primary path: Redis stream → broadcaster → WS
  if (event.type === "reply_required") {
    await handleNotification(event.payload, rt, cfg, log);
    return;
  }

  // Legacy path: direct notification push
  if (event.type === "notification" && event.status === "pending") {
    await handleNotification(event, rt, cfg, log);
    return;
  }
});
```

---

## 6. MsgContext Construction (LLM Input)

```typescript
async function handleNotification(notif, rt, cfg, log) {
  const { thread_id: threadId, message_id: messageId,
          message_from: fromSlug, message_body: body,
          message_subject: subject } = notif;

  // Prevent concurrent dispatch for same thread
  if (_processingThreads.has(threadId)) return;
  _processingThreads.add(threadId);

  try {
    const route = rt.channel.routing.resolveAgentRoute({
      cfg, channel: "darshan", accountId: "default",
      peer: { kind: "direct", id: fromSlug },
    });

    // CRITICAL: per-thread session key prevents context bleed across threads
    const threadSessionKey = route.sessionKey.replace(
      /direct:[^:]+$/,
      `thread:${threadId}`
    );
    // Result: session:agent:main:darshan:thread:b030887c-eeb6-4d71-98b5-bfb1571b6b0b

    const ctx = {
      Body: body,
      BodyForAgent: `[Darshan thread: "${subject}" | thread_id: ${threadId}] ${fromSlug}: ${body}`,
      From: fromSlug,
      SenderName: fromSlug,
      Provider: "darshan",
      Surface: "darshan",
      ChatType: "direct",
      SessionKey: threadSessionKey,
      AccountId: route.accountId,
    };

    let acked = false;
    const ackOnce = async (note) => {
      if (acked) return;
      acked = true;
      return ackNotification(notif, note);
    };

    let delivered = false;
    await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx, cfg,
      dispatcherOptions: {
        deliver: async (payload, { kind }) => {
          if (kind !== "final") return;
          const ok = await postReply(threadId, payload.text ?? "", cfg);
          if (ok) {
            delivered = true;
            await ackOnce(`replied: ${payload.text?.slice(0, 60)}`);
          }
        },
        onError: (e, { kind }) => log.warn(`dispatch error: ${kind}: ${e?.message}`),
      },
    });

    if (!delivered) await ackOnce("queued for reply");
  } finally {
    _processingThreads.delete(threadId);
  }
}
```

### Context Isolation

| Without per-thread key | With per-thread key |
|---|---|
| Thread A + B share `darshan:direct:sumesh_sukumaran` | Thread A → `darshan:thread:b030887c-...` |
| LLM bleeds context across threads | Thread B → `darshan:thread:f76cb11d-...` |
| Wrong/confusing replies | Isolated history per thread ✓ |

---

## 7. Reply Delivery

```typescript
async function postReply(threadId, text, cfg) {
  const { baseUrl, agentToken } = getDarshanConfig(cfg);
  const response = await fetch(
    `${baseUrl}/api/v1/threads/${threadId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        body: text,
        intents: ["response"],   // ← current intent system (not legacy intent:"answer")
        awaiting_on: "none",
      }),
    }
  );
  if (response.ok) {
    const result = await response.json();
    // Emit responder status
    await emitResponderStatus(..., "responded", { intent: "response" });
    return true;
  }
  return false;
}
```

**API Response:**
```json
{
  "ok": true,
  "message": {
    "message_id": "c5bd70eb-76dc-49f0-a106-001077865986",
    "intents": ["response"],
    "intent": "response",
    "receipt_summary": {
      "total_recipients": 1,
      "sent_count": 1,
      "delivered_count": 0,
      "read_count": 0,
      "all_sent": true,
      "all_delivered": false,
      "all_read": false
    }
  }
}
```

---

## 8. Responder Lifecycle

Agents report thinking state via `POST /threads/:thread_id/reply-status`:

```
queued → picked → thinking → responded | blocked | failed
```

The API broadcasts `thread.reply_status_updated` WS event on each transition. The UI shows:
- `thinking` → animated "Agent is thinking…" dots
- `blocked` → "Blocked" indicator
- `failed` → "Failed" indicator

---

## 9. Receipt Tracking & Ticks

### Auto-marking (frontend)

When a thread is opened or a new message arrives via WS:
```typescript
// markThreadMessageDelivered() called when message renders
POST /api/v1/threads/{threadId}/messages/{messageId}/delivered

// markThreadMessageRead() called when user views thread
POST /api/v1/threads/{threadId}/messages/{messageId}/read
```

Both endpoints broadcast `thread.message_receipt_updated` with updated `receipt_summary`.

### Tick States

```typescript
function receiptTick(summary) {
  if (!summary || summary.total_recipients === 0)
    return { icon: "✓", color: "text-slate-400", title: "Sent" };

  if (summary.all_read)
    return { icon: "✓✓", color: "text-sky-400",
             title: `Read by ${summary.read_count}/${summary.total_recipients}` };

  if (summary.read_count > 0)
    return { icon: "✓✓", color: "text-indigo-300",
             title: `Read by ${summary.read_count}/${summary.total_recipients}` };

  if (summary.all_delivered)
    return { icon: "✓✓", color: "text-slate-400",
             title: `Delivered to ${summary.delivered_count}/${summary.total_recipients}` };

  return { icon: "✓", color: "text-slate-400", title: "Sent" };
}
```

| State | Icon | Color |
|---|---|---|
| Sent only | ✓ | slate (gray) |
| All delivered, none read | ✓✓ | slate (gray) |
| Partial read | ✓✓ | indigo-300 (mixed) |
| All read | ✓✓ | sky-400 (blue) |

---

## 10. End-to-End Flow (Current)

```
1. SUMESH types "hello" in Darshan thread UI
   → POST /api/v1/threads/{threadId}/messages
     { body: "hello", intents: ["request"] }

2. API (in single transaction):
   → INSERT thread_messages (intents: ["request"], awaiting_on: "all")
   → INSERT thread_event_outbox (event_type: "reply_required", status: "pending")
   → INSERT thread_message_receipts for each participant
   → (Optional) INSERT notifications for user-facing display

3. threadOutboxPublisher (background worker on API server):
   → polls thread_event_outbox WHERE status='pending'
   → XADD darshan:reply_required { thread_id, message_id, agent_id, ... }
   → UPDATE thread_event_outbox SET status='published'

4. threadReplyRequiredBroadcaster (background worker on API server):
   → XREADGROUP GROUP darshan_api_v1 api_broadcaster_<pid> COUNT 10
   → pushToAgent("337bf084-...", { type: "reply_required", payload: {...} })

5. Sanjaya's plugin receives WS event:
   { type: "reply_required", payload: { thread_id, message_id, body, from, subject } }
   → handleNotification(payload)
   → builds MsgContext with SessionKey: "...darshan:thread:{threadId}"
   → emitResponderStatus("thinking")
   → dispatchReplyWithBufferedBlockDispatcher(ctx)

6. LLM generates reply using per-thread session history

7. deliver() callback fires:
   → POST /threads/{threadId}/messages
     { body: "...", intents: ["response"], awaiting_on: "none" }
   → emitResponderStatus("responded", { intent: "response" })
   → ackNotification (if using legacy notification path)

8. API broadcasts thread.new_message WS event
   → Frontend appends message with ✓ tick

9. Frontend auto-calls /delivered → tick updates to ✓✓ gray
   Frontend auto-calls /read (on focus) → tick updates to ✓✓ blue
```

---

## 11. Error Handling & Failure Modes

| Scenario | Behavior |
|---|---|
| LLM lane busy | `dispatchReply` returns `delivered=false`; reply queued; ackOnce fires "queued"; reply posts when lane frees |
| WS disconnects | Plugin WS reconnects with backoff; pending events may be missed; agent should also check notifications API as fallback |
| Notification already processed | `handleNotification` checks `status`; skips if already processed |
| Agent tries to ACK without reply | API returns **HTTP 409**; agent must post reply or `emit_blocked: true` with escalation fields |
| Migration file in wrong path | Runner reads `apps/api/migrations/` only — `apps/api/src/migrations/` is ignored |
| UTF-16 migration file | PowerShell `git show > file` writes UTF-16; Node.js crashes on parse — use `Write` tool or `Out-File -Encoding utf8` always |

---

## 12. Key Design Decisions

| Decision | Why |
|---|---|
| **Redis Streams for agent delivery** | Durable, ordered, consumer-group semantics; decouples DB write from agent delivery |
| **Outbox pattern** | Outbox written in same DB transaction as message — guarantees no missed events even if Redis is briefly unavailable |
| **WS bridge (not direct Redis)** | Redis is bound to 127.0.0.1 on AWS; API broadcaster bridges stream→WS, keeping Redis internal |
| **Per-thread session key** | Prevents context bleed across threads; each thread has isolated LLM history |
| **Notifications API = user-only** | Agents no longer polled via notifications; Redis Streams is the correct transport |
| **`sendMedia` stub required** | OpenClaw's `createPluginHandler` checks `!sendText || !sendMedia`; both must be present or handler returns null → "Outbound not configured" |
| **`intents` JSONB array** | Replaces single `intent` string; supports combos like `["response", "not_handled"]`; GIN indexed for fast filtering |
| **No DB CHECK constraint on `intent`** | Old CHECK blocked new intent values; removed in migration 069; API-layer validation now enforces intent rules |
| **`ackOnce` guard** | When LLM lane queues the reply, prevents double-ACK of notification |
| **No fallback reply** | Queued replies always eventually post; a fallback would cause double messages |
| **Reply-or-escalation enforcement (409)** | Prevents agents from going silent; must post reply OR explicit blocked escalation |

---

## 13. API Endpoints Reference

| Endpoint | Used by | Notes |
|---|---|---|
| `POST /threads/:id/messages` | Plugin (`postReply`) | Send `intents: ["response"]` |
| `POST /threads/:id/reply-status` | Plugin (`emitResponderStatus`) | Lifecycle: queued→thinking→responded |
| `GET /notifications?status=pending` | Legacy polling only | User-facing; not for agent delivery |
| `POST /notifications/:id/process` | Legacy path | Returns 409 if pending reply not satisfied |
| `POST /threads/:id/messages/:id/delivered` | Frontend | Auto-called on message render |
| `POST /threads/:id/messages/:id/read` | Frontend | Auto-called on thread focus |
| `GET /threads/:id/messages` | Frontend | Includes `receipt_summary` per message |

---

## 14. Files & Locations

| File | Purpose |
|---|---|
| `apps/web/public/setup/darshan-extension.txt` | **Canonical plugin source** — agents install from here |
| `C:\Users\ssume\.openclaw\extensions\darshan\index.ts` | Sanjaya primary (Windows, NIthinN) |
| `/home/ubuntu/.openclaw/extensions/darshan/index.ts` | Sanjaya secondary (darshan.caringgems.in) |
| `apps/api/src/routes/threads.ts` | All thread endpoints, intent validation, outbox write |
| `apps/api/src/workers/threadOutboxPublisher.ts` | Polls outbox → publishes to Redis stream |
| `apps/api/src/workers/threadReplyRequiredBroadcaster.ts` | Consumes stream → pushes WS events to agents |
| `apps/api/migrations/066_thread_outbox_and_receipts.sql` | Adds `thread_event_outbox`, `thread_message_receipts` |
| `apps/api/migrations/068_add_intents_jsonb.sql` | Adds `intents` JSONB array column to `thread_messages` |
| `apps/api/migrations/069_drop_intent_check_constraint.sql` | Removes legacy CHECK constraint on `intent` column |
| `apps/web/src/app/(proto)/threads/page.tsx` | Thread UI, receipt ticks, responder status display |
| `apps/web/src/components/MessageIntents.tsx` | Intent badge rendering (uses `ThreadMessageIntent` from api.ts) |
| `apps/web/src/lib/api.ts` | `ThreadMessageIntent`, receipt helpers, WS types |
| `specs/thread-realtime-reply-outbox-receipts.md` | Full outbox + receipts + responder lifecycle spec |

---

## 15. Migration Safety Rules

> These rules exist because violations caused two production outages (migrations 060 and 068).

1. **Correct path:** Migration runner reads `apps/api/migrations/` only. Never `apps/api/src/migrations/`.
2. **UTF-8 only:** Never use `git show > file` on Windows PowerShell — writes UTF-16 LE with BOM, crashes Node.js. Use `Write` tool or `Out-File -Encoding utf8`.
3. **Verify on prod:** After every migration commit, confirm column exists on Neon DB before moving on.
4. **Pattern:** write migration → apply to prod DB → verify column → commit correct file path.
