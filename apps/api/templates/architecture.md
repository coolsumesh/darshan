# {{project_name}} — Architecture

> **What it does:** _One sentence. What problem does this solve and for whom?_
> **Type:** `webapp | api | mobile | cli | library | data-pipeline | ml-system | other`
> **Last updated:** {{date}} | **Owner:** _[Name / Agent]_

---

## 1. Purpose & Scope

_2–4 sentences. Why does this system exist? What is explicitly out of scope?_

**In scope:**
- ...

**Out of scope:**
- ...

---

## 2. System Diagram

_Show the system boundary and every component + dependency. ASCII or Mermaid._

```
[External Actor / User]
        │
        ▼
  ┌─────────────┐
  │  Your System │
  └──────┬──────┘
         │
  ┌──────▼──────┐     ┌──────────────────┐
  │  Component A │────▶│  External Service │
  └──────┬──────┘     └──────────────────┘
         │
  ┌──────▼──────┐
  │  Storage     │
  └─────────────┘
```

---

## 3. Components

_One entry per major service, module, or layer._

### 3.1 [Component Name]
- **Responsibility:** _Single sentence — what does it own?_
- **Technology:** _Language, framework, version_
- **Interface:** _How others call it — REST / import / event / queue / file_
- **Location:** _Path in repo or repo URL_
- **Owner:** _Agent or person_

<!-- Duplicate section for each component: 3.2, 3.3, … -->

---

## 4. Key Data Flows

_Walk through the most important interactions end to end. Don't skip error paths._

### 4.1 [Flow name — e.g. "User creates a project"]
1. ...
2. ...
3. ...

### 4.2 [Next critical flow]
1. ...

---

## 5. Data & State

**Primary storage:** `PostgreSQL | SQLite | filesystem | S3 | in-memory | none | other`

**Key entities / structures:**

| Name | Description | Format / Table |
|------|-------------|----------------|
| ... | ... | ... |

**State machine (if applicable):**
```
[State A] ──event──▶ [State B] ──event──▶ [State C]
```

**Data ownership:**
- Owns: ...
- Reads from: ...
- Writes to: ...

---

## 6. External Dependencies

| Dependency | Type | Why needed | Failure impact |
|------------|------|------------|----------------|
| ... | `api / package / service / hardware` | ... | `degrades / blocks / none` |

---

## 7. Infrastructure & Runtime

- **Runs on:** `cloud (AWS/GCP/Azure) | on-prem | device | user machine | browser | serverless`
- **OS / Runtime:** _e.g. Linux x64, Node 22, Python 3.11, iOS 16+_
- **Process model:** `single process | multi-process | containerised | serverless | on-device`
- **Config:** `env vars | config file | flags | hardcoded`
- **Secrets:** _Where stored — never in code_
- **Scaling:** `single instance | horizontal | stateless | sharded`
- **Deploy trigger:** `git push | manual | scheduled | CI/CD pipeline`
- **Rollback:** _How to undo a bad release_

---

## 8. Security & Trust

- **Authentication:** _How callers / users prove identity_
- **Authorisation:** _Who can do what_
- **Data sensitivity:** _What's sensitive and how it's protected_
- **Input validation:** _Where and how_
- **Audit trail:** _What gets logged and where_
- **Exposure surface:** _Ports open, public endpoints, file paths_

---

## 9. Observability

- **Logging:** _What's logged, format, where it goes_
- **Metrics:** _Key numbers tracked — latency, error rate, queue depth_
- **Alerts:** _What triggers an alert and who gets it_
- **Health check:** _How to verify the system is alive_

---

## 10. Testing Strategy

| Level | Tool / approach | Coverage target |
|-------|----------------|-----------------|
| Unit | ... | ...% |
| Integration | ... | ... |
| E2E / manual | ... | ... |
| Load / perf | ... | ... |

**Run tests locally:**
```bash
# command here
```

---

## 11. Design Decisions

_The most important section. Record **why**, not just **what**. Add a row for every significant choice._

| # | Decision | Options considered | Choice | Reason | Date |
|---|----------|--------------------|--------|--------|------|
| 1 | ... | A vs B vs C | B | ... | YYYY-MM |

---

## 12. Non-Functional Requirements

| Concern | Target | Status |
|---------|--------|--------|
| API / response latency | ... | ✅ / ❌ / 🟡 |
| Throughput | ... | |
| Availability / uptime | ... | |
| Storage budget | ... | |
| Offline support | ... | |
| Accessibility | ... | |

---

## 13. Known Gaps & Future Work

**Current limitations:**
- [ ] ...

**Planned improvements:**
- [ ] ...

**Won't fix / explicitly out of scope:**
- ...

---

## 14. Agent Roster _(MithranLabs projects — remove if not applicable)_

| Agent | Role on this project | Key responsibilities |
|-------|---------------------|---------------------|
| ... | ... | ... |

**A2A rules:**
- [Agent A] may delegate to [Agent B] for: ...
- Requires human approval for: ...

---

## 15. Glossary

_Only define terms specific to this project or domain._

| Term | Meaning |
|------|---------|
| ... | ... |

---

## Appendix

- DB schema: _[link]_
- Tech Spec: _[link]_
- API reference: _[link]_
- Runbook: _[link]_
