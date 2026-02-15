# Security (Darshan)

This document defines **v1 security expectations** for Darshan (human↔agent + agent↔agent dashboard). Keep it **boring, explicit, and auditable**.

## Scope / Assets
**Core assets**
- Conversation data: threads, messages, attachments (future)
- Agent runs: inputs/outputs, tool/delegation events
- Connector credentials/tokens (Darshan → Clawdbot or other agents)
- Audit log (append-only)
- Admin policy: RBAC + A2A route policies

**Trust boundaries**
- Browser (untrusted) ↔ API
- API ↔ Postgres/Redis
- API ↔ Agent Connector(s) (out-of-process preferred)
- Agent ↔ External tools/services (untrusted)

## Threat model (practical)
| Threat | Example | Impact | Primary mitigations |
|---|---|---|---|
| Unauthorized access | Stolen token, weak auth | Data breach, agent misuse | Strong auth, short-lived tokens, RBAC + thread ACL, CSRF protection where relevant |
| Privilege escalation | User hits admin endpoints | Policy bypass | Centralized authz middleware, deny-by-default, tested route guards |
| Data exfiltration via agents | Agent forwards sensitive thread context | Leakage | Server-side context filtering, allowlist tools/connectors, output limits, redaction hooks |
| Prompt/tool injection | User content triggers tool misuse | External damage | Tool gating by policy, human-approval for risky actions, sandbox connectors, audit everything |
| A2A runaway loops | Agent delegates back-and-forth | Cost/DoS | Depth limits, per-thread/per-actor rate limits, dedupe, loop detection |
| Connector compromise | Connector token leaked | Full agent control | Secrets isolation, per-connector creds, least privilege, rotation |
| Replay / tampering | Forged WS events or callbacks | Integrity loss | Signed callbacks, request IDs + nonce, idempotency keys |
| Availability attacks | Flood messages/runs | Outage | Rate limits, queues, timeouts, circuit breakers |

## Roles, RBAC, and thread ACL
### Roles (v1)
- **admin**: manage agents/connectors, configure A2A policies, view all audit/threads
- **user**: create/read/write own & shared threads, start runs, broadcast (within policy)
- **viewer** (optional): read-only access to permitted threads

### RBAC matrix (minimum)
| Capability | admin | user | viewer |
|---|:---:|:---:|:---:|
| Read permitted threads/messages | ✅ | ✅ | ✅ |
| Create thread / send message | ✅ | ✅ | ❌ |
| Start/cancel run | ✅ | ✅ | ❌ |
| Broadcast to many agents | ✅ | ✅* | ❌ |
| Configure agents/connectors | ✅ | ❌ | ❌ |
| Configure A2A route policy | ✅ | ❌ | ❌ |
| View audit log (all) | ✅ | ❌** | ❌ |

\* Broadcast may be restricted by org policy (max recipients, require approval).

\** Users may view audit events scoped to threads they can access.

### Thread ACL (required)
- Thread has explicit visibility: `private` (owner only) or `shared` (named users/roles).
- API must enforce **read ACL** and **write ACL** (not just UI).
- Agents receive **only thread-scoped context** and only the server-selected subset (e.g., last K messages).

## Audit logging (append-only)
Audit logs are **security controls** (not debug logs). Store in Postgres as an append-only table.

### Required audit events
Record at minimum:
- Auth: `auth.login`, `auth.logout`, `auth.failed`
- Threads: `thread.create`, `thread.archive`, `thread.share.update`
- Messages: `message.create` (including broadcast recipient list/hash)
- Runs: `run.create`, `run.start`, `run.output.chunk` (optional), `run.finish`, `run.fail`, `run.cancel`
- A2A: `a2a.delegate.request`, `a2a.delegate.allowed|blocked|needs_approval`, `a2a.route.create|update|delete`
- Connector: `connector.invoke`, `connector.timeout`, `connector.error`
- Admin: `rbac.role.grant|revoke`, `config.change`

### Audit event fields (recommendation)
- `actor_type` (human|agent|system), `actor_id`
- `action`, `resource_type`, `resource_id`
- `thread_id`, `run_id` (when relevant)
- `metadata` JSON (targets, reason, policy decision)
- `ts` (server time)

## Connector isolation (Darshan → agents)
Treat connectors as **high-risk** because they can act on behalf of humans/agents.

Minimum requirements:
- **No connector secrets in the browser** (ever).
- Prefer connector execution **out-of-process** (separate service/container) with:
  - dedicated service account
  - restricted network egress (only to required endpoints)
  - per-connector credentials (no shared “god token”)
- Enforce **timeouts** (connect + total), **max output size**, and **max tool/event count** per run.
- Validate and normalize connector callbacks/events (schema validation).
- Use idempotency keys for run invocation; connectors must be safe to retry.

## A2A safety: loop prevention + rate limits
A2A delegation is powerful and must be constrained.

### Hard limits (defaults)
- **Delegation depth**: max 2 hops (A→B→C). Reject beyond.
- **Run TTL**: max wall-clock duration (e.g., 5–15 min) unless admin overrides.
- **Output cap**: max chars/tokens persisted per run/message.
- **Per-thread rate limit**: messages/runs per minute.
- **Per-actor rate limit**: prevent a single user/agent from flooding.

### Loop prevention
- Attach a `trace_id` and `delegation_path` to each run.
- Reject if the next hop agent already exists in the path (cycle).
- Deduplicate identical delegation requests within a short window.
- Require explicit policy in `a2a_routes` for every (from_agent → to_agent) pair; default is **blocked**.

## Secure defaults (ship these first)
- **Deny-by-default authorization**: if no rule matches, block.
- **A2A default = blocked** until explicitly allowed.
- **Broadcast defaults**: small recipient cap; no agent-triggered broadcast.
- **CORS**: restrict to known origins in production (no `origin: true`).
- **Secrets**: load from env/secret manager; never log; support rotation.
- **Transport**: TLS in production; secure cookies if using cookies.
- **Validation**: schema-validate all inputs (REST + WS) and all connector events.
- **Logging**: structured logs with redaction of tokens and PII.
- **Dependencies**: pin versions; run `pnpm audit` in CI.

## Reporting vulnerabilities
- Internal: open an issue labeled `security` with reproduction steps and impact.
- If a secret is exposed: rotate immediately and add an audit entry + incident note.
