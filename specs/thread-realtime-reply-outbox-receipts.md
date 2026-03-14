# Spec: Reliable Real-time Thread Replies + Outbox + Telegram-style Receipt Ticks

**Status:** Draft (approved direction)  
**Owner:** Sanjaya  
**Date:** 2026-03-14

---

## 1) Problem Statement

Current thread reply flow has correctness gaps:

1. **Silent non-replies:** agent notifications can be processed without an actual reply in thread.
2. **Transport coupling confusion:** `notifications` API is being used as agent delivery transport, while product intent is to keep notifications user-facing.
3. **Delivery reliability risk:** DB writes and transport dispatch can drift (message saved but no real-time wake-up event, or vice versa).
4. **Missing message-level delivery UX:** no robust Telegram-like tick states for sent/delivered/read, including partial-read state in group threads.

Net effect: user asks a question, thread shows pending, but expected agent reply may not happen in real time and sender lacks precise delivery/read visibility.

---

## 2) Goals

1. **Real-time agent reply orchestration** for user questions.
2. **Strong reliability** between DB truth and event dispatch.
3. **Clear separation of concerns:**
   - Threads = canonical conversation state
   - Notifications = user-facing notifications only
   - Agent transport = Redis Streams
4. **Telegram-style ticks** with group partial-read support:
   - ✓ sent to all
   - ✓✓ gray delivered to all
   - ✓✓ mixed read by some
   - ✓✓ blue read by all
5. **Tooltip required:** `Read by X/Y participants`.

---

## 3) Non-Goals

1. Full Kafka adoption (explicitly out of scope now).
2. End-to-end analytics pipeline.
3. Read-receipt privacy controls (can be future enhancement).

---

## 4) Proposed Architecture

### 4.1 Canonical data remains in Postgres
- `threads`
- `thread_messages`
- `thread_next_reply`

### 4.2 Add durable outbox for event publishing
- New table: `thread_event_outbox`
- Written in same DB transaction as thread message + next-reply updates.
- Publisher worker reads outbox and publishes to Redis Streams.

### 4.3 Agent real-time transport via Redis Streams
- Stream: `darshan:reply_required`
- Consumer group: `darshan_agents`
- Agent consumes only events targeted to its `agent_id`.
- Agent worker emits responder lifecycle updates so clients can distinguish queued, active thinking, and terminal states.

### 4.4 Message receipt system (ticks)
- New table: `thread_message_receipts` (per-message per-recipient status)
- Status timeline: `sent -> delivered -> read`
- Aggregate counts drive ticks and tooltip.

---

## 5) Data Model Changes

## 5.1 New table: `thread_event_outbox`

```sql
CREATE TABLE thread_event_outbox (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL, -- e.g. reply_required
  thread_id uuid NOT NULL REFERENCES threads(thread_id) ON DELETE CASCADE,
  message_id uuid NOT NULL REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|published|failed|dead_letter
  publish_attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX idx_thread_event_outbox_pending
  ON thread_event_outbox(status, created_at)
  WHERE status IN ('pending','failed');
```

## 5.2 New table: `thread_message_receipts`

```sql
CREATE TABLE thread_message_receipts (
  message_id uuid NOT NULL REFERENCES thread_messages(message_id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL,
  recipient_slug text NOT NULL,
  status text NOT NULL DEFAULT 'sent', -- sent|delivered|read
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  read_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, recipient_id)
);

CREATE INDEX idx_thread_message_receipts_message ON thread_message_receipts(message_id);
CREATE INDEX idx_thread_message_receipts_recipient ON thread_message_receipts(recipient_id, status);
```

> Note: `threads` table does **not** require mandatory schema changes for this feature.

---

## 6) Runtime Flow (User posts a question)

1. User calls `POST /threads/:thread_id/messages`.
2. API transaction:
   - insert `thread_messages` (intent=`question`)
   - resolve targets (`@mentions` => mentioned participants, else all non-sender participants)
   - upsert `thread_next_reply`
   - set `threads.has_reply_pending=true`
   - insert `thread_message_receipts` rows (`status='sent'`) for all recipients
   - insert one `thread_event_outbox` row per targeted agent (`event_type='reply_required'`)
3. Commit.
4. Outbox publisher worker publishes each event to Redis stream and marks row `published`.
5. Targeted agent consumer lifecycle:
   - emit `queued` when pending reply exists but no worker has claimed the job yet
   - emit `picked` when a worker claims the Redis stream event
   - emit `thinking` when the responder starts generating or preparing a reply
   - emit one terminal state: `responded`, `blocked`, or `failed`
6. Targeted agent consumer must either:
   - post reply (`answer|review_request|blocked`) OR
   - post explicit blocked escalation.
7. On valid resolving reply, API removes responder from `thread_next_reply.pending_participant_ids`; clear pending when empty.
8. Receipt updates (`delivered/read`) update ticks + tooltip in sender UI.

---

## 7) API Changes

## 7.1 Thread message response enrichment
For each message include receipt summary:

```json
{
  "receipt_summary": {
    "total_recipients": 5,
    "sent_count": 5,
    "delivered_count": 4,
    "read_count": 2,
    "all_sent": true,
    "all_delivered": false,
    "all_read": false
  }
}
```

## 7.2 Receipt update endpoints
- `POST /api/v1/threads/:thread_id/messages/:message_id/delivered`
- `POST /api/v1/threads/:thread_id/messages/:message_id/read`

Both endpoints must be idempotent.

## 7.3 Receipt query endpoint
- `GET /api/v1/threads/:thread_id/messages/:message_id/receipts`
- Returns recipient-level states + aggregate summary.

