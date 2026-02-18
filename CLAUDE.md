# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

**Root (run from repo root):**
```bash
pnpm dev          # Start web (port 3000) + api (port 4000) in parallel
pnpm build        # Build all workspaces
pnpm typecheck    # Type-check all workspaces
pnpm db:up        # Start Postgres + Redis via Docker Compose
pnpm db:down      # Stop containers
pnpm db:reset     # Delete volumes and restart containers
```

**Per-workspace (from `apps/web` or `apps/api`):**
```bash
pnpm dev          # Start that workspace in watch mode
pnpm build        # Build that workspace
pnpm typecheck    # tsc --noEmit for that workspace
```

**API-only:**
```bash
pnpm --filter @darshan/api seed   # Seed agents + default thread (idempotent)
```

**Prerequisites:** Docker must be running before `pnpm dev`; copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.

## Architecture

Darshan is an agent orchestration dashboard for MithranLabs — it lets operators chat with AI agents, broadcast to multiple agents, observe agent-to-agent delegations, and triage issues.

**Monorepo layout:**
```
apps/web/     Next.js 16 (App Router) frontend on port 3000
apps/api/     Fastify 5 backend on port 4000
packages/shared/  Shared TypeScript types
```

### Frontend (`apps/web`)

The UI uses a **three-pane layout** (left nav/triage, center thread view, right inspector) implemented in `app-shell.tsx`. All pages live under the `(proto)` route group, which wraps them in `ProtoLayout` → `AppShell`.

UI preferences (theme, font size, sidebar state, accent color, density) are persisted to `localStorage` under the key `darshan-ui-prefs`. The root layout inlines a script to apply them before first paint to prevent flash. Preference changes dispatch a `darshan:prefs` custom event that `AppShell` listens to.

The frontend is currently **prototype-only**: pages use mock data (a static `AGENTS` array, hardcoded threads) and are not yet connected to the backend API.

### Backend (`apps/api`)

- `src/index.ts` — Fastify server entry point; registers CORS + WebSocket plugin, all routes, runs migrations, starts stub connector
- `src/db.ts` — PostgreSQL connection pool (requires `DATABASE_URL`)
- `src/migrations.ts` — File-based migration runner; scans `migrations/*.sql` in filename order; wraps each in a transaction
- `src/audit.ts` — `appendAuditEvent()` for the append-only audit trail; `recordLlmFallbackEvent()` for LLM provider failures
- `src/broadcast.ts` — In-process WebSocket broadcaster; `addConnection(ws)` / `broadcast(type, data)`
- `src/connector.ts` — Stub connector; `startConnector(db)` polls every 2s for queued runs and produces canned agent replies; `processQueued(db)` can also be called directly
- `src/llm/withFallback.ts` — LLM provider fallback wrapper
- `scripts/seed.ts` — Idempotent seed script; upserts agents (Mira, Nia, Kaito, Anya), default "General" thread, A2A routes

**Migrations** (in `migrations/`):
- `001_audit_log.sql` — pgcrypto extension, schema_migrations table, audit_log table
- `002_core_tables.sql` — agents, threads, thread_participants, messages, runs, a2a_routes + all indexes

**Implemented REST endpoints** (`/api/v1`):
- `GET /agents`, `GET /agents/:id`
- `GET /threads`, `POST /threads`, `GET /threads/:id`, `POST /threads/:id/archive`
- `GET /threads/:id/messages?limit&beforeSeq`, `POST /threads/:id/messages`
- `GET /threads/:id/runs`, `GET /runs/:id`, `POST /runs/:id/cancel`
- `GET /a2a/routes`, `POST /a2a/routes`
- `GET /audit`
- `GET /api/v1/ops/rate-limits`

**WebSocket:** `GET /ws` — emits `connected`, `message.created`, `run.created`, `run.updated` events.

The `POST /threads/:id/messages` body accepts `{ content, targets?: { agentIds?: string[] }, mode?: "direct"|"broadcast" }`. User identity comes from the `x-user-id` request header (defaults to `"sumesh"`).

### Data model (see `DB.md` for full schema)

Key tables: `agents`, `threads`, `thread_participants`, `messages`, `runs` (agent invocations with status queued→running→done), `a2a_routes` (delegation policies), `audit_log`.

### Security model (see `SECURITY.md`)

RBAC with three roles: `admin`, `operator`, `viewer`. Thread-level ACL. All security-sensitive actions must call `appendAuditEvent()`. A2A delegation requires policy lookup in `a2a_routes` and audit logging of the decision.

## Key reference docs

- `ARCHITECTURE.md` — Phase-by-phase system design, API specs, WebSocket events
- `DESIGN.md` — UX specification, 3-pane layout interaction flows, MVP scope
- `DB.md` — PostgreSQL schema, indexes, retention policy, migration guidance
- `SECURITY.md` — Threat model, RBAC matrix, permissions table
- `TODO.md` — Phase-by-phase checklist of what is done vs. pending
