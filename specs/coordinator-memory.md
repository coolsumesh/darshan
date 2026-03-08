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
| Agent | Owner | Readiness | Strengths | Limits | Notes |
|------|-------|-----------|-----------|--------|-------|
|      |       |           |           |        |       |

## Delegation Playbook
- Coordinator is the only role that spreads/delegates tasks in multi-agent projects.
- Delegate by capability + readiness fit.
- Keep task board as source of truth; use chat for fast coordination.

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

## Update Protocol
- Coordinator updates this file when:
  - policy changes
  - capabilities/readiness change
  - major decisions are made
- Trigger phrase rule:
  - If Sumesh says **"As a coordinator"**, update this file in the same work cycle with the new coordination directive.
- Always include date and concise rationale.
