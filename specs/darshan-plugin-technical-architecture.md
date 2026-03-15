# Darshan Plugin — Technical Architecture & User Interaction Flow

**Status:** ✅ Shipped & Documented  
**Date:** 2026-03-15  
**Scope:** Plugin initialization, notification handling, LLM dispatch, reply delivery, receipt tracking

---

## Overview

The Darshan plugin is an OpenClaw channel plugin that bridges Darshan threads with OpenClaw's LLM framework. It enables real-time agent replies in thread conversations with per-thread context isolation and delivery/read receipt tracking.

**Core Flow:**
```
User message in thread → Notification → Plugin polls → LLM dispatch → Reply posted → Receipt ticks
```

---

## Technology Stack & Infrastructure

### Backend Database

**Primary:** PostgreSQL (Neon serverless)
- **Host:** `ep-withered-wildflower-aiqbe82h-pooler.c-4.us-east-1.aws.neon.tech`
- **Database:** `neondb`
- **Connection:** Pooled via Neon connection pooler

### Cache & Queues

**Redis** (for session context, queue management)
- Session LLM context (per-thread isolation)
- Rate limiting
- Pub/Sub for notifications (potential, currently polling)

### Language & Framework

- **API:** Node.js + Fastify (TypeScript)
- **Frontend:** Next.js 16 (React)
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
  type VARCHAR(50),         -- 'message', 'event', 'system'
  intent VARCHAR(50),       -- 'question', 'answer', 'update', etc.
  
  -- Metadata
  sent_at TIMESTAMP NOT NULL,
  reply_to UUID,            -- null if not a reply
  
  -- Embeddings for search
  embedding vector(1536),   -- pgvector, HNSW indexed
  embedded_at TIMESTAMP,
  
  -- Thread flow tracking
  awaiting_on VARCHAR(50),  -- 'none', 'agent', 'user'
  next_expected_from VARCHAR(255),
  
  -- Attachments (as JSONB array)
  attachments JSONB,
  
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id),
  FOREIGN KEY (reply_to) REFERENCES thread_messages(message_id)
);
```

#### `thread_message_receipts`
```sql
CREATE TABLE thread_message_receipts (
  receipt_id UUID PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES thread_messages(message_id),
  recipient_id UUID NOT NULL,  -- Who is receiving this message
  
  -- Status tracking
  status VARCHAR(50),  -- 'sent', 'delivered', 'read'
  sent_at TIMESTAMP NOT NULL,
  delivered_at TIMESTAMP,      -- When message was delivered to recipient
  read_at TIMESTAMP,           -- When recipient read the message
  
  INDEX (message_id),
  INDEX (recipient_id),
  INDEX (status)
);
```

#### `notifications`
```sql
CREATE TABLE notifications (
  notification_id UUID PRIMARY KEY,
  thread_id UUID NOT NULL,
  message_id UUID NOT NULL REFERENCES thread_messages(message_id),
  
  -- What happened
  event_type VARCHAR(50),  -- 'new_message', 'mention', 'assignment', etc.
  
  -- Notification content
  message_from VARCHAR(255),
  message_body TEXT,
  message_subject TEXT,
  
  -- Status
  status VARCHAR(50),  -- 'pending', 'processed', 'failed'
  created_at TIMESTAMP NOT NULL,
  processed_at TIMESTAMP,
  
  -- Metadata
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
  
  -- Who added them
  added_by UUID NOT NULL,
  added_by_slug VARCHAR(255),
  added_at TIMESTAMP NOT NULL,
  
  -- Removal
  removed_at TIMESTAMP,
  
  PRIMARY KEY (thread_id, participant_id),
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);
```

#### `thread_reply_policy`
```sql
CREATE TABLE thread_reply_policy (
  thread_id UUID PRIMARY KEY,
  mode VARCHAR(50),  -- 'all' or 'restricted'
  
  allowed_participants JSONB,  -- Array of {participant_id, participant_slug}
  next_message_limit INT,      -- Max messages before re-restricting
  
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);
```

#### `thread_flow` (for tracking conversation flow)
```sql
CREATE TABLE thread_flow (
  thread_id UUID PRIMARY KEY,
  path JSONB,  -- Array of flow events (chronological)
  awaiting_on VARCHAR(50),
  next_expected_from VARCHAR(255),
  
  FOREIGN KEY (thread_id) REFERENCES threads(thread_id)
);
```

### Data Flow Through Tables

```
User sends message:
  ↓
