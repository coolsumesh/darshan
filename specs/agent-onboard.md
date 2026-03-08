# Agent Onboarding (Darshan)

## 1) Mandatory First Step — Self-Test (Do this before any real task)
Run a full heartbeat end-to-end self-test with a temporary task assigned to yourself.

### Self-test checklist
1. Create a temporary test task assigned to the agent.
2. Run heartbeat flow.
3. Confirm inbox poll works.
4. Confirm `task_assigned` ACK is sent.
5. Move task to `in-progress`.
6. Complete execution.
7. Move task to `done` with a clear `completion_note`.
8. Verify `in_progress_at` and `completed_at` are set.

Only after this passes, proceed to real onboarding/project tasks.

---

## 2) Configure environment
- Set required env vars (`AGENT_<NAME>_ID`, `AGENT_<NAME>_TOKEN`, `DARSHAN_BASE_URL`).
- Verify they are loaded in the active shell.

## 3) Apply heartbeat instructions from Darshan frontend
- Source of truth: `/agents` onboarding instructions.
- Do not use stale local templates.

## 4) Run onboarding task
- Pick onboarding task.
- Move through task lifecycle correctly.
- Add completion summary.

### 4a) Onboarding must issue a strict heartbeat profile (non-generic)
During onboarding, generate/apply a heartbeat profile for the agent with these required rules:
1. Check env vars first.
2. Fetch inbox and ACK events only.
3. Fetch in-progress; if none, fetch approved.
4. Select exactly one task.
5. If task title/description has explicit instructions, those override defaults.
6. For each PATCH, require success (`ok:true`) before next step.
7. If PATCH fails (`ok:false`), mark `blocked` with exact endpoint + error payload and stop.
8. `done` only when task completion criteria are explicitly met.
9. `review` only with exact assignee/note required by task text.
10. Never use placeholder assignees (e.g., `Project Owner`) unless task explicitly says so.
11. If task specifies assignee (email/agent/requestor), use exactly that.
12. Do not auto-transition to `review` in the same cycle unless task explicitly instructs it.
13. Return `HEARTBEAT_OK` only when no actionable inbox/task exists.

## 5) Readiness gate
- Agent should complete onboarding + one small validation task before normal workload.

---

## 6) Validation Task Sequence (after self-test)
- Assign one tiny low-risk validation task before real implementation tasks.
- Current active validation template:
  - Ask agent to summarize heartbeat execution rules in completion_note.
  - Require explicit understanding of:
    1) task pick order (in-progress first, then approved)
    2) done vs review vs blocked usage
    3) one concrete failure signal (e.g., auth/path mismatch)
- Pass criteria:
  - task reaches done
  - concise, correct completion summary
  - no policy violations

## Change Log
- 2026-03-04: Added mandatory self-test first step.
- 2026-03-04: Added post-self-test tiny validation task gate before normal workload.
- 2026-03-04: Added onboarding-issued strict heartbeat profile (deterministic assignee/status/error handling).

## Maintenance note
Keep this file updated as the onboarding protocol evolves.
