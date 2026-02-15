# Attendance Monitoring (MVP)

This document captures requirements and design notes for an **attendance monitoring** feature (tracking whether an agent/user/device is “present”, “active”, or “checked in” over time).

> Scope note: attendance is security-sensitive because it can be used for compliance, payroll-like decisions, or incident response. Treat it as **evidence** that must be verifiable, auditable, and minimally invasive.

---

## 1) Concepts & terminology

- **Subject**: the entity whose attendance is being recorded (human user, agent identity, or managed device).
- **Check-in session**: a bounded interval (start → stop) representing a presence window.
- **Heartbeat**: periodic signal within a check-in session used to keep it “alive”.
- **Verifier**: server-side logic that validates heartbeats and closes sessions.

---

## 2) Data model (suggested)

- `attendance_session`
  - `session_id` (opaque)
  - `subject_type` (`human|agent|device`) + `subject_id`
  - `started_at`, `ended_at` (server timestamps)
  - `status` (`open|closed|invalidated`)
  - `started_by_actor_id` (who initiated)
  - `policy_id` / `version` (policy snapshot)
  - `metadata` (redacted; no secrets)

- `attendance_heartbeat`
  - `heartbeat_id`
  - `session_id`
  - `received_at` (server time)
  - `client_ts` (optional; client time)
  - `seq` (monotonic per session)
  - `result` (`accepted|rejected`)
  - `reject_reason` (nullable)
  - `ip_hash`, `ua_hash` (privacy-preserving; optional)
  - `signature_key_id` (for verification / rotation)

---

## 3) Security & privacy (stop-ship considerations)

### 3.1 Threats (what can go wrong)

1. **Spoofed attendance**
   - Replay of old heartbeats
   - Fabricated heartbeats from a script/bot
   - A compromised token used from another machine
2. **Tampering & repudiation**
   - Subjects dispute the record (“I wasn’t present”)
   - Admin/operator edits history without trace
3. **Privacy harm**
   - Collecting more telemetry than necessary (exact location, raw IP/UA, screenshots)
   - Over-retention and broad internal access
4. **Abuse / coercion**
   - Using attendance data for surveillance beyond stated purpose

**Security goal:** attendance should be **tamper-evident**, hard to spoof at scale, and produce audit-grade evidence.

**Privacy goal:** collect the **minimum** needed, provide transparency, enforce access controls, and retain for the shortest practical window.

---

### 3.2 Anti-spoofing: signed heartbeats (recommended)

For any attendance record that matters beyond “best-effort UI presence”, implement **signed heartbeats**.

#### Protocol sketch

Each heartbeat payload includes:
- `session_id`
- `subject_id`
- `seq` (monotonic counter starting at 1)
- `issued_at` (client timestamp)
- `expires_at` (optional)
- `nonce` (random)
- `challenge` (optional server-provided value; see below)

**Signature:** `sig = Sign(private_key, SHA-256(canonical_json(payload)))`

Server verification:
- Verify signature with enrolled public key for (`subject_id`, `key_id`).
- Enforce **monotonic seq** (reject duplicates/out-of-order beyond a small window).
- Enforce **freshness** (server `received_at` within allowed skew; e.g., ±2–5 minutes).
- Enforce **replay protection**:
  - store last `seq` per session, and optionally seen `nonce` for a short TTL.
- Enforce **session binding** (heartbeat must reference an active `session_id` for that subject).

#### Server challenge-response (stronger)

To reduce offline replay and “generate heartbeats later”, add a lightweight server challenge:
- On session start, server returns `session_secret` **or** per-heartbeat `challenge`.
- Each heartbeat includes the latest challenge, or client fetches a new challenge periodically.

This creates a liveness link to the server and makes it harder to precompute a valid stream.

#### Key enrollment / device binding

- Prefer per-device keys (so a stolen key only spoofs one device).
- Store `key_id`, `created_at`, `revoked_at`, `rotated_from`.
- Rotation plan: allow multiple active keys with overlap; audit all changes.

#### Implementation options

- **WebAuthn (preferred for humans)**: use passkeys / platform authenticators for strong, phishing-resistant signatures.
- **Ed25519 keypair (good default for agents/devices)**: lightweight and fast; keys stored in OS keychain/TPM when available.

