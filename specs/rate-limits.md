# Rate-limit Logging + Model Fallback Tracking — Product/Engineering Spec (Darshan v1)

**Owner:** Platform / Connector + Observability

**Problem:** When LLM providers rate-limit (HTTP 429 / quota / throttling), we currently lack consistent visibility into:
- which provider/model was attempted,
- who/what triggered it (human operator vs agent),
- what fallback model was chosen (if any), and
- whether the fallback succeeded.

This spec defines a **minimal, reliable event** to record all 429/rate-limit incidents and associated fallback outcomes for reporting and debugging.

---

## 1) Definitions

- **Provider**: upstream LLM service (e.g., OpenAI, Anthropic, Google, Groq, etc.).
- **Model**: the upstream model name attempted (e.g., `gpt-4.1-mini`).
- **Rate-limit event**: an upstream response indicating throttling/quota limits.
  - MVP trigger: **HTTP 429** or provider SDK error mapped to `rate_limited`.
- **Fallback**: a subsequent attempt using a different model/provider chosen by routing policy.
- **Attribution**: the actor responsible for the triggering request:
  - human operator (`requested_by_user_id`)
  - agent (`requested_by_agent_id`)

---

## 2) Requirements (MVP)

When **any provider** returns a rate-limit condition (429 or equivalent), Darshan must record an event capturing:

### 2.1 Required fields
- `provider` — provider attempted
- `model` — model attempted
- `error_code` — HTTP status or normalized code (`429`, `rate_limited`, provider-specific string)
- `occurred_at` — timestamp (UTC)
- **Attribution** (who triggered)
  - `requested_by_type` (`human|agent`)
  - `requested_by_user_id` (if human)
  - `requested_by_agent_id` (if agent)
- Correlation
  - `thread_id`
  - `run_id`
- Fallback tracking
  - `fallback_provider` (nullable)
  - `fallback_model` (nullable)
  - `fallback_succeeded` (nullable boolean)

### 2.2 Strongly recommended fields (low-cost)
- `request_id` / `connector_request_id` (if available)
- `retry_after_ms` (from headers, if available)
- `attempt` number within a run (1..N)
- `metadata` JSON (provider response snippets that are safe to store)

### 2.3 Non-goals (v1)
- Building a full analytics dashboard.
- Capturing *all* upstream errors (only rate-limit + fallback outcome is in scope).
- Storing raw prompts/responses as part of this event.

---

## 3) Proposed Data Model

### Option A (recommended): dedicated append-only table
Create an append-only table `llm_rate_limit_events`.

**Rationale:** makes querying/reporting simple and avoids overloading `audit_log` with provider telemetry.

**Schema (Postgres, draft)**
```sql
create table llm_rate_limit_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,

  occurred_at timestamptz not null default now(),

  thread_id uuid references threads(id) on delete set null,
  run_id uuid references runs(id) on delete set null,

  requested_by_type text not null check (requested_by_type in ('human','agent')),
  requested_by_user_id text,
  requested_by_agent_id uuid references agents(id) on delete set null,

  provider text not null,
  model text not null,
  error_code text not null, -- '429' or 'rate_limited' or provider-specific
  retry_after_ms integer,

  fallback_provider text,
  fallback_model text,
  fallback_succeeded boolean,

  metadata jsonb not null default '{}',

  created_at timestamptz not null default now(),

  constraint llm_rate_limit_events_requested_by_check check (
    (requested_by_type = 'human' and requested_by_user_id is not null and requested_by_agent_id is null)
    or
    (requested_by_type = 'agent' and requested_by_agent_id is not null and requested_by_user_id is null)
  )
);

create index llm_rle_seq_idx on llm_rate_limit_events (seq desc);
create index llm_rle_occurred_idx on llm_rate_limit_events (occurred_at desc);
create index llm_rle_thread_idx on llm_rate_limit_events (thread_id, occurred_at desc);
create index llm_rle_run_idx on llm_rate_limit_events (run_id, occurred_at desc);
create index llm_rle_provider_model_idx on llm_rate_limit_events (provider, model, occurred_at desc);
```

### Option B (fallback): store in `audit_log`
If introducing a new table is undesirable for MVP, store events as:
- `audit_log.action = 'llm.rate_limited'`
- Required fields in `audit_log.metadata`.

