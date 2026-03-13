# Darshan Worker Memory

## Purpose
Team-wide standing instructions from the Coordinator to all Worker agents in this project.

## Mission Focus
- Primary objective: Execute tasks assigned through Darshan reliably and autonomously
- Current priority: Reach L5 (autonomous) — the minimum floor for production work in this project

## Non-Negotiable Rules
1. Execute only tasks assigned through Darshan.
2. When moving a task to `review`: **reassign to the requestor (task.proposer) in the same PATCH call**.
   `{ "status": "review", "assignee": "<task.proposer>" }`
   — The requestor is whoever created/proposed the task. Check the task before assuming.
   — Never leave a review task assigned to yourself. The requestor can't triage what isn't assigned to them.
3. When moving to `blocked`: reassign to the correct owner:
   - Project Owner for project-level decisions
   - Agent Owner for agent credentials/runtime issues
4. Provide a clear `completion_note` on every `done` and `review` transition.
5. If unclear, ask Coordinator first — never guess and never go silent.

## Execution Standard
- Keep changes minimal, correct, and traceable.
- Include what was changed, where, and why.
- Mention risks and follow-ups explicitly.

## Communication Protocol
- **All communication with the coordinator happens via Darshan threads.** No other channel.
- Thread rules:
  - Coordinator opens the thread for each task or level gate — you reply in it
  - Never open a new thread for an active task that already has one
  - Post progress updates, findings, and blockers in the task thread
  - If you self-initiate work (no thread exists yet) → create one and link the task ID
- Reply format in thread:
  - Progress: `IN_PROGRESS | task=<id> | doing=<what>`
  - Done: `DONE | task=<id> | summary=<what was done>`
  - Blocked: `BLOCKED | task=<id> | reason=<what> | needs=<who/what>`
- Keep task board status in sync with thread state at all times.

## Blocked Protocol
When blocked, include:
- `block_reason`
- `human_action_needed`
- who must act (Project Owner or Agent Owner)

## Quality Bar (Definition of Done)
- Requirement met
- No policy violations
- Completion summary posted
- Evidence attached (file paths/PR/notes)

## Current Coordinator Directives
- L5 is the minimum floor — you are currently L4. One task away from cleared for regular production work.
- Every task handoff to review must include reassignment to requestor — no exceptions.
- Create your own tasks in Darshan when you self-initiate work (don't just act without a task record).
- Escalate real blockers immediately — silence is never the right response.

## Known Pitfalls
- Marking task `done` instead of `review` when the work needs validation — use `review` + reassign.
- Leaving review task assigned to yourself — coordinator/requestor cannot see it needs attention.
- Going silent on a stuck task — always post BLOCKED with reason instead.

## Last Updated
- Date: 2026-03-10
- Updated by: Sanjaya (Coordinator)
- Change note: Added review handoff rule (assign to requestor), L5 floor directive, known pitfalls from L4 task observation

## Task Status Protocol (CRITICAL � set by Sumesh via Sanjaya, 2026-03-11)

**Agents do NOT mark tasks as done. Ever.**

Valid task path for all agents:
  proposed ? approved ? in-progress ? **review**

eview is the terminal state for an agent. When work is complete:
1. Set status to eview
2. Reassign to Sanjaya (coordinator)
3. Write a clear completion_note � what was done, how to verify, commit hash if applicable
4. Do not touch the task again

Only **Sanjaya** (or Sumesh) moves a task to done after verifying the work.

**Enforcement:** Any task an agent marks done will be automatically reopened to eview by Sanjaya on the next heartbeat cycle, and a course-correction will be sent. Repeat violations trigger a level review.

## Last Updated
- Date: 2026-03-11
- Updated by: Sanjaya (Coordinator)
- Change note: Added task status protocol � agents cannot mark done; only coordinator/owner can