> Note: JWT/HMAC with bearer secrets is weaker if the secret can be copied. Public-key signatures are easier to bind to hardware-backed stores.

---

### 3.3 Evidence quality vs UX (choose explicitly)

Not all “attendance” needs audit-grade guarantees.

Define tiers:
1. **UI presence (best-effort)**: browser websocket pings; not suitable for compliance.
2. **Soft attendance**: signed heartbeats but minimal challenge enforcement.
3. **Hard attendance**: signed heartbeats + server challenges + stricter anomaly detection + explicit session start/stop.

Make the tier visible in UI and exports (avoid misinterpretation).

---

### 3.4 Privacy minimization requirements

- Do **not** store raw IP address / full user agent in attendance tables by default.
  - If needed for abuse detection, store **salted hashes** or coarse buckets.
- Avoid precise location unless explicitly required; if required:
  - store coarse geolocation (e.g., city-level) or “site_id” from a known network.
- Do not capture screenshots, camera, or microphone for attendance in MVP.
- Document purpose + retention:
  - default retention suggestion: **30–90 days** depending on business needs.
- Access controls:
  - restrict attendance exports to authorized roles; log all exports.

---

### 3.5 Anomaly detection (anti-spoofing signals)

Emit warnings and/or invalidate sessions on:
- sudden IP/ASN changes within a session (using hashed/bucketed signals)
- impossible frequency (heartbeats too fast) or long gaps (stale sessions)
- repeated signature failures / unknown key usage
- repeated seq resets or duplicate nonces
- concurrent sessions for the same subject when policy disallows

These should create **Needs Attention** items in Darshan and audit events (see below).

---

### 3.6 Audit events (minimum set)

Audit logs should not store heartbeat payloads verbatim; store identifiers and verification outcomes.

**Session lifecycle**
- `attendance.session.create` (subject, tier, policy_id)
- `attendance.session.start` (actor, subject, session_id)
- `attendance.session.stop` (actor, subject, reason: user_stop|timeout|admin_stop|policy)
- `attendance.session.invalidate` (actor/system, reason: spoof_suspected|key_revoked|policy_violation)

**Heartbeats**
- `attendance.heartbeat.accepted` (session_id, seq, key_id)
- `attendance.heartbeat.rejected` (session_id, seq, key_id, reason: bad_sig|replay|stale|unknown_key|session_closed)
- `attendance.challenge.issued` (session_id, challenge_id)
- `attendance.challenge.rejected` (session_id, reason)

**Key management**
- `attendance.key.enroll` (subject, key_id, method: webauthn|ed25519)
- `attendance.key.revoke` (subject, key_id, reason)
- `attendance.key.rotate` (subject, from_key_id, to_key_id)

**Policy & exports**
- `attendance.policy.update` (who, diff summary)
- `attendance.export.request` (who, scope, format)
- `attendance.export.completed` (rows, duration_ms)
- `attendance.export.denied` (who, reason)

**Administrative overrides**
- `attendance.override.create|update|delete` (manual adjustments, with justification)

All of the above should include: `actor_type`, `actor_id`, `ip`/`ua` (if available, ideally hashed), `decision` (`allow|block|error`), and `reason`.

---

### 3.7 Storage integrity

Attendance data is frequently disputed. Ensure:
- server timestamps are authoritative (`received_at`, `started_at`, `ended_at`)
- audit events are append-only and preferably **hash-chained** (see `SECURITY.md`)
- any manual correction creates a new record + audit event; never silently edit history

---

### 3.8 Operational safeguards

- Rate limit heartbeats per session/subject to prevent DoS (e.g., 1 per 15–60s).
- Define TTL closure rules: if no accepted heartbeat for N minutes, auto-close session.
- Provide incident tooling: list rejected heartbeats, key history, and anomaly timeline.

---

## 4) Open questions

1. Is attendance for **humans**, **agents**, or **managed devices** (or all three)?
2. What evidence tier is required (UI presence vs hard attendance)?
3. Is location required, and if so, what granularity is acceptable?
4. Who can export attendance, and what is the retention policy?
