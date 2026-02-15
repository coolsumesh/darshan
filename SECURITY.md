# SECURITY.md — Darshan (MVP)

This document defines **minimum security requirements** for Darshan’s MVP:
- **Dashboard (UI)**: human-facing web app
- **Orchestrator/API**: authn/authz, thread storage, run lifecycle, policy engine
- **Connectors**: integrations that invoke agents/tools (out-of-process preferred)

Design goal: **deny by default**, enforce policy server-side, and leave an **audit trail** for all security-relevant actions.

---

## 1) Threat model (MVP)

### Assets to protect
1. **Conversation data**: threads, messages, attachments (now/future), metadata
2. **Run data**: prompts/inputs, tool invocations, agent outputs, routing decisions
3. **Secrets**: connector tokens, API keys, service credentials, signing keys
4. **Authorization policy**: RBAC, thread ACLs, A2A route allowlists
5. **Audit log**: append-only record used for investigations and compliance
6. **Availability**: orchestrator health, queue stability, connector reliability

### Actors
- **Admin**: configures org-wide settings, connectors, and A2A routes
- **Operator**: uses the system to run agents; manages own/shared threads
- **Viewer**: read-only access to permitted threads
- **Agent identity** (non-human): connector/service account performing runs
- **External services**: third-party APIs/tools called by connectors/agents
- **Attacker**: internet user, compromised user account, malicious insider, compromised connector host

### Trust boundaries & data flows
1. **Browser (untrusted)** → **Orchestrator/API**
2. **Orchestrator/API** → **Datastores** (Postgres/Redis/queues)
3. **Orchestrator/API** → **Connector service** (agent/tool invocation)
4. **Connector** → **External tools/services** (untrusted)
5. **Connector** → **Orchestrator/API callbacks/stream**

Security posture assumption: **the browser and external services are untrusted**. All authorization decisions must be made by the orchestrator.

### Key threats and mitigations (MVP)
| Threat | Example | Impact | MVP mitigations (required) |
|---|---|---|---|
| Unauthorized access | stolen session/JWT, weak password, token in localStorage | breach of threads/runs/secrets | OIDC/OAuth (preferred), short-lived access tokens, refresh token hygiene, secure cookies (if used), MFA for admins, rate-limit auth endpoints |
| Privilege escalation | operator hitting admin endpoints | policy bypass, connector takeover | centralized authz middleware; **deny-by-default**; tested route guards; no client-side-only checks |
| Broken thread isolation | guessing thread IDs, missing ACL on list/search | data leakage | thread ACL enforced on every read/write; use opaque IDs; filter queries by ACL; no “admin by query param” |
| CSRF / session fixation (if cookies) | cross-site POST causes run start | unintended actions | SameSite cookies, CSRF tokens for state-changing requests, origin checks |
| XSS | message content renders HTML | token theft, actions as user | output encoding; sanitize markdown; strict CSP; no secrets in browser storage |
| Prompt/tool injection | user message instructs agent to exfiltrate data or call tools | external damage/data leakage | tool gating by policy; human approval for risky actions; contextual minimization; output filtering/redaction; audit all tool calls |
| Connector compromise | connector host is breached | mass misuse, secret exfiltration | out-of-process connectors; least-privileged creds; network egress allowlist; no DB access from connectors; rotate secrets |
| Callback forgery / replay | attacker posts fake connector events | integrity loss, false audit, run corruption | mTLS or signed callbacks (HMAC/JWT) + nonce/timestamp; idempotency keys; schema validation; strict allowlist of connector origins |
| A2A runaway loops / DoS | agents delegate recursively | cost blow-up, outage | hop limits, TTL, per-thread/per-actor quotas, dedupe, cycle detection, queue backpressure |
| Sensitive data leakage in logs | tokens/PII in debug output | secret exposure | structured logging with redaction; separate audit vs debug; no request body logging by default |

---

## 2) RBAC roles & permissions matrix (admin/operator/viewer) + thread ACLs

### Definitions
- **RBAC** answers *“what kinds of operations can you do in the system?”*
- **Thread ACL** answers *“which threads are you allowed to access?”*

Both must be enforced **server-side**.

### Roles (MVP)
- **admin**: platform configuration, connectors, org policy, view all audit & threads
- **operator**: day-to-day usage; create/read/write permitted threads; start/cancel runs
- **viewer**: read-only access to permitted threads; no runs

