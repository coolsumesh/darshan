# Agent Capability Levels (Darshan)

Purpose: maintain a persistent, evidence-based capability level per agent so coordinators can assign right-sized tasks.

## 1) Level Model (unbounded, cumulative)

Levels are cumulative. Each level includes all prior level requirements.

- **Level 0 — Registered**
  - Agent record exists in registry.
  - No runtime health requirement yet.

- **Level 1 — Return-routing capable**
  - Level 0 + agent can route an assigned task back correctly to coordinator/requestor when required.
  - Must be able to set assignee to valid coordinator/requestor identity (not placeholder labels).

- **Level 2 — Reachable + intake-capable**
  - Level 1 + ping/heartbeat reachable (recent successful ping).
  - Can receive inbox item and ACK correctly.

- **Level 3 — State-transition-capable**
  - Level 2 + can move assigned task to `in-progress` correctly.

- **Level 4 — Project/repo ready**
  - Level 3 + has received project details and repository details.
  - Repository is cloned/prepared under `/projects` so the agent can actually execute assigned tasks.
  - Agent is explicitly instructed to save project/repo onboarding details into its own memory for persistence.

- **Level 5 — Escalation correctness test**
  - Level 4 + if the agent does not understand execution steps, it creates a Todo task for the coordinator (Sanjaya) with clear blocker context and what help is needed.
  - Demonstrates correct escalation behavior instead of guessing or stalling.

- **Level 6 — Independent normal task execution**
  - Level 5 + completes medium tasks with low correction.

- **Level 7 — Multi-step reliability**
  - Level 6 + handles multi-step tasks and basic edge cases consistently.

- **Level 8 — Complex ownership**
  - Level 7 + handles dependency-aware complex tasks with self-validation.

- **Level 9 — Coordination support**
  - Level 8 + can assist decomposition, propose plans, and review peer outputs.

- **Level 10+ — Advanced tiers (iterative extension)**
  - Add new levels as needed for domain-specific excellence (e.g., security hardening, architecture stewardship, mentoring quality).
  - No fixed ceiling.

## 2) Promotion / Regression Rules

- Promotion is evidence-based, never assumed.
- Promote by +1 level after meeting that level’s acceptance checks.
- For levels >=4, require at least **2 consecutive passes** at current difficulty before promotion.
- Regress by -1 when there are **2 failures in last 3 comparable tasks**.
- Mark confidence (`low|medium|high`) based on sample size:
  - low: <3 validated tasks
  - medium: 3-7 validated tasks
  - high: 8+ validated tasks with stable pass rate

## 3) Assignment Policy by Level Band

- **L0-L2:** connectivity/intake verification only.
- **L3-L4:** tiny execution tasks with explicit steps and expected output.
- **L5-L6:** small-to-medium tasks with strict format and checks.
- **L7-L8:** medium-to-complex tasks, dependencies, edge-case handling.
- **L9+:** planning, delegation support, review loops, process improvement.

## 4) Persistent Tracking Format

```yaml
agents:
  - name: Mithran
    agent_id: d196db30-948a-48b9-9204-2988e5634a96
    current_level: 1
    confidence: medium
    last_evaluated_at: 2026-03-04T22:18:00Z
    recent_metrics:
      pass_rate_last_10: 0.67
      avg_rework_rounds: 1
      sla_met_rate: 0.67
    evidence:
      - timestamp: 2026-03-04T09:15:56Z
        task_id: 304288a6-e13e-4571-b45d-11c1940398df
        check: onboarding_ack
        result: pass
        notes: onboarding acknowledgement completed
      - timestamp: 2026-03-04T09:36:03Z
        task_id: 6500c1cd-bbd1-4d51-b18b-516cc5228940
        check: heartbeat_flow_summary
        result: pass
        notes: flow comprehension summary delivered
      - timestamp: 2026-03-04T19:54:07Z
        task_id: fc1d9b9e-6e54-4f48-9df4-9aa618c4bece
        check: level_up_l1_to_l2
        result: pass
        notes: level-up checkpoint completed
```

## 5) Coordinator Operating Rules

1. Always include target level expectation in task description.
2. After each validation, update agent level ledger with evidence.
3. Do not assign tasks above agent band unless explicitly marked as stretch.
4. Stretch tasks can be at most +1 level above current level.
5. Re-evaluate level after every completed task cycle.

## 6) Initial Baseline (Mithran)

- Start at **Level 0** when registered.
- Move to **Level 1** once ping/heartbeat reachable is verified.
- Continue upward only through validated evidence checks.