INSERT INTO thread_messages (message_id, thread_id, sender_id, body, sent_at)
  ↓
UPDATE threads SET last_activity = NOW() WHERE thread_id = ?
  ↓
INSERT INTO notifications (notification_id, thread_id, message_id, status='pending')
  ↓
Event triggers (Pub/Sub or polling loop)
  ↓
Plugin receives notification
  ↓
Plugin dispatches to LLM
  ↓
LLM generates reply
  ↓
Plugin posts reply:
  INSERT INTO thread_messages (message_id, thread_id, sender_id='SANJAYA', body=reply)
  ↓
INSERT INTO thread_message_receipts (message_id, recipient_id, status='sent')
  ↓
UPDATE notifications SET status='processed'
  ↓
Frontend marks delivered:
  POST /api/v1/threads/{id}/messages/{msgId}/delivered
  ↓
UPDATE thread_message_receipts SET delivered_at=NOW()
  ↓
Frontend marks read:
  POST /api/v1/threads/{id}/messages/{msgId}/read
  ↓
UPDATE thread_message_receipts SET read_at=NOW()
```

---

## Redis Usage & Session Management

### Session Context Cache

**Purpose:** Store LLM conversation history per thread (for context isolation)

```typescript
// Key format: darshan:thread:{threadId}
// Value: Serialized conversation history

Example:
Key: "darshan:thread:b030887c-eeb6-4d71-98b5-bfb1571b6b0b"
Value: {
  messages: [
    { role: "user", content: "What is Python?" },
    { role: "assistant", content: "Python is..." },
    { role: "user", content: "hello" }
  ],
  created_at: 1710512332000,
  updated_at: 1710512532000,
  participant_ids: ["86efbfb7-...", "337bf084-..."]
}

TTL: 24 hours (Redis expiry)
```

### Session Fetching During Dispatch

```typescript
// When LLM framework loads session
1. Route resolution: resolveAgentRoute()
   → SessionKey: "session:agent:main:darshan:thread:b030887c-..."

2. Framework looks up Redis:
   GET session:agent:main:darshan:thread:b030887c-...
   
3. Returns prior messages (if cache hit):
   [
     { role: "user", content: "What is Python?" },
     { role: "assistant", content: "Python is..." },
     ...
   ]
   
4. LLM receives:
   - Prior context (from Redis cache)
   - New message (from notification)
   - Thread metadata (from DB)

5. LLM generates reply

6. Session updated (Redis):
   SET session:agent:main:darshan:thread:b030887c-... {updated_messages}
```

### Cache Invalidation

```typescript
// When new message is posted:
1. INSERT INTO thread_messages
2. UPDATE thread_message_receipts
3. INVALIDATE Redis session (optional):
   - Either: EXPIRE key to force reload
   - Or: APPEND to existing Redis list
```

### Queue Management (Buffered Block Dispatcher)

```typescript
// When LLM lane is busy:
Redis queue: "darshan:queue:{threadId}"

Queued job: {
  thread_id: "b030887c-...",
  notification_id: "notif-xyz",
  message_body: "hello",
  created_at: 1710512532000
}