## 7.4 WebSocket events
- `thread.message_receipt_updated`
- `thread.updated`
- `thread.message_created`
- `thread.reply_status_updated`

## 7.5 Responder status lifecycle

Responder status is tracked per `(thread_id, responder_id, source_message_id)` and is monotonic:

`queued -> picked -> thinking -> responded`

Alternate terminal transitions:
- `thinking -> blocked`
- `queued|picked|thinking -> failed`

Rules:
1. `queued` means the user-visible pending reply exists and the responder has not yet claimed execution.
2. `picked` means a worker/agent process claimed the job, but no model output has started yet.
3. `thinking` means the responder is actively generating or preparing a reply; this state drives the `Agent is thinking` UI.
4. `responded` is emitted only after the resolving thread message is persisted successfully.
5. `blocked` is emitted only when the responder posts an explicit blocked/escalation message to the thread.
6. `failed` is non-resolving. It does not clear `thread_next_reply.pending_participant_ids`; the UI keeps showing pending with an error affordance until retried or manually resolved.

## 7.6 `thread.reply_status_updated` event contract

```json
{
  "type": "thread.reply_status_updated",
  "thread_id": "uuid",
  "source_message_id": "uuid",
  "responder": {
    "participant_id": "uuid",
    "participant_slug": "sanjaya",
    "display_name": "Sanjaya"
  },
  "status": "thinking",
  "previous_status": "picked",
  "intent": null,
  "failure_code": null,
  "failure_message": null,
  "occurred_at": "2026-03-14T10:15:22.000Z"
}
```

Field notes:
- `status`: one of `queued|picked|thinking|responded|blocked|failed`
- `intent`: populated for terminal resolving states, typically `answer|review_request|blocked`
- `failure_code` and `failure_message`: populated only for `failed`
- delivery is best-effort real time, but the latest state must also be recoverable from thread fetch/read models on reconnect

---

## 8) Tick State Machine (Sender UI)

Given:
- `Y = total_recipients`
- `D = delivered_count`
- `R = read_count`

States:
1. **✓** if `sent_count == Y` and `D < Y`
2. **✓✓ gray** if `D == Y` and `R == 0`
3. **✓✓ mixed (gray+blue)** if `0 < R < Y`
4. **✓✓ blue** if `R == Y`

Tooltip (required):
- `Read by R/Y participants`
- optional second line: `Delivered D/Y`

---

## 9) Enforcement Rules

1. If agent is targeted in `thread_next_reply.pending_participant_ids`, silent completion is invalid.
2. A targeted event is considered resolved only by a thread message intent in:
   - `answer`, `review_request`, `blocked`
3. Non-resolving intents do not clear pending responder state.
4. `failed` status alone never resolves pending reply requirements.

---

## 10) Pending/Thinking UI Behavior

When a thread has pending responders:

1. Show pending chips/rows for each targeted responder.
2. If latest status is `queued` or `picked`, show neutral pending copy such as `Waiting for Sanjaya`.
3. If latest status is `thinking`, show active copy such as `Sanjaya is thinking...` with a subtle animated indicator.
4. If latest status is `blocked`, replace the thinking state with the blocked escalation message once that thread message arrives.
5. If latest status is `failed`, keep the responder in pending UI but surface error copy such as `Sanjaya failed to respond. Retry needed.`
6. If no responder has reached `thinking` yet, the thread-level pending banner may say `Reply pending`.
7. If any responder is in `thinking`, the thread-level pending banner should prefer `Agent is thinking` or `Agents are thinking`.
8. On reconnect or initial load, the UI must derive the same state from fetched thread data even if websocket events were missed.

---

## 11) Rollout Plan

### Phase 1 (compatible)
- Add tables + workers + Redis stream publisher.
- Keep existing flow behind feature flag fallback.

### Phase 2 (switch)
- Turn on Redis-based agent delivery by default.
- Stop agent transport via notifications path.

### Phase 3 (cleanup)
- Remove obsolete agent-notification coupling code.
- Keep notifications user-only.

---

## 12) Observability

Metrics/logs:
- outbox pending/published/failed counts
- publish latency
- consumer lag
- targeted reply violation count
- reply SLA breaches
- responder status transition counts (`queued`, `picked`, `thinking`, `responded`, `blocked`, `failed`)
- responder time-to-first-thinking and time-to-response

Dashboards/alerts:
- outbox stuck > threshold
- reply_required events unacked > threshold
- pending reply age > SLA

---

## 13) Acceptance Criteria

1. User question with `@Sanjaya` creates pending reply for Sanjaya and publishes event.
2. If agent does not post reply/escalation, event cannot silently finalize.
3. Sender sees live tick transitions and `Read by X/Y participants` tooltip.
4. Thread UI shows `Agent is thinking` while responder status is `thinking`.
5. `thread.reply_status_updated` websocket events keep responder state in sync across clients.
6. No agent delivery depends on notifications API.
7. At-least-once event delivery guaranteed via outbox retries and idempotent consumption.

---

## 14) Risks & Mitigations

1. **Duplicate deliveries** (at-least-once):
   - use `event_id` idempotency in consumer.
2. **Outbox backlog growth:**
   - retry caps, dead-letter status, alerting.
3. **Read amplification on receipts:**
   - aggregate caching/query optimization.
4. **Stale thinking state after disconnect/crash:**
   - recover from persisted latest responder status and mark abandoned runs `failed` via watchdog/SLA sweeper.

---

## 15) Open Questions

1. Should `thread_next_reply.mode` be `all` always for user questions, or configurable per thread?
2. SLA default per thread type (conversation vs task)?
3. Keep recipient-level receipt details visible to all participants or sender-only?
