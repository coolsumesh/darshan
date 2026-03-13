# Darshan Agent Context Contract v1

**Status:** Approved — pending implementation  
**Approved by:** Sanjaya (coordinator), 2026-03-13  
**Authors:** Mithran (draft), Sanjaya (review)

---

## Problem Statement

Agents can participate in multiple threads across multiple projects. Without authoritative context resolution, agents may answer identity/mapping questions (e.g., thread → project) from cached memory or prior context instead of live thread resolution. This produces wrong project IDs, cross-project confusion, and trust erosion.

### Observed Failure Mode
- User asks: "What project does this thread belong to?"
- Agent replies from stale memory or global project context.
- Actual thread record maps to a different `project_id`.
- Result: incorrect answer, potential misrouting of actions.

---

## What We Are Solving

A **platform-level, agent-agnostic** context resolution standard so all agents:
1. Derive thread/project identity from authoritative live sources.
2. Use memory only as supporting context (never authority for live IDs).
3. Prevent cross-project actions caused by stale or ambiguous context.
4. Provide verifiable answers for ID-sensitive questions.

---

## Scope

Applies to all Darshan agents handling:
- Direct thread conversations
- Task operations requiring project/thread linkage
- ID-sensitive Q&A (thread/project/task ownership and mapping)

## Non-Goals
- Redesigning Darshan data models
- Replacing agent long-term memory features
- Solving general hallucination beyond identity/context resolution

---

## Core Principles

1. **Thread-first authority:** `thread_id` from inbound metadata is primary context anchor.
2. **Live resolution:** `project_id` must be resolved via live thread API when needed.
3. **Memory is secondary:** memory can enrich responses but cannot override live mapping.
4. **Fail closed on mismatch:** block or warn on context conflicts rather than guessing.
5. **Verifiable responses:** ID answers should be traceable to live lookup.

---

## Context Hierarchy (Normative)

For each inbound turn, resolve context in this order:
1. Trusted inbound metadata (`thread_id`)
2. `GET /threads/:thread_id` → authoritative `project_id`
3. Optional `GET /projects/:project_id` → project name/details
4. Memory/cache for non-authoritative enrichment

If any level conflicts with a higher level, the higher level wins.

---

## Required Runtime Contract

Each agent turn must produce a `resolvedContext` object:

```json
{
  "thread_id": "uuid",
  "project_id": "uuid",
  "subject": "string",
  "participants": ["..."],
  "verified_at": "ISO-8601",
  "source": "threads_api"
}
```

### Contract Rules
- `resolvedContext.thread_id` must match inbound metadata `thread_id`.
- `resolvedContext.project_id` must come from thread lookup, not memory.
- ID-sensitive operations must consume IDs from `resolvedContext`.

---

## Guardrails (Preflight Checks)

Before any action requiring `thread_id`/`project_id`:
1. Validate action IDs against `resolvedContext`.
2. If mismatch:
   - Block action
   - Emit `CONTEXT_MISMATCH`
   - Refresh context from API once
3. If still mismatched after refresh:
   - Return explicit error to user/operator
   - Do not execute side-effecting action

---

## Response Policy for ID Questions

For questions such as "What is this thread ID?", "Which project does this thread belong to?":

1. Verify live context first.
2. Answer with concise value.
3. Optionally include: `"Verified via thread API."`

---

## Caching Policy

To reduce API load while preserving correctness:
- Cache `thread_id -> project_id` short-term (**TTL: 5 minutes** — thread→project mapping is immutable once set).
- Invalidate cache on:
  - Thread switch
  - Context mismatch
  - Explicit user challenge ("show proof", "verify now")
- Never treat cache as higher authority than fresh thread lookup.

---

## Response Policy: Read-Only vs Write Actions (Coordinator Decision)

- **Read actions on lookup failure:** Allow response but tag it explicitly:  
  `"Note: context unverified — thread API unavailable"`
- **Write actions on lookup failure or mismatch:** **Hard block.** Do not execute.

---

## Mismatch Alerts (Coordinator Decision)

- **Read-action mismatches:** Log only. No coordinator alert.
- **Write-action mismatches:** Post alert to coordinator thread + block action.

---

## Error Codes

- `CONTEXT_MISSING_THREAD_ID` — inbound metadata lacks thread id.
- `CONTEXT_RESOLUTION_FAILED` — thread lookup failed.
- `CONTEXT_MISMATCH` — provided IDs conflict with resolved context.
- `CONTEXT_STALE_CACHE` — cached mapping invalidated by live data.

---

## Implementation Plan

The implementation lives in **`darshan-channel-plugin/index.ts`** (shared extension middleware).
The plugin already holds `thread_id` from the notification payload and has HTTP access to the Darshan API.

### Phase 1: Enable resolver + logging (observe mismatches)
1. Add `resolveContext(thread_id, apiBase, token)` utility in the plugin.
2. Inject `resolvedContext` into `BodyForAgent` for each turn.
3. Log mismatches — do not block yet.

### Phase 2: Enable blocking guard for write actions
- Block any tool/action with `project_id` or `thread_id` that doesn't match `resolvedContext`.
- Post mismatch alert to coordinator thread.

### Phase 3: Enable blocking guard for all ID-sensitive actions (reads too)
- Reads return "unverified" tag if lookup fails; still blocked on mismatch.

### Phase 4: Onboarding checklist + CI tests for new agents

---

## Test Plan (Minimum)

1. **Multi-project same participant test** — same user in two projects, verify agent maps thread to correct project each time.
2. **Stale memory conflict test** — seed wrong memory mapping, verify live thread API overrides.
3. **Thread switch in-session test** — consecutive turns from different threads, verify context updates.
4. **Mismatch block test** — force action with wrong `project_id`, verify guard blocks + `CONTEXT_MISMATCH`.
5. **Proof request test** — user asks "show proof", verify fresh lookup + `thread_id + verified_at` in response.

---

## Rollout Strategy

- Phase 1: Enable resolver + logging (observe mismatches) — **assign to Mithran after migration 060**
- Phase 2: Enable blocking guard for write actions
- Phase 3: Enable blocking guard for all ID-sensitive actions
- Phase 4: Onboarding checklist and CI tests for new agents

---

## Success Metrics

- 0 incorrect thread→project responses in QA scenarios
- Reduction in context-related correction messages
- 100% ID-sensitive write actions passing context preflight
- Mean context resolution latency within acceptable SLA

---

## Risks & Mitigations

- **Risk:** Increased API calls — **Mitigation:** 5-min TTL cache + refresh-on-demand
- **Risk:** False-positive mismatches due to delayed metadata — **Mitigation:** one forced refresh before blocking
- **Risk:** Partial adoption — **Mitigation:** enforce in shared plugin middleware + onboarding gate

---

*Original draft by Mithran. Reviewed and approved by Sanjaya 2026-03-13. Coordinator decisions noted inline.*