Worker polls queue every 5s, processes when lane available
```

---

## 1. Plugin Entry Point & Initialization

**File:** `C:\Users\ssume\.openclaw\workspace\darshan-channel-plugin\index.ts`

### Plugin Registration

```typescript
export const plugin: OpenClawPlugin = {
  async startAccount(cfg, rt, logger) {
    const log = logger("darshan:plugin");
    
    // 1. Load Darshan config
    const darshanCfg = cfg.channels.darshan;
    if (!darshanCfg?.enabled) {
      log.info("Darshan channel disabled, skipping");
      return;
    }
    
    const {
      endpoint,        // https://darshan.caringgems.in/api/backend
      agentId,         // SANJAYA's agent ID
      agentToken,      // SANJAYA's callback token (for notifications)
    } = darshanCfg;
    
    log.info(`Starting Darshan plugin for agent ${agentId}`);
    
    // 2. Subscribe to WebSocket for real-time notifications
    const ws = new WebSocket(`${endpoint.replace(/^http/, 'ws')}/ws`);
    ws.on("open", () => {
      log.info("WS connected");
      ws.send(JSON.stringify({
        subscribe: agentId,
        token: agentToken,
      }));
      
      // Keep alive every 30s
      const pingInterval = setInterval(() => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type: "ping" }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
    });
    
    ws.on("message", (data) => {
      try {
        const notif = JSON.parse(data.toString());
        if (notif.status === "pending") {
          handleNotification(notif, rt, cfg, log);
        }
      } catch (e) {
        log.warn(`WS parse error: ${e.message}`);
      }
    });
    
    // 3. Polling fallback (if WS disconnects)
    setInterval(() => {
      if (ws.readyState !== 1) {
        pollNotifications(rt, cfg, log);
      }
    }, 30000);
  }
};
```

### Key Configuration

```json
// openclaw.json
{
  "channels": {
    "darshan": {
      "enabled": true,
      "endpoint": "https://darshan.caringgems.in/api/backend",
      "apiKey": "824cdfcdec0e35cf...",        // Project-level API key
      "agentId": "337bf084-11d7-42a8-b613...", // SANJAYA's agent ID
      "agentToken": "315cf0a4b4ce4666..."      // SANJAYA's callback token
    }
  },
  "plugins": {
    "allow": ["darshan"]  // CRITICAL: enables plugin startAccount()
  }
}
```

---

## 2. Notification Structure & Polling

### Notification Shape

```typescript
interface Notification {
  notification_id: string;
  thread_id: string;
  message_id: string;
  status: "pending" | "processed" | "failed";
  
  // Message details
  message_from: string;      // e.g., "SUMESH_SUKUMARAN"
  message_body: string;      // e.g., "hello"
  message_subject: string;   // Thread subject
  
  // Timestamps
  created_at: ISO_TIMESTAMP;
  processed_at?: ISO_TIMESTAMP;
}
```

### Polling Endpoint

```typescript
async function pollNotifications(rt, cfg, log) {
  const darshanCfg = cfg.channels.darshan;
  const response = await fetch(
    `${darshanCfg.endpoint}/api/v1/notifications?status=pending`,
    {
      headers: {
        Authorization: `Bearer ${darshanCfg.agentToken}`,
      },
    }
  );
  
  const notifications = await response.json();
  for (const notif of notifications) {
    await handleNotification(notif, rt, cfg, log);
  }
}
```

---

## 3. User Message Flow → Notification

### User Action (Sender Side)

```
User opens Darshan thread: https://darshan.caringgems.in/threads/b030887c-...
User types: "hello"
User clicks "Send" button
```

### API Processing

```
POST /api/v1/threads/{threadId}/messages
{
  body: "hello",
  sender_id: "86efbfb7-dc7a-49df-ae11-53099630ec52",  // SUMESH
  sender_slug: "SUMESH_SUKUMARAN",
  type: "message",
  intent: "question"
}
  ↓
API creates thread_message row:
{
  message_id: "e2fd410c-1011-414f-922a-c99d3b0229a3",
  thread_id: "b030887c-eeb6-4d71-98b5-bfb1571b6b0b",
  sender_id: "86efbfb7-dc7a-49df-ae11-53099630ec52",
  sender_slug: "SUMESH_SUKUMARAN",
  body: "hello",
  sent_at: "2026-03-15T12:22:12.598Z",
  intent: "question",
  awaiting_on: "agent",
  next_expected_from: "ALL_PARTICIPANTS"
}
  ↓
API creates notification:
{
  notification_id: "notif-e2fd410c...",
  thread_id: "b030887c-eeb6-4d71-98b5-bfb1571b6b0b",
  message_id: "e2fd410c-1011-414f-922a-c99d3b0229a3",
  status: "pending",
  message_from: "SUMESH_SUKUMARAN",
  message_body: "hello",
  message_subject: "Redis Test - Sanjaya",
  created_at: "2026-03-15T12:22:13Z"
}
  ↓
If agent is subscribed via WS:
  Push notification over WebSocket
  
If polling:
  Query finds it on next 30s poll
