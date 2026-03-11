# Darshan Coordinator Memory

## Purpose
Project-scoped operational memory for the Coordinator agent.

## Project Identity
- Project: Darshan
- Objective: Coordinate reliable multi-agent delivery with strict task-state hygiene and safe escalation.
- Success criteria: Assigned tasks are executed with correct routing, evidence, and readiness-aware delegation.
- Out of scope: Unassigned work, bypassing APIs, or undocumented backend workarounds.

## Canonical Rules Snapshot
- Agents are user-owned (`owner_user_id`).
- Attachment is collaborative, ownership does not transfer.
- Use `review` only when human interaction is required.
- Route `review`/`blocked` to:
  - Project Owner for project-level decisions
  - Agent Owner for agent-owner-specific actions

## Agent Roster and Capability Map
| Agent | Owner | Level | Readiness | Strengths | Limits | Notes |
|-------|-------|-------|-----------|-----------|--------|-------|
| Mithran | Sumesh | L3 | Below floor (L5 required) | A2A messaging, task execution, self-recovery | Needs to demonstrate ambiguity handling + reliable delivery | Course-correcting to L5 |

## Delegation Playbook
- Coordinator is the only role that spreads/delegates tasks in multi-agent projects.
- Delegate by capability + readiness fit.
- Keep task board as source of truth; use chat for fast coordination.

## Agent Level Floor Rule (2026-03-10, directive by Sumesh)
- **All agents in any project where Sanjaya acts as coordinator must be at L5 or above.**
- Every heartbeat cycle: check current level of every project agent.
- If any agent is below L5:
  1. Identify the gap (what level are they at, what's the L5 gate).
  2. Assign a course-correction task or thread to drive them toward the next level.
  3. Do not assign meaningful production work until they reach L5.
  4. If stuck for >2 cycles with no progression: escalate to Sumesh via Telegram.
- This is a standing policy — not a one-time check.

## Task Handoff Protocol
- When an agent moves a task to `review`, they **must** reassign it to the **requestor** (check `task.proposer`) in the same PATCH call: `{ "status": "review", "assignee": "<task.proposer>" }`
- The requestor is whoever created or proposed the task — may be Sanjaya, Sumesh, or another agent
- Tasks left in `review` assigned to the executing agent = invisible to the requestor = blocked pipeline
- If coordinator sees a `review` task not assigned to the requestor → course-correct the agent immediately

## Escalation Rules
- Escalate to Project Owner for scope/priority/business decisions.
- Escalate to Agent Owner for credentials/runtime/env issues tied to an agent.

## Current Sprint Priorities
1.
2.
3.

## Open Risks / Blockers
- 

## Decisions Log
| Date | Decision | Why | Impact |
|------|----------|-----|--------|
| 2026-03-05 | Coordinator role confirmed by Sumesh; coordinator must use Darshan specs as operating source | To enforce role clarity and consistent execution | Coordinator actions now explicitly follow `specs/` docs before task execution |
| 2026-03-10 | review handoff must reassign to requestor (task.proposer) | Mithran completed L4 task but left it assigned to himself — requestor blind spot; clarified by Sumesh that assignee = requestor, not always coordinator | Added to Mithran MEMORY.md + coordinator spec; enforced on all future handoffs |
| 2026-03-10 | All agents in coordinator-led projects must be at L5+ at all times | Sumesh directive ("As a coordinator") — sets quality floor for production delegation | Sanjaya checks levels every heartbeat; course-corrects any sub-L5 agent before assigning real work |

## Update Protocol
- Coordinator updates this file when:
  - policy changes
  - capabilities/readiness change
  - major decisions are made
- Trigger phrase rule:
  - If Sumesh says **"As a coordinator"**, update this file in the same work cycle with the new coordination directive.
- Always include date and concise rationale.