### Thread ACL model (MVP)
Each thread has:
- **Owner**: a user (or service account)
- **Visibility**: `private` or `shared`
- **ACL entries**: explicit grants to users (and optionally groups in future)
- **Permissions** per ACL entry: `read`, `write`, `share`

Rules:
- `write` implies `read`
- `share` implies `read` (and allows editing ACL)
- Admin may bypass thread ACL for incident response, but **must be audited**

### Permissions matrix
| Capability | admin | operator | viewer |
|---|:---:|:---:|:---:|
| Sign in / view dashboard | ✅ | ✅ | ✅ |
| Create thread | ✅ | ✅ | ❌ |
| Read thread (if ACL allows) | ✅* | ✅ | ✅ |
| Write thread (send message) (if ACL allows) | ✅* | ✅ | ❌ |
| Share thread / edit ACL (if `share` on thread) | ✅ | ✅** | ❌ |
| Start run (if `write` on thread) | ✅ | ✅ | ❌ |
| Cancel run (own thread / permitted thread) | ✅ | ✅ | ❌ |
| View run outputs (if thread readable) | ✅* | ✅ | ✅ |
| Manage connectors (create/update/delete, tokens) | ✅ | ❌ | ❌ |
| Manage A2A route policy | ✅ | ❌ | ❌ |
| Manage users/roles | ✅ | ❌ | ❌ |
| View audit log (global) | ✅ | ❌*** | ❌ |
| View audit log (scoped to accessible threads) | ✅ | ✅ | ✅ (optional read-only) |

\* Admin can access all threads for support/IR; every such access must generate an **audit event**.

\** Operators may share threads only if they hold `share` permission on that thread.

\*** Operators may view audit events only for resources they can access (thread-scoped).

---

## 3) Audit log requirements (append-only)

Audit logs are **security records**, not debug logs.

### Storage and integrity requirements
- Store audit events in an **append-only** table/stream (no updates/deletes).
- Each event must have a **monotonic server timestamp** and unique ID.
- Recommended: add **tamper-evidence** via hash chaining:
  - `event_hash = H(event_payload + previous_event_hash)` per tenant or per day partition.
- Restrict write access: only orchestrator service account may append.
- Retention: define MVP default (e.g., **90 days**) and make it configurable.

### Minimum event schema
- `event_id`, `ts`
- `tenant_id` (if multi-tenant) or `org_id`
- `actor_type`: `human | agent | system`
- `actor_id`, and if human: `ip`, `user_agent` (or hashed UA)
- `action` (string)
- `resource_type`, `resource_id`
- `thread_id`, `run_id` (nullable)
- `decision`: `allow | block | error` (where relevant)
- `reason` / `policy_id` (where relevant)
- `metadata` JSON (redacted; no secrets)

### Required events to record (MVP)
**Authentication & identity**
- `auth.login.success`, `auth.login.failed`, `auth.logout`
- `auth.mfa.enrolled|removed` (if applicable)
- `session.refresh`, `token.revoked`

**RBAC & admin policy**
- `rbac.role.grant`, `rbac.role.revoke`
- `config.change` (include diff summary; never include secrets)

**Threads & access control**
- `thread.create`, `thread.archive|delete` (if delete exists)
- `thread.acl.grant|revoke|update`
- `thread.access.admin_override` (admin reads a thread they don’t own)

**Messages & content**
- `message.create` (store message id; do not store full content in audit log)
- `message.redaction` (if implemented)

**Runs / orchestration**
- `run.create`, `run.start`, `run.cancel`, `run.finish`, `run.fail`
- `run.policy.blocked` (include rule id / reason)

**A2A routing**
- `a2a.delegate.request`
- `a2a.delegate.allowed`, `a2a.delegate.blocked`, `a2a.delegate.rate_limited`
- `a2a.route.create|update|delete`

**Connectors**
- `connector.register|update|delete`
- `connector.invoke.start`, `connector.invoke.finish`, `connector.invoke.fail`, `connector.invoke.timeout`
- `connector.callback.rejected` (signature invalid / schema invalid / replay)

---

## 4) Agent connector isolation rules (what the UI must never see)

**Non-negotiable UI restrictions** (must never be sent to the browser, even for admins):
1. **Connector secrets**: API keys, OAuth refresh tokens, private keys, signing keys
2. **Raw connector request/response headers** that may contain credentials
3. **Service-to-service credentials** (DB passwords, redis creds, queue creds)
4. **Unredacted tool outputs** that include secrets/PII if not explicitly allowed by policy
5. **Network topology / internal hostnames** that aid lateral movement (where avoidable)

