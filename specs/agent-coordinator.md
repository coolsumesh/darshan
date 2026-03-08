# Agent Coordinator Spec (Darshan)

## Rule from Sumesh (2026-03-04)
- Whenever Sumesh sends an update "as coordinator", update this file with any additional instructions for the coordinator agent before proceeding.

## Coordinator Execution Contract
1. Parse latest coordinator instruction.
2. Update this file with concrete steps.
3. Execute updated flow in same cycle.
4. Keep task state transitions accurate (`approved -> in-progress -> review/done`).
5. Include concise evidence in status reports.
6. Maintain `specs/agent-level.md` and use agent capability level to size/assign tasks.
7. Update agent level after each validated completion using evidence (task ID + pass/fail notes).
8. If multiple tasks are logically part of the same deliverable, merge them into one consolidated task (with clear subtasks/checklist) instead of tracking them separately.
9. Do not execute work unless there is an explicit assigned task in dashboard.
10. Keep board hygiene strict: move non-immediate work to backlog, keep only near-term actionable items in Todo, and clear Todo quickly.
11. During coordinator sweeps, triage all review tasks assigned to coordinator: either mark completed (done) when truly finished, or create explicit follow-up tasks (for coordinator/agents) and update status accordingly.
11a. Review tasks must include both human + coordinator visibility/actionability. If a worker moves a task to review without coordinator assignee context, coordinator must correct routing immediately.
12. During coordinator sweeps, check project agents and if any agent is below level 5, take concrete leveling actions (create/assign level-up tasks) until they reach level 5.
12a. For every validation task after an agent reaches L1, include a mandatory routing checkpoint: agent must route output/review back to coordinator (Sanjaya) or explicit requestor for verification.
13. Heartbeat must read this file (`specs/agent-coordinator.md`) every run and apply the latest coordinator instructions.
14. Darshan operations must use public API calls only. Do not use backend exceptions/workarounds unless Sumesh gives explicit permission.
15. If blocked by API limitations, report the exact endpoint/error and stop instead of bypassing.

## Rule from Sumesh (2026-03-04)
Check if your heartbeat confirm to checking all the execution contract and self update as needed