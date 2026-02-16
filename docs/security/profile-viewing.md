# Security review: viewing agent profiles in Darshan UI

## Goal
Allow operators to view each agent’s profile from the dashboard (e.g., `USER.md`, `IDENTITY.md`, `MEMORY.md`) **without leaking secrets/PII** and with strong auditability.

## 1) Key risks
1. **Secret leakage**
   - API keys, tokens, passwords, private URLs, internal hostnames.
   - “Accidental secrets” copied into MEMORY/notes.

2. **Sensitive personal data (PII)**
   - Names, phone numbers, addresses, calendars, private context.
   - Medical/financial details.

3. **Prompt / proprietary data leakage**
   - Internal prompts, tool outputs, logs that reveal system behavior.
   - Customer/client data if agents handled it.

4. **Cross-tenant / cross-user exposure**
   - If Darshan ever supports multiple operators, profiles must not be visible across tenants.

5. **Exfiltration via UI**
   - Copy/paste, screenshots, export endpoints, caching.

## 2) What to show vs redact (recommended)
### Recommended UI model: “Profile = structured, curated summary”
Instead of rendering raw markdown files by default, expose a **safe structured profile**:
- Display name
- Role(s)
- Capabilities/tools (high-level)
- Short bio
- Last updated timestamps
- Operational notes (non-sensitive)

### Raw file access
If raw markdown is needed:
- **Default OFF**; enable only for Admins.
- Provide **redaction layer** before display:
  - Pattern-based redaction for common secrets (API keys, bearer tokens, PEM blocks).
  - Optional allowlist mode (show only specific sections like “Bio”, “Role”, “Operating rules”).

### Suggested redaction rules (minimum)
- Mask anything matching:
  - `sk-...`, `AIza...`, `gsk_...`, `xoxb-...`, `Bearer ...`, `-----BEGIN .* KEY-----`
  - URLs containing credentials
  - 16+ char high-entropy strings (heuristic) → review

## 3) Access control / RBAC
Introduce roles:
- **Admin**: can view raw profile files (with redaction), export, manage retention.
- **Operator**: can view structured profile + limited notes; no exports.
- **Viewer**: can see only roster + non-sensitive summary.

Controls:
- Require auth (session-based) and enforce authorization server-side.
- Consider **per-agent access** (some agents may hold more sensitive info).

## 4) Audit logging (mandatory)
Log every access:
- Who viewed (user id)
- What was viewed (agent id, structured vs raw, which file)
- When (timestamp)
- Source (IP, user-agent)

Store audit as append-only (fits existing `audit_log`).
Action examples:
- `profile.view.summary`
- `profile.view.raw`

## 5) Retention & minimization
- Keep profiles **as small as possible**; prefer linking to detailed logs elsewhere.
- Retain audit logs per security policy (e.g., 30–90 days) with admin-only access.
- Provide a “purge/redact” workflow for accidental secrets.

## 6) Implementation recommendations
- **Server-side fetch + sanitize**: UI should not directly read filesystem.
- Create API endpoints:
  - `GET /api/v1/agents/:id/profile-summary`
  - `GET /api/v1/agents/:id/profile-raw?file=USER|IDENTITY|MEMORY` (Admin only, redacted)
- **No caching** on responses: `Cache-Control: no-store`.
- Consider **content-security policy** and safe markdown rendering (no raw HTML).
- Encrypt at rest (Postgres disk encryption / EBS encryption) if storing snapshots.

## Recommendation (practical)
- Ship **structured profile summary** first (safe-by-default).
- Add raw profile viewer later behind **Admin RBAC + redaction + audit logging**.