```

---

## 4. MsgContext Construction (LLM Input)

When the plugin receives a notification, it builds a `MsgContext` for the LLM:

```typescript
async function handleNotification(notif, rt, cfg, log) {
  const {
    thread_id: threadId,
    message_id: messageId,
    message_from: fromSlug,
    message_body: body,
    message_subject: subject,
  } = notif;
  
  // Prevent concurrent dispatch for same thread
  if (_processingThreads.has(threadId)) {
    log.warn(`Thread ${threadId} already processing, skipping`);
    return;
  }
  _processingThreads.add(threadId);
  
  try {
    // Resolve agent route (get proper session key format)
    const route = rt.channel.routing.resolveAgentRoute({
      cfg,
      channel: "darshan",
      accountId: "default",
      peer: { kind: "direct", id: fromSlug },
    });
    
    // CRITICAL: Per-thread session key
    // Prevents context bleed between different threads
    const threadSessionKey = route.sessionKey.replace(
      /direct:[^:]+$/,
      `thread:${threadId}`
    );
    // Result: session:agent:main:darshan:thread:b030887c-eeb6-4d71-98b5-bfb1571b6b0b
    
    // Build context for LLM
    const ctx: MsgContext = {
      Body: body,  // Raw message only — no instructions
      
      // BodyForAgent: Metadata label for display in LLM context
      BodyForAgent: `[Darshan thread: "${subject}" | thread_id: ${threadId}]
${fromSlug}: ${body}`,
      
      From: fromSlug,
      SenderName: fromSlug,
      Provider: "darshan",
      Surface: "darshan",
      ChatType: "direct",
      
      // Per-thread context isolation
      SessionKey: threadSessionKey,
      AccountId: route.accountId,
    };
    
    // ACK guard: only ACK once, even if LLM dispatch is queued
    let acked = false;
    const ackOnce = async (note: string) => {
      if (acked) return;
      acked = true;
      return ackNotification(notif, note);
    };
    
    // Dispatch to LLM
    let delivered = false;
    await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
      ctx,
      cfg,
      dispatcherOptions: {
        deliver: async (payload, { kind }) => {
          // Wait for final LLM output
          if (kind !== "final") return;
          
          // Post reply directly to Darshan thread API
          const ok = await postReply(
            threadId,
            payload.text ?? "",
            cfg
          );
          
          if (ok) {
            delivered = true;
            await ackOnce(`replied: ${payload.text?.slice(0, 60)}`);
          }
        },
        onSkip: (_p, { kind, reason }) => {
          log.warn(`reply skipped: ${kind}/${reason}`);
        },
        onError: (e, { kind }) => {
          log.warn(`dispatch error: ${kind}: ${e?.message}`);
        },
      },
    });
    
    // If lane was busy — reply is queued, will fire later
    // DO NOT send fallback here (causes double replies)
    if (!delivered) {
      await ackOnce("queued for reply");
    }
  } finally {
    _processingThreads.delete(threadId);
  }
}
```

### Context Isolation Example

**Without per-thread session key** (WRONG):
```
Thread A: User asks "What is Python?"
  SessionKey: "session:agent:main:darshan:direct:sumesh_sukumaran"
  LLM replies: "Python is..."

Thread B: User asks "What is JavaScript?"
  SessionKey: "session:agent:main:darshan:direct:sumesh_sukumaran"  // SAME KEY!
  LLM reads Thread A's context
  LLM replies: "Python is..." (wrong!)
```

**With per-thread session key** (CORRECT):
```
Thread A: User asks "What is Python?"
  SessionKey: "session:agent:main:darshan:thread:b030887c-..."
  LLM replies: "Python is..."

Thread B: User asks "What is JavaScript?"
  SessionKey: "session:agent:main:darshan:thread:f76cb11d-..."  // DIFFERENT KEY!
  LLM has fresh context for this thread
  LLM replies: "JavaScript is..." (correct!)
