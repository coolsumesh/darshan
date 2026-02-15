# Darshan MVP — Postgres schema plan (minimal)

Aligned with `ARCHITECTURE.md` + `SECURITY.md`. This is the *minimum* set of tables required to persist agents/threads/messages/runs/A2A policies/audit.

> Assumptions
> - Single-tenant MVP (no `org_id/tenant_id` yet). Add later by prepending `org_id` to PK/unique constraints.
> - Human identities are represented as opaque `user_id TEXT` for now (OIDC subject later). Therefore we avoid FKs to a `users` table.
> - Use UUIDs for entity ids, plus a monotonic `seq BIGINT` (identity) where cursor pagination matters.

---

## 0) Extensions

```sql
create extension if not exists pgcrypto; -- gen_random_uuid()
```

---

## 1) Tables (key columns)

### 1.1 `agents`
Represents an addressable agent in the system.

```sql
create table agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'unknown'
    check (status in ('online','offline','unknown')),
  capabilities jsonb not null default '{}',
  connector_ref text not null, -- routing hint for the connector layer
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Notes
- `connector_ref` must not include secrets (per `SECURITY.md`).

---

### 1.2 `threads`
Conversation container with minimal ACL metadata.

```sql
create table threads (
  id uuid primary key default gen_random_uuid(),
  title text,
  visibility text not null default 'private'
    check (visibility in ('private','shared')),

  created_by_user_id text not null,

  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

---

### 1.3 `thread_participants`
Represents thread ACL membership (read/write/share) and/or agent presence in a thread.

```sql
create table thread_participants (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references threads(id) on delete cascade,

  participant_type text not null
    check (participant_type in ('human','agent')),

  -- exactly one of these is set
  user_id text,
  agent_id uuid references agents(id) on delete cascade,

  can_read boolean not null default true,
  can_write boolean not null default false,
  can_share boolean not null default false,

  created_at timestamptz not null default now(),

  constraint thread_participants_exactly_one_actor
    check (
      (participant_type = 'human' and user_id is not null and agent_id is null)
      or
      (participant_type = 'agent' and agent_id is not null and user_id is null)
    )
);
```

Notes
- For MVP, you can treat `can_read/can_write/can_share` as the Thread ACL model.
- If you don’t want per-thread agent membership, you can still use this table exclusively for humans and ignore `participant_type='agent'`.

---

### 1.4 `messages`
Persisted human/agent/system messages.

```sql
create table messages (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity, -- stable cursor

  thread_id uuid not null references threads(id) on delete cascade,

  author_type text not null
    check (author_type in ('human','agent','system')),

  -- exactly one of these is set for human/agent; system sets both null
  author_user_id text,
  author_agent_id uuid references agents(id) on delete set null,

  content text not null, -- MVP: plain text
  payload jsonb not null default '{}', -- optional structured content

  -- optional linkage to runs (useful for “agent reply produced by run X”)
  run_id uuid,

  created_at timestamptz not null default now(),

  constraint messages_author_check check (
    (author_type = 'human' and author_user_id is not null and author_agent_id is null)
    or
    (author_type = 'agent' and author_agent_id is not null and author_user_id is null)
    or
    (author_type = 'system' and author_user_id is null and author_agent_id is null)
  )
);
```

Notes
- `seq` is a single global ordering across all threads; ordering within a thread is done via `(thread_id, seq)`.
- If you later need *strict* per-thread sequencing, add `thread_seq BIGINT` and assign via trigger per thread.

---

### 1.5 `runs`
Tracks agent invocations (queued→running→done).

```sql
create table runs (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,

  thread_id uuid not null references threads(id) on delete cascade,

  requested_by_type text not null check (requested_by_type in ('human','agent')),
  requested_by_user_id text,
  requested_by_agent_id uuid references agents(id) on delete set null,

  target_agent_id uuid not null references agents(id) on delete restrict,

  status text not null default 'queued'
    check (status in ('queued','running','succeeded','failed','canceled','timeout')),

  input_message_id uuid references messages(id) on delete set null,

  trace_id uuid, -- stable across a delegation tree (A2A guidance)
  parent_run_id uuid references runs(id) on delete set null,
  delegation_path jsonb not null default '[]', -- ordered list of agent ids so far
  idempotency_key text,

  started_at timestamptz,
  ended_at timestamptz,

  error_code text,
  error_message text,
  output_summary jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint runs_requested_by_check check (
    (requested_by_type = 'human' and requested_by_user_id is not null and requested_by_agent_id is null)
    or
    (requested_by_type = 'agent' and requested_by_agent_id is not null and requested_by_user_id is null)
  )
);
```

Notes
- `idempotency_key` is for de-duping connector callbacks or repeated delegation requests.

---

### 1.6 `a2a_routes`
Explicit allowlist/denylist between agents; default system behavior should be “block unless allowlisted”.

```sql
create table a2a_routes (
  id uuid primary key default gen_random_uuid(),

  from_agent_id uuid not null references agents(id) on delete cascade,
  to_agent_id uuid not null references agents(id) on delete cascade,

  policy text not null
    check (policy in ('allowed','blocked','requires_human_approval')),

  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint a2a_routes_no_self check (from_agent_id <> to_agent_id)
);
```

---

### 1.7 `audit_log`
Append-only security trail (separate from app logs). Do **not** store full message content; store ids + minimal metadata.

```sql
create table audit_log (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,

  actor_type text not null check (actor_type in ('human','agent','system')),
  actor_user_id text,
  actor_agent_id uuid references agents(id) on delete set null,

  action text not null, -- e.g., 'message.create', 'run.start', 'a2a.delegate.blocked'

  resource_type text not null,
  resource_id text not null,

  thread_id uuid references threads(id) on delete set null,
  run_id uuid references runs(id) on delete set null,

  decision text check (decision in ('allow','block','error')),
  reason text,

  ip inet,
  user_agent text,

  metadata jsonb not null default '{}',

  -- optional tamper-evidence (hash chaining)
  prev_event_hash bytea,
  event_hash bytea,

  created_at timestamptz not null default now(),

  constraint audit_actor_check check (
    (actor_type = 'human' and actor_user_id is not null and actor_agent_id is null)
    or
    (actor_type = 'agent' and actor_agent_id is not null and actor_user_id is null)
    or
    (actor_type = 'system' and actor_user_id is null and actor_agent_id is null)
  )
);
```

Append-only enforcement (recommended)
- Application: never update/delete audit rows.
- Optional DB hardening: revoke `UPDATE/DELETE` on `audit_log` from the app role and only grant `INSERT, SELECT`.

---

## 2) Indexes + constraints (required)

### 2.1 Agents
```sql
create unique index agents_name_uq on agents (lower(name));
create index agents_status_idx on agents (status);
```

### 2.2 Threads
```sql
create index threads_created_by_idx on threads (created_by_user_id);
create index threads_created_at_idx on threads (created_at desc);
create index threads_archived_at_idx on threads (archived_at);
```

### 2.3 Thread participants (ACL)
Guarantee no duplicate participant per thread.

```sql
create unique index thread_participants_thread_human_uq
  on thread_participants (thread_id, user_id)
  where participant_type = 'human';

create unique index thread_participants_thread_agent_uq
  on thread_participants (thread_id, agent_id)
  where participant_type = 'agent';

create index thread_participants_thread_idx on thread_participants (thread_id);
create index thread_participants_user_idx on thread_participants (user_id)
  where participant_type = 'human';
create index thread_participants_agent_idx on thread_participants (agent_id)
  where participant_type = 'agent';
```

### 2.4 Messages (hot path)
Primary access pattern: list messages by thread in chronological order, plus lookup by run.

```sql
create index messages_thread_seq_idx on messages (thread_id, seq desc);
create index messages_thread_created_at_idx on messages (thread_id, created_at desc);
create index messages_run_id_idx on messages (run_id);
```

### 2.5 Runs
Primary access pattern: list runs by thread, filter by status, idempotency de-dupe.

```sql
create index runs_thread_seq_idx on runs (thread_id, seq desc);
create index runs_target_status_idx on runs (target_agent_id, status);
create index runs_parent_idx on runs (parent_run_id);

create unique index runs_idempotency_uq on runs (idempotency_key)
  where idempotency_key is not null;
```

### 2.6 A2A routes

```sql
create unique index a2a_routes_pair_uq on a2a_routes (from_agent_id, to_agent_id);
create index a2a_routes_to_idx on a2a_routes (to_agent_id);
```

### 2.7 Audit log
Primary access pattern: newest-first and filtered by thread/run/action.

```sql
create index audit_log_seq_idx on audit_log (seq desc);
create index audit_log_thread_seq_idx on audit_log (thread_id, seq desc);
create index audit_log_run_seq_idx on audit_log (run_id, seq desc);
create index audit_log_action_seq_idx on audit_log (action, seq desc);
```

---

## 3) Retention + message pagination strategy

### 3.1 Retention (MVP defaults)
- **Messages/threads/runs**: retain indefinitely for MVP (until product policy is defined).
- **Audit log**: retain **90 days** by default (per `SECURITY.md`), configurable.
  - If you anticipate high volume, consider **monthly partitions** on `created_at` for `audit_log` (and possibly `messages`).

### 3.2 Cursor pagination (recommended)
Use `messages.seq` as the cursor.

**API shape**
- `GET /threads/:id/messages?limit=50&beforeSeq=12345`

**Query**
```sql
select *
from messages
where thread_id = $1
  and ($2::bigint is null or seq < $2)
order by seq desc
limit $3;
```

Return `nextBeforeSeq = min(seq)` from the page.

Why `seq`?
- Stable, monotonic, index-friendly.
- Avoids edge cases of `created_at` collisions and UUID ordering.

Fallback if you don’t want `seq`
- Use `(created_at, id)` as a composite cursor and index `(thread_id, created_at desc, id desc)`.

---

## 4) Migration tool recommendation (Fastify + TS)

### Recommendation: **Drizzle (drizzle-orm + drizzle-kit)**
Why
- Minimal runtime footprint, works well with Fastify + TypeScript.
- SQL-first and explicit schema; migrations are straightforward.
- Good fit for “MVP spine” without committing to a heavy ORM.

Alternatives
- **Prisma**: great DX and type-safe client, but heavier (engine/binaries), and can be overkill for MVP + highly SQL-shaped tables (audit, append-only, partitioning).
- **Knex**: solid migration builder, but weaker end-to-end type safety; you’ll likely add a separate query layer anyway.

If you want the simplest path with minimal dependencies
- Use **node-postgres (`pg`)** + **drizzle-kit** for migrations only, then adopt drizzle queries gradually.

---

## 5) Small implementation notes (security-aligned)
- Ensure the app role cannot `UPDATE/DELETE` `audit_log` (DB grants), and avoid exposing connector secrets in any table returned to UI.
- Audit `thread.acl.*`, `message.create`, `run.*`, and `a2a.*` as required by `SECURITY.md`.
- Enforce thread ACL by querying `thread_participants` (or a future dedicated ACL table) on every thread/message/run read/write.