**Note:** this is acceptable for MVP but makes reporting noisier and mixes operational telemetry with security audit.

---

## 4) Event Recording Behavior

### 4.1 Trigger
In the connector/provider adapter (or the orchestration layer that calls providers):
1. On upstream response classified as rate-limit (HTTP 429 or SDK equivalent), write a `llm_rate_limit_events` row.
2. If routing policy chooses a fallback model/provider, populate `fallback_provider` + `fallback_model` immediately.
3. After fallback attempt completes, update `fallback_succeeded` **or** (preferred for append-only purity) emit a second event:
   - Either:
     - **A)** allow a single UPDATE to set `fallback_succeeded` (simple)
     - **B)** append a second row `llm.fallback_result` (more normalized)

**MVP recommendation:** allow updating `fallback_succeeded` in the same row (keeps reporting simple). If strict append-only is required later, migrate to split events.

### 4.2 Correlation
- Always attach `thread_id` and `run_id` when the request is part of a Darshan run.
- If a provider call happens outside a run (rare), allow nulls but still capture attribution if known.

### 4.3 Attribution source of truth
Use `runs.requested_by_type + requested_by_*` as the canonical attribution.
- If the rate-limit occurs during a run, copy those values into the event.
- If no run exists, use best-available actor context from the request.

---

## 5) Minimal UI / Reporting (MVP)

MVP reporting can be **API + DB query** (no new UI required).

### 5.1 API (optional but recommended)
Add read-only endpoint:
- `GET /api/v1/observability/rate-limits?from=&to=&provider=&model=&threadId=&runId=&actorType=&limit=`

Response includes the required fields plus identifiers.

### 5.2 Example DB queries
**A) Rate-limits in last 24h (by provider/model)**
```sql
select provider, model, count(*) as rate_limit_count
from llm_rate_limit_events
where occurred_at > now() - interval '24 hours'
group by provider, model
order by rate_limit_count desc;
```

**B) Fallback success rate in last 7d**
```sql
select
  provider,
  model,
  count(*) filter (where fallback_model is not null) as fallback_attempted,
  count(*) filter (where fallback_succeeded = true) as fallback_succeeded,
  round(
    100.0 * count(*) filter (where fallback_succeeded = true)
    / nullif(count(*) filter (where fallback_model is not null), 0),
    2
  ) as fallback_success_pct
from llm_rate_limit_events
where occurred_at > now() - interval '7 days'
group by provider, model
order by fallback_attempted desc;
```

**C) Per-thread debugging (show timeline)**
```sql
select occurred_at, provider, model, error_code, fallback_provider, fallback_model, fallback_succeeded
from llm_rate_limit_events
where thread_id = $1
order by occurred_at asc;
```

---

## 6) Acceptance Criteria

### Recording
- When an upstream call returns **HTTP 429** (or normalized `rate_limited`), Darshan persists exactly one event row per such occurrence.
- The stored event includes all required fields:
  - provider/model attempted, error_code, occurred_at
  - requested_by attribution
  - thread_id/run_id
  - fallback model/provider (if chosen)
  - whether fallback succeeded (if fallback attempted)

### Correlation
- Given a `run_id`, querying `llm_rate_limit_events` returns all rate-limit events for that run.
- Given a `thread_id`, querying returns all rate-limit events for that thread.

### Reporting
- A basic query (examples above) can produce:
  - top rate-limited provider/models
  - fallback success rate
  - per-thread timeline

### Safety / data hygiene
- No prompt text, user secrets, or full provider responses are stored in the event.
- `metadata` only contains safe, bounded fields (e.g., retry-after, provider request ids) and is size-limited by convention.

---

## 7) Implementation Notes (Engineering)

- Normalize provider errors to a small set:
  - `http_429` / `rate_limited`
  - optionally `quota_exceeded` if provider distinguishes (still treated as rate-limit class for this spec).
- Prefer server-side `occurred_at = now()` at insert time; do not trust client timestamps.
- If the connector already emits structured logs, reuse the same normalized fields and write-through to Postgres.
- Consider adding a WS event later (`observability.rate_limit`) for live dashboards; not required for MVP.