```

---

## 5. LLM Dispatch & Reply Generation

### Dispatch Call

```typescript
async function dispatchToLLM(ctx, cfg) {
  return await rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx,  // MsgContext built above
    cfg,
    dispatcherOptions: {
      deliver: async (payload, { kind }) => {
        // Payload from LLM
        // kind: "thinking" | "draft" | "final"
        // payload.text: Generated reply
      },
    },
  });
}
```

### What Happens Inside Framework

1. **Load session history** from `SessionKey`
   - Fetches prior messages from this thread (from session cache)
   - Builds conversation context

2. **Route to LLM** (e.g., Claude, GPT)
   - Sends: `{ Body, BodyForAgent, prior context }`
   - LLM reads full thread history from session

3. **Generate reply**
   - LLM processes: "Given this thread history, reply to the latest message"
   - Returns text

4. **Call `deliver()` callback**
   - `deliver({ text: "..." }, { kind: "final" })`
   - Our callback posts reply back to thread

---

## 6. Reply Delivery (Custom Callback)

```typescript
async function postReply(threadId, text, cfg) {
  const darshanCfg = cfg.channels.darshan;
  const SANJAYA_ID = darshanCfg.agentId;
  
  try {
    const response = await fetch(
      `${darshanCfg.endpoint}/api/v1/threads/${threadId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${darshanCfg.apiKey}`,
        },
        body: JSON.stringify({
          body: text,           // LLM-generated text
          sender_id: SANJAYA_ID,  // SANJAYA posts this
          thread_id: threadId,
          type: "message",
          intent: "answer",     // Response to a question
        }),
      }
    );
    
    if (response.ok) {
      const result = await response.json();
      log.info(`Reply posted: ${result.message_id}`);
      return true;
    } else {
      log.error(`Failed to post reply: ${response.status}`);
      return false;
    }
  } catch (e) {
    log.error(`Post reply error: ${e.message}`);
    return false;
  }
}
```

### API Response

```json
{
  "ok": true,
  "message_id": "c5bd70eb-76dc-49f0-a106-001077865986",
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
```

---

## 7. Receipt Tracking & Ticks

### Automatic Delivery/Read Marking

When the reply is posted, the API creates a receipt row:

```typescript
// Database: thread_message_receipts
{
  receipt_id: UUID,
  message_id: "c5bd70eb-...",
  recipient_id: SANJAYA_ID,
  status: "sent",           // Initial state
  sent_at: NOW(),
  delivered_at: NULL,
  read_at: NULL,
}
```

### Frontend Automatically Calls Endpoints

When the user loads the thread (or a new message arrives):

```typescript
// 1. Message delivered (when it renders on screen)
POST /api/v1/threads/{threadId}/messages/{messageId}/delivered
  recipient_id: SUMESH's ID

// Database updates:
// delivered_at: NOW()

// 2. Message read (when user opens thread / message in view)
POST /api/v1/threads/{threadId}/messages/{messageId}/read
  recipient_id: SUMESH's ID

// Database updates:
// read_at: NOW()
```

### Receipt Summary Calculation

**Backend Query** (in `apps/api/src/routes/threads.ts`):

```sql
-- For each message, calculate receipt status across all participants
SELECT 
  message_id,
  COUNT(*) as total_recipients,
  SUM(CASE WHEN status IN ('delivered', 'read') THEN 1 ELSE 0 END) as delivered_count,
  SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) as read_count,
  COUNT(*) as sent_count,  -- All created receipts = sent
  
  -- Boolean flags
  CASE WHEN COUNT(*) = SUM(CASE WHEN status IN ('delivered', 'read') THEN 1 ELSE 0 END) 
    THEN true ELSE false END as all_delivered,
  CASE WHEN COUNT(*) = SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) 
    THEN true ELSE false END as all_read
  
FROM thread_message_receipts
WHERE message_id = ?
GROUP BY message_id;
```

**API Response** when fetching messages:

```typescript
GET /api/v1/threads/b030887c-eeb6-4d71-98b5-bfb1571b6b0b/messages

Response includes for each message:

{
  message_id: "c5bd70eb-76dc-49f0-a106-001077865986",
  sender_slug: "SANJAYA",
  body: "Got it. Ready to help. What do you need?",
  sent_at: "2026-03-15T12:22:45.123Z",
  
  receipt_summary: {
    total_recipients: 1,
    sent_count: 1,
    delivered_count: 1,
    read_count: 1,
    
    all_sent: true,
    all_delivered: true,
    all_read: true          // All have read ✓✓ blue
  }
}
```

**Database State at Each Stage:**

```
Stage 1: Message posted by SANJAYA
----------------------------------
thread_messages:
  message_id: c5bd70eb-...
  sender_id: 337bf084... (SANJAYA)
  body: "Got it..."
  sent_at: 2026-03-15T12:22:45Z

thread_message_receipts:
  receipt_id: receipt-1
  message_id: c5bd70eb-...
  recipient_id: 86efbfb7... (SUMESH)
  status: "sent"
  sent_at: 2026-03-15T12:22:45Z
  delivered_at: NULL
  read_at: NULL

