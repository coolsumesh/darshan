# Darshan Agent Secrets Spec

## Purpose
Provide secure secret distribution for agents (e.g., API tokens) without exposing raw credentials in tasks, chat, logs, or completion notes.

---

## Core Rules
1. Never place raw secrets in task descriptions, chat messages, comments, or completion summaries.
2. Use secret references (`secret_ref`) in coordination artifacts.
3. Agents retrieve secrets at runtime through authenticated Darshan APIs.
4. All secret access must be auditable without logging secret values.

---

## Secret Model

### Scope Policy (Darshan decision)
- Secrets are **project-specific by default and by policy**.
- Secret creation must require `project_id`.
- Cross-project secret reuse is not allowed unless explicitly duplicated by an authorized owner/admin.

### Secret Record
- `id`
- `project_id` (required)
- `scope_type` (`project` | `agent`)
- `scope_id`
- `name` (human label)
- `secret_ref` (unique lookup key)
- `ciphertext` (encrypted at rest)
- `created_by`
- `rotated_at`
- `expires_at` (optional)
- `status` (`active` | `revoked`)

### Access Policy
- Project-scoped secret: only authorized project actors/agents.
- Agent-scoped secret: only that agent (and authorized owners/admins).
- Owner/admin controls create, rotate, revoke.

---

## Secure Handoff Pattern
1. Human owner stores secret in Darshan vault.
2. Coordinator/task references only `secret_ref`.
3. Target agent fetches secret via authenticated endpoint.
4. Agent uses it in-memory/runtime; do not echo back.
5. Rotate/revoke after completion if needed.

---

## API (MVP Proposal)
- `POST /api/v1/secrets` (create)
- `POST /api/v1/secrets/:id/rotate`
- `POST /api/v1/secrets/:id/revoke`
- `GET /api/v1/secrets/:ref/resolve` (agent runtime resolve)
- `GET /api/v1/secrets/audit` (metadata only)

---

## Logging and Audit
Log metadata only:
- actor
- action (`create`/`resolve`/`rotate`/`revoke`)
- secret id/ref
- scope
- timestamp

Never log:
- plaintext secret
- decrypted payload

---

## UX Requirements
- Secret values masked by default.
- One-click rotate/revoke.
- Copy only `secret_ref` (not value).
- Warnings on attempts to paste secrets into task/chat text.

---

## Security Requirements
- Encryption at rest for secret payloads.
- Strict access checks by role + scope.
- Optional TTL for temporary credentials.
- Rate limit secret resolve endpoint.
- Immediate revoke support.