### Isolation requirements
- Connectors run under a **separate identity** from the dashboard user.
- The dashboard only receives:
  - run status
  - redacted/approved outputs
  - high-level error messages (no stack traces, no tokens)
- Orchestrator must implement **output redaction** hooks:
  - token patterns (Authorization headers, JWTs, API keys)
  - known secret sources (connector config fields)
- Connector configuration endpoints must return **metadata only**:
  - name, type, enabled/disabled, last healthcheck, scopes (non-secret)

### Connector execution constraints
- Prefer out-of-process connector service/container.
- No direct access from connectors to the primary DB.
- Strict timeouts and quotas:
  - connect timeout, request timeout, total run TTL
  - max response size
  - max tool calls per run
- Network egress allowlist per connector; deny all by default.

---

## 5) A2A loop-prevention + rate limit guidance

A2A (agent-to-agent) delegation is high leverage and high risk.

### Required identifiers for every run/delegation
- `trace_id`: stable across the entire run tree
- `span_id`: per hop
- `delegation_path`: ordered list of agent IDs invoked so far
- `idempotency_key`: for connector and delegation requests

### Loop prevention rules (MVP defaults)
1. **Cycle detection**: reject delegation if target agent already exists in `delegation_path`.
2. **Hop limit**: max delegation depth default **2** (A→B→C). Admin-configurable.
3. **Dedupe window**: drop identical (from,to,thread,normalized_input) delegations within **N seconds** (e.g., 30–60s).
4. **Per-thread concurrency cap**: limit concurrent runs (e.g., 2–5) to prevent storms.
5. **Default route policy = BLOCK**: every (from_agent → to_agent) must be explicitly allowlisted.

### Rate limit guidance (starting point)
Implement rate limiting at multiple layers (all configurable):
- **Per-IP**: login attempts, session creation
- **Per-user**: messages/minute, runs/minute
- **Per-thread**: runs/minute and concurrent runs
- **Per-agent/connector**: invocations/minute and concurrent invocations

When rate-limited:
- return a clear error in UI
- emit `*.rate_limited` audit events
- prefer queued backoff over hard failure for connector retries

---

## 6) Secure defaults checklist for deployment

### Secrets management
- [ ] Secrets are provided via environment or secret manager (not in git, not in UI).
- [ ] Secrets are **not logged** (request/response bodies disabled by default).
- [ ] Rotation supported for connector creds and signing keys.
- [ ] Separate secrets per environment (dev/stage/prod) and per connector.

### Transport security
- [ ] **TLS required** for all external traffic (HTTPS).
- [ ] HSTS enabled in production.
- [ ] Secure cookies if using cookies (`Secure`, `HttpOnly`, `SameSite=Lax/Strict`).
- [ ] **mTLS (optional but recommended)** between orchestrator ↔ connectors, especially across hosts.
- [ ] If not using mTLS: signed callbacks + allowlisted connector origins.

### Authentication & authorization
- [ ] Prefer OIDC/OAuth SSO; enforce MFA for admins.
- [ ] Deny-by-default authorization middleware.
- [ ] Thread ACL checks on every endpoint (read/write/share/list/search).
- [ ] Admin override access requires explicit action + audit.

### Input/output handling
- [ ] Strict schema validation for REST/WS and connector callbacks.
- [ ] Output encoding/sanitization for user-generated content; CSP enabled.
- [ ] Redaction for secrets in outputs and logs.

### Logging hygiene
- [ ] Separate **audit log** (append-only, minimal content) from debug logs.
- [ ] No tokens, secrets, or raw Authorization headers in logs.
- [ ] Restrict log access; treat logs as sensitive data.

### Operational hardening
- [ ] Least-privileged service accounts; connectors cannot access DB.
- [ ] Network policies: deny-all egress by default, allowlist required destinations.
- [ ] Resource limits: timeouts, memory/CPU quotas, queue backpressure.
- [ ] Dependency pinning + automated vulnerability scanning in CI.

---

## Stop-ship (must fix before production exposure)
- Any path where **connector secrets** or **service credentials** can reach the browser.
- Missing server-side enforcement of **thread ACL** on list/read/write endpoints.
- A2A delegation enabled without **default-block allowlists**, hop limits, and rate limits.
- Unsigned/unauthenticated connector callbacks (replay/forgery possible).
- Debug logging that includes request bodies/headers in production.