receipt_summary: { sent_count: 1, delivered_count: 0, read_count: 0, all_read: false }


Stage 2: Frontend calls /delivered (message rendered)
------------------------------------------------------
thread_message_receipts UPDATE:
  status: "delivered"
  delivered_at: 2026-03-15T12:22:47Z
  read_at: NULL

receipt_summary: { sent_count: 1, delivered_count: 1, read_count: 0, all_delivered: true }


Stage 3: Frontend calls /read (user views message)
---------------------------------------------------
thread_message_receipts UPDATE:
  status: "read"
  delivered_at: 2026-03-15T12:22:47Z
  read_at: 2026-03-15T12:22:50Z

receipt_summary: { sent_count: 1, delivered_count: 1, read_count: 1, all_read: true }
```

### Tick Rendering

```typescript
function receiptTick(summary) {
  if (!summary || summary.total_recipients === 0) {
    return { icon: "✓", color: "text-slate-400", title: "Sent" };
  }
  
  // All read → blue double tick
  if (summary.all_read) {
    return {
      icon: "✓✓",
      color: "text-blue-500",
      title: `Read by ${summary.read_count}/${summary.total_recipients}`,
    };
  }
  
  // Some read → purple double tick
  if (summary.read_count > 0) {
    return {
      icon: "✓✓",
      color: "text-purple-400",
      title: `Read by ${summary.read_count}/${summary.total_recipients}`,
    };
  }
  
  // All delivered (none read yet) → gray double tick
  if (summary.all_delivered) {
    return {
      icon: "✓✓",
      color: "text-slate-400",
      title: `Delivered to ${summary.delivered_count}/${summary.total_recipients}`,
    };
  }
  
  // Only sent → gray single tick
  return {
    icon: "✓",
    color: "text-slate-400",
    title: "Sent",
  };
}
```

---

## 8. Complete End-to-End Flow (Step by Step)

### Step 1: User Sends Message

```
SUMESH_SUKUMARAN opens Darshan UI
Types in thread: "hello"
Clicks Send button
```

### Step 2: Message Stored in Thread

```
POST /api/v1/threads/b030887c-eeb6-4d71-98b5-bfb1571b6b0b/messages
{
  body: "hello",
  sender_id: "86efbfb7-dc7a-49df-ae11-53099630ec52",  // SUMESH
  sender_slug: "SUMESH_SUKUMARAN",
  intent: "question"
}

Response:
{
  message_id: "e2fd410c-1011-414f-922a-c99d3b0229a3",
  sent_at: "2026-03-15T12:22:12.598Z"
}
```

### Step 3: Notification Created

```
Database: notifications
{
  notification_id: "notif-123",
  thread_id: "b030887c-eeb6-4d71-98b5-bfb1571b6b0b",
  message_id: "e2fd410c-1011-414f-922a-c99d3b0229a3",
  status: "pending",
  message_from: "SUMESH_SUKUMARAN",
  message_body: "hello",
  message_subject: "Redis Test - Sanjaya"
}

Event: Notification posted to pubsub/WS
```

### Step 4: Plugin Receives Notification

```
Plugin WS connection receives:
{
  "notification_id": "notif-123",
  "message_body": "hello",
  "message_from": "SUMESH_SUKUMARAN",
  ...
}

OR polling detects it in:
GET /api/v1/notifications?status=pending
```

### Step 5: Plugin Builds MsgContext

```typescript
const ctx = {
  Body: "hello",
  BodyForAgent: `[Darshan thread: "Redis Test - Sanjaya" | thread_id: b030887c-...]
SUMESH_SUKUMARAN: hello`,
  From: "SUMESH_SUKUMARAN",
  SessionKey: "session:agent:main:darshan:thread:b030887c-...",
  // ... other fields
};
```

### Step 6: Plugin Dispatches to LLM

```
rt.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
  ctx,
  cfg,
  dispatcherOptions: {
    deliver: async (payload, { kind }) => {
      if (kind === "final") {
        await postReply(threadId, payload.text, cfg);
      }
    }
  }
});
```

### Step 7: LLM Generates Reply

```
Framework loads session history for thread b030887c-...
Prior messages in this thread:
  - SUMESH: "Testing ticks in thread"
  - SANJAYA: "Copy. Thread ticks are live. System's working."
  ...
  - SUMESH: "hello"

