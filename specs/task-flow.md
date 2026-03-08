# Darshan Task Flow Spec

## Purpose
Define a deterministic task lifecycle where agents can execute autonomously, request human help only when necessary, and always leave clear completion context.

## Terminology Consistency
- For User–Agent relationships in Project/Org context, use **attach/detach** (not assign/contribute).
- In this document, **task assignment** refers only to who is responsible for executing a task.

## Authoring Model
When a task is created by a human:
- Required:
  - `title` (short)
  - `description` (short intent)
- Agent responsibility:
  - Expand the short description into an actionable implementation plan (`expanded_description`) based on its understanding before or when moving into execution.

## Required Task Fields
- `title` (required)
- `description` (required, short)
- `expanded_description` (required before/at `in-progress`)
- `completion_summary` (required for `done` and `review`)
- `block_reason` (required for `blocked`)
- `human_action_needed` (required for `blocked`, explicit next action)

## Statuses
- `proposed`
- `approved`
- `in-progress`
- `review`
- `blocked`
- `done`

## Allowed Transitions
- `proposed -> approved`
- `approved -> in-progress`
- `in-progress -> done`
- `in-progress -> review`
- `in-progress -> blocked`

No other transitions are allowed unless explicitly extended in a future version.

## Transition Rules

### proposed -> approved
- Triggered by human owner/approver.

### approved -> in-progress
- Triggered by assigned agent.
- `expanded_description` must be present (agent can generate/populate at this step if missing).

### in-progress -> done
- Use when no human verification/intervention is required.
- `completion_summary` is mandatory.

### in-progress -> review
- Use only when human validation/check is needed.
- `completion_summary` is mandatory and should specify what needs checking.
- **Routing rule for assignee on review:**
  - If the required human action is project-level/business validation, assign review to **Project Owner**.
  - If the required human action is agent-specific (credentials, endpoint, runtime, environment owned by agent owner), assign review to the **Agent Owner**.

### in-progress -> blocked
- Use only when human intervention is required to continue.
- `block_reason` is mandatory.
- `human_action_needed` is mandatory and must be actionable.
- **Routing rule for assignee on blocked:**
  - If blocker is project-level decision/dependency, assign blocked item to **Project Owner**.
  - If blocker is agent-owned dependency (agent owner action needed), assign blocked item to the **Agent Owner**.

## Agent Picking Logic (Deterministic)
Agents pick tasks in this order:
1. Assigned to this agent
2. Status = `approved`
3. Highest priority
4. Oldest first (`created_at` ascending)

## Completion Standard
A task is complete only when:
- Final status is `done`, and
- `completion_summary` clearly states what was delivered, or
- Final status is `review` with a clear summary and verification request.

## Notes
- `review` is for human validation, not for routine completion.
- `blocked` is only for human intervention dependency.
- Default successful path should be: `approved -> in-progress -> done`.
- Callback-token task updates are constrained:
  - Agent token can update execution fields only.
  - Agent can hand off assignee away from itself only with terminal transition (`review` or `done`).
  - Handoff target must be a valid requestor/human project member or a project coordinator agent.
