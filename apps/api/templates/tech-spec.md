# {{project_name}} — Technical Specification

> **Status:** `draft | review | approved | superseded`
> **Last updated:** {{date}} | **Author:** _[Name / Agent]_
> **Related:** Architecture doc · Sprint Board · DB schema

---

## 1. Overview

_2–3 sentences. What is being built, why now, and what does success look like?_

---

## 2. Background & Problem Statement

_What is the current situation? What breaks or doesn't exist yet?
Link to any relevant context, prior decisions, or user feedback._

---

## 3. Goals & Non-Goals

**Goals — this spec will deliver:**
- [ ] ...
- [ ] ...

**Non-goals — explicitly out of scope:**
- ...

**Success metrics:**
| Metric | Target |
|--------|--------|
| ... | ... |

---

## 4. Proposed Solution

_High-level description of the approach. Why this solution over alternatives?_

### 4.1 Overview
...

### 4.2 Key Design Choices
...

### 4.3 Alternatives Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Current approach | ... | ... | ✅ Chosen |
| Alternative A | ... | ... | ❌ Rejected |

---

## 5. Detailed Design

_The core of the spec. Go as deep as the implementation needs._

### 5.1 [Feature / Component / Flow Name]

_Description, behaviour, edge cases._

**Input:** ...
**Output:** ...
**Edge cases:**
- ...

### 5.2 [Next feature / component]

...

---

## 6. API / Interface Changes

_Any new or modified endpoints, function signatures, events, file formats, CLI flags._

### New endpoints

```
POST /api/v1/[resource]
Body: { ... }
Response 201: { ok: true, [resource]: { ... } }
Response 400: { ok: false, error: "..." }
```

### Modified endpoints

| Endpoint | Change | Breaking? |
|----------|--------|-----------|
| ... | ... | Yes / No |

### Removed / deprecated

| Endpoint / field | Replaced by | Sunset date |
|-----------------|-------------|-------------|
| ... | ... | ... |

---

## 7. Data Model Changes

_New tables, columns, indexes, or migrations required._

```sql
-- Example migration
alter table [table] add column [col] [type] not null default [val];
create index [name] on [table] ([col]);
```

**Migration safety:**
- [ ] Backward-compatible (old code works before and after)
- [ ] Requires deploy coordination (old code breaks with new schema)
- [ ] Data backfill needed — _describe_

---

## 8. UI / UX Changes _(if applicable)_

_Describe affected screens, flows, or components. Reference design spec if one exists._

| Screen / Component | Change | Notes |
|-------------------|--------|-------|
| ... | ... | ... |

---

## 9. Security Considerations

- **New attack surface:** _What new inputs, endpoints, or permissions are introduced?_
- **Auth / authz:** _Does this change who can do what?_
- **Data sensitivity:** _Any new PII or secrets involved?_
- **Audit:** _What should be logged?_

---

## 10. Performance & Scalability

- **Expected load:** _requests/sec, data volume, concurrency_
- **Bottlenecks:** _What could slow down or fail under load?_
- **Caching strategy:** _What can be cached? TTL? Invalidation?_
- **Query plan:** _Any expensive DB queries? Index strategy?_

---

## 11. Testing Plan

| Test type | What to test | Tool | Owner |
|-----------|-------------|------|-------|
| Unit | ... | ... | ... |
| Integration | ... | ... | ... |
| E2E | ... | ... | ... |
| Load | ... | ... | ... |
| Manual QA | ... | — | ... |

**Test data requirements:**
- ...

---

## 12. Rollout Plan

**Phase:**
- [ ] Phase 1 — _describe_
- [ ] Phase 2 — _describe_

**Feature flags:** _Any behind a flag? Name and default._

**Rollback plan:** _How to revert if something goes wrong._

**Comms needed:** _Who needs to be notified before/after?_

---

## 13. Open Questions

_Things not yet decided. Assign each to someone with a deadline._

| # | Question | Owner | Due | Status |
|---|----------|-------|-----|--------|
| 1 | ... | ... | ... | Open / Resolved |

---

## 14. Implementation Tasks

_Link or copy from Sprint Board._

- [ ] ...
- [ ] ...

---

## 15. References

- Architecture doc: _[link]_
- Related spec: _[link]_
- User research / feedback: _[link]_
- Prior art / inspiration: _[link]_