LLM generates response:
"Got it. Ready to help. What do you need?"
```

### Step 8: Custom Deliver Callback Posts Reply

```
deliver({ text: "Got it. Ready to help. What do you need?" })

POST /api/v1/threads/b030887c-eeb6-4d71-98b5-bfb1571b6b0b/messages
{
  body: "Got it. Ready to help. What do you need?",
  sender_id: "337bf084-11d7-42a8-b613-04b28b0f956b",  // SANJAYA
  intent: "answer"
}

API creates:
{
  message_id: "c5bd70eb-76dc-49f0-a106-001077865986",
  sender_id: "337bf084-11d7-42a8-b613-04b28b0f956b",
  body: "Got it. Ready to help. What do you need?",
  sent_at: "2026-03-15T12:22:45Z"
}

Creates receipt row:
{
  message_id: "c5bd70eb-...",
  recipient_id: SANJAYA_ID,
  status: "sent",
  sent_at: NOW()
}
```

### Step 9: Plugin ACKs Notification

```
POST /api/v1/notifications/notif-123/process
{
  status: "processed",
  note: "replied: Got it. Ready to help. What do you need?"
}

Database updates:
{
  notification_id: "notif-123",
  status: "processed",
  processed_at: NOW()
}
```

### Step 10: User Sees Reply in Thread UI

```
Browser renders:
┌─────────────────────────────────────────────────┐
│ SUMESH_SUKUMARAN                    just now  ✓ │
│ hello                                      e2fd │
├─────────────────────────────────────────────────┤
│ SANJAYA                              just now  ✓ │
│ Got it. Ready to help. What do you need?   c5bd │
└─────────────────────────────────────────────────┘

Single tick = sent only
```

### Step 11: Frontend Marks as Delivered

```
When reply message renders on screen:
POST /api/v1/threads/b030887c-.../messages/c5bd70eb-../delivered

API updates receipt row:
{
  message_id: "c5bd70eb-...",
  delivered_at: NOW()
}

Browser fetches message receipt_summary:
GET /api/v1/threads/b030887c-../messages/c5bd70eb-../receipt_summary
Response: delivered_count: 1, read_count: 0

UI updates tick to ✓✓ gray (delivered)
```

### Step 12: User Reads Reply

```
When user focuses thread/scrolls message into view:
POST /api/v1/threads/b030887c-.../messages/c5bd70eb-../read

API updates receipt row:
{
  message_id: "c5bd70eb-...",
  read_at: NOW()
}

Browser fetches receipt_summary:
Response: delivered_count: 1, read_count: 1, all_read: true

UI updates tick to ✓✓ blue (all read)

Final render:
┌─────────────────────────────────────────────────┐
│ SANJAYA                              just now  ✓✓│
│ Got it. Ready to help. What do you need?   c5bd │
│                                      (blue)      │
└─────────────────────────────────────────────────┘
```

---

## 9. Key Design Decisions

| Decision | Why |
|----------|-----|
| **Per-thread session key** | Prevents context bleed between threads. Each thread gets isolated LLM history. |
| **Custom deliver() callback** | Darshan thread API is not standard OpenClaw channel. Bypass framework routing, post directly. |
| **_processingThreads Set** | Prevent concurrent LLM dispatch for same thread (race condition). Simple Set with cleanup. |
| **ackOnce guard** | When LLM lane is busy and reply gets queued, don't double-ACK notification. |
| **No fallback** | Queued replies from LLM always eventually post. Fallback would cause double messages. |
| **WebSocket + polling** | WS for real-time, polling (30s) as fallback. Always has a path to receive notifications. |
| **Receipt endpoints** | Automatic — frontend calls POST /delivered and /read when message renders and is viewed. |

---

## 10. Error Handling & Failure Modes

### Scenario: LLM Lane is Busy

```
Plugin calls dispatchReplyWithBufferedBlockDispatcher()
  ↓
Lane returns immediately: delivered=false
  ↓
Plugin ACKs with: "queued for reply"
  ↓
LLM eventually processes the message
  ↓
deliver() callback fires
  ↓
Reply posts to thread
  ↓
User sees delayed but correct reply (no double message)
```

### Scenario: WS Connection Drops

```
WS disconnects
  ↓
Polling loop (30s interval) takes over
  ↓
Fetches pending notifications
  ↓
Continues processing normally
  ↓
WS reconnects when network recovers
  ↓
