# Project Team Agent Metadata (Darshan)

## Goal
When listing agents for a project, always return:
1) `agent_role` (Coordinator | Worker | Reviewer)
2) `agent_level` (numeric capability level from persistent ledger)

---

## 1) API Contract

### Endpoint
`GET /api/v1/projects/:id/team`

### Response (proposed)
```json
{
  "ok": true,
  "team": [
    {
      "id": "<membership-id>",
      "agent_id": "<uuid>",
      "name": "Mithran",
      "status": "online",
      "ping_status": "ok",
      "last_seen_at": "2026-03-04T16:39:03.089Z",

      "agent_role": "worker",
      "agent_level": 1,
      "level_confidence": "low",
      "last_evaluated_at": "2026-03-04T16:39:03.089Z"
    }
  ]
}
```

### Enums
- `agent_role`: `coordinator | worker | reviewer`
- `level_confidence`: `low | medium | high`
- `agent_level`: integer >= 0 (unbounded)

---

## 2) Source of Truth

Use DB as canonical store for runtime reads.

### 2.1 Project role mapping (per project)
Create/normalize table:

```sql
create table if not exists project_agent_roles (
  project_id   uuid not null references projects(id) on delete cascade,
  agent_id     uuid not null references agents(id) on delete cascade,
  agent_role   text not null check (agent_role in ('coordinator','worker','reviewer')),
  updated_by   uuid null references users(id),
  updated_at   timestamptz not null default now(),
  primary key (project_id, agent_id)
);
```

### 2.2 Capability level ledger (global per agent)
Create table:

```sql
create table if not exists agent_capability_levels (
  agent_id            uuid primary key references agents(id) on delete cascade,
  current_level       integer not null default 0 check (current_level >= 0),
  level_confidence    text not null default 'low' check (level_confidence in ('low','medium','high')),
  last_evaluated_at   timestamptz null,
  updated_by          uuid null references users(id),
  updated_at          timestamptz not null default now()
);
```

### 2.3 Evidence history (optional but recommended)

```sql
create table if not exists agent_capability_evidence (
  id                  uuid primary key default gen_random_uuid(),
  agent_id            uuid not null references agents(id) on delete cascade,
  project_id          uuid null references projects(id) on delete set null,
  task_id             uuid null references tasks(id) on delete set null,
  check_type          text not null,
  result              text not null check (result in ('pass','fail')),
  notes               text,
  recorded_at         timestamptz not null default now(),
  recorded_by         uuid null references users(id)
);
create index if not exists idx_agent_capability_evidence_agent_time
  on agent_capability_evidence(agent_id, recorded_at desc);
```

---

## 3) Read Path for `/projects/:id/team`

For each team row, enrich with:
1. `agent_role` from `project_agent_roles` by `(project_id, agent_id)`
   - fallback default: `worker`
2. `agent_level`, `level_confidence`, `last_evaluated_at` from `agent_capability_levels` by `agent_id`
   - fallback default: level `0`, confidence `low`, timestamp `null`

---

## 4) Write Path / Maintenance

### 4.1 Role updates
- On attach-agent flow: assign default `agent_role='worker'` unless explicitly set.
- Coordinator assignment endpoint should upsert `project_agent_roles`.

### 4.2 Level updates
- After validated task/inbox milestones, coordinator service updates `agent_capability_levels`.
- Append evidence row to `agent_capability_evidence` for auditability.

---

## 5) Backward Compatibility

- Existing clients should continue working (new fields are additive).
- If role/level rows are missing, API returns safe defaults.

---

## 6) Initial Migration/Backfill Plan

1. Create three tables above.
2. Backfill `project_agent_roles` from current known coordination policy:
   - one coordinator per project where defined; others default worker.
3. Backfill `agent_capability_levels`:
   - `0` for all agents
   - set `1` for agents with recent successful ping (`ping_status='ok'`).
4. Release API enrichment.

### Implementation Note (2026-03-04)
- Migration 040 creates the tables and index only; no backfill is included. Defaults are applied at read time, and `project_agent_roles` is upserted on team add.

---

## 7) Acceptance Criteria

- `GET /projects/:id/team` returns `agent_role` and `agent_level` for every agent.
- Missing data never breaks response (defaults applied).
- Coordinator can persist role/level changes without manual spec edits.
- Evidence trail exists for level promotions/regressions.
