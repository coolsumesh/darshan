# Spec: Context Compression in Threads (V1)

## 1) Objective
Compress noisy thread history into a reliable, compact context for future retrieval, while keeping raw messages as source of truth.

---

## 2) Scope (V1)

### In scope
- Manual/on-demand compaction API
- Read API for compact context
- Deterministic summary format
- Append mode with strict cursor rules
- Idempotent retry behavior

### Out of scope
- New compaction-history table
- Background auto-compaction worker
- Complex confidence scoring/citation graph

---

## 3) Storage (V1)
Use existing `threads` columns only:
- `summary text`
- `summary_updated_at timestamptz`

No DB migration required for V1.

Raw `thread_messages` remain immutable and authoritative.

---

## 4) Summary Contract (strict format)
`threads.summary` must always use these sections in order:

1. **Decisions**
2. **Requirements**
3. **Open Questions**
4. **Action Items (owner + status)**
5. **Out of Scope**

Rules:
- Bullet list only
- If empty: `- None`
- No uncited assumptions or invented facts
- Target length: ~300–800 tokens

---

## 5) APIs

### 5.1 POST `/api/v1/threads/:thread_id/compact`
Compacts thread context and updates `threads.summary`.

#### Request
```json
{
  "mode": "refresh" | "append",
  "since_message_id": "uuid | null",
  "idempotency_key": "string | null"
}
```

#### Access
Write allowed for thread creator/owner/coordinator (same thread access model as update routes).

#### Behavior
- `refresh`: reprocess full eligible message window
- `append`: process messages strictly after `since_message_id`
- Update:
  - `threads.summary`
  - `threads.summary_updated_at = now()`

#### Response
```json
{
  "ok": true,
  "thread_id": "uuid",
  "mode": "refresh|append",
  "summary": "string",
  "summary_updated_at": "iso-datetime",
  "processed_message_count": 0
}
```

---

### 5.2 GET `/api/v1/threads/:thread_id/context`
Returns compact context for agents/humans.

#### Response
```json
{
  "ok": true,
  "thread_id": "uuid",
  "summary": "string | null",
  "summary_updated_at": "iso-datetime | null",
  "fallback_recent_messages": []
}
```

#### Rule
- If summary exists, return it as primary context.
- If not, return recent messages fallback (bounded list).

---

## 6) Append Cursor Rules (`since_message_id`) — Locked

1. **Cursor must belong to same thread**
   - Else `400 invalid_since_message_id`.

2. **Server-ordered sequencing only**
   - Delta is computed by DB order (`sent_at`, tie-breaker `message_id`), never client order.

3. **Stale cursor handling**
   - If cursor is too old/invalid for safe append window, return `409 stale_cursor` with `suggested_mode: "refresh"`.

4. **Concurrency boundary**
   - Append computes against a consistent DB snapshot for that request.
   - Messages arriving after snapshot are not partially included; next append picks them up.

5. **Idempotent retries**
   - Same `(thread_id, idempotency_key, mode, since_message_id)` must return same logical result and avoid duplicate summary mutations.

---

## 7) Trigger Guidance (caller-side for V1)
Call compaction when any of:
- ~20+ new messages since last summary
- Clear decision captured
- Thread state/type shift (e.g., task to blocked/review/closed)

(V1 has no server cron/worker trigger.)

---

## 8) Quality / Safety Rules
- Never delete or rewrite raw messages
- Normalize duplicates (don’t re-add same bullet each run)
- Superseded decisions must be updated in-place in summary (not duplicated)
- Noise-only windows should produce no-op (summary unchanged except timestamp policy if configured)

---

## 9) Error Codes (minimum)
- `400 invalid_since_message_id`
- `403 forbidden`
- `404 thread_not_found`
- `409 stale_cursor`
- `422 invalid_mode`
- `500 compact_failed`

---

## 10) Minimum Test Suite (must pass)
1. **Happy path append**
   - Valid cursor, new messages, summary updated correctly.

2. **Stale cursor**
   - Old/unsafe cursor returns `409 stale_cursor` + `suggested_mode=refresh`.

3. **Concurrent append race**
   - Two append calls near-simultaneous do not corrupt summary.

4. **Idempotent retry**
   - Retried request with same idempotency key does not duplicate bullets.

5. **Superseded decision update**
   - Old decision replaced cleanly in summary.

6. **Noise-only no-op**
   - Chitchat-only delta does not bloat summary.

7. **Refresh consistency**
   - Refresh rebuilds stable summary format from raw messages.

---

## 11) Acceptance Criteria
- Thread with 100+ mixed messages yields useful compact context (<~1KB preferred).
- Repeated compaction remains stable and non-duplicative.
- Strict section format always maintained.
- Consumers can rely on `GET /context` without replaying full thread.
- No regressions in existing thread CRUD/message behavior.