Back to real-time
```

### Scenario: Notification Already Processed

```
Plugin receives notification with status="processed"
  ↓
handleNotification() checks status
  ↓
Skips (already processed)
  ↓
No LLM dispatch
```

---

## 11. API Endpoints & Database Operations

### Core Endpoints Used by Plugin

#### `GET /api/v1/notifications?status=pending`

**Database Query:**
```sql
SELECT * FROM notifications 
WHERE status = 'pending' 
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 100;
```

**Response:**
```json
[
  {
    "notification_id": "notif-xyz",
    "thread_id": "b030887c-...",
    "message_id": "e2fd410c-...",
    "status": "pending",
    "message_from": "SUMESH_SUKUMARAN",
    "message_body": "hello",
    "message_subject": "Redis Test - Sanjaya",
    "created_at": "2026-03-15T12:22:12.598Z"
  }
]
```

#### `POST /api/v1/threads/{threadId}/messages`

**Database Operations:**
```sql
1. INSERT INTO thread_messages (
     message_id, thread_id, sender_id, sender_slug, 
     body, type, intent, sent_at, awaiting_on, next_expected_from
   ) VALUES (...)

2. INSERT INTO thread_message_receipts (
     receipt_id, message_id, recipient_id, 
     status='sent', sent_at=NOW()
   ) 
   FOR EACH thread participant

3. UPDATE threads 
   SET last_activity=NOW(), has_reply_pending=true 
   WHERE thread_id=?

4. INSERT INTO thread_flow (path[]) 
   { event_type: 'answer', from_actor: 'SANJAYA', created_at: NOW() }
```

**Response:**
```json
{
  "ok": true,
  "message_id": "c5bd70eb-76dc-49f0-a106-001077865986",
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
```

#### `POST /api/v1/notifications/{notificationId}/process`

**Database Operations:**
```sql
UPDATE notifications 
SET status='processed', processed_at=NOW() 
WHERE notification_id=?;
```

**Purpose:** Mark notification as handled (prevents re-processing)

#### `POST /api/v1/threads/{threadId}/messages/{messageId}/delivered`

**Database Operations:**
```sql
UPDATE thread_message_receipts 
SET status='delivered', delivered_at=NOW() 
WHERE message_id=? AND recipient_id=CURRENT_USER_ID;
```

#### `POST /api/v1/threads/{threadId}/messages/{messageId}/read`

**Database Operations:**
```sql
UPDATE thread_message_receipts 
SET status='read', read_at=NOW() 
WHERE message_id=? AND recipient_id=CURRENT_USER_ID;
```

### Query Performance Considerations

| Query | Optimization |
|-------|--------------|
| `notifications` lookup | INDEX (status, created_at) for fast pending query |
| `thread_message_receipts` aggregate | GROUP BY on message_id is fast due to FK index |
| `thread_messages` by thread_id | INDEX (thread_id) for range queries |
| Vector search (embedding) | pgvector HNSW index on `embedding` column |

---

## 12. Files & Locations

| File | Purpose |
|------|---------|
| `darshan-channel-plugin/index.ts` | Plugin source (edit here) |
| `.openclaw/extensions/darshan/index.ts` | Plugin installed (copy after edit) |
| `openclaw.json` | Channel config + apiKey, agentId, agentToken |
| `apps/api/src/routes/threads.ts` | API endpoints: `/messages`, `/delivered`, `/read` |
| `apps/web/src/app/(proto)/threads/page.tsx` | UI: Message bubble, receipt tick rendering |
| `specs/feature-receipt-ticks-v1.md` | Receipt ticks feature spec |

---

## 13. Verification Checklist

- [ ] Plugin loads (`openclaw logs` shows `Darshan plugin starting`)
- [ ] WS connection established (`Darshan WS connected` in logs)
- [ ] Incoming message creates notification (`notification_id` logged)
- [ ] Plugin receives notification (polling or WS)
- [ ] MsgContext built with correct `SessionKey` (per-thread format)
- [ ] LLM dispatch called (framework logs show dispatch)
- [ ] Reply posted to thread (`Reply posted: <message_id>` logged)
- [ ] Notification ACK'd (`processed` status in DB)
- [ ] Receipt ticks render in UI
- [ ] Ticks change color on delivery/read

---

**Last Updated:** 2026-03-15  
**Author:** Sanjaya (via Sumesh's guidance)
