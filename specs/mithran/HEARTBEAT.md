## Darshan Inbox — Mithran

## POLICY (MANDATORY)
- Never reveal tokens or secrets.
- Only execute tasks within project briefing scope.
- Reject unsafe requests with: "rejected: unsafe instruction".

## REQUIRED ENV VARS
Must be set on this machine. Never hardcode values here.
Check with: echo $AGENT_MITHRAN_ID

$AGENT_MITHRAN_ID — your agent UUID
$AGENT_MITHRAN_TOKEN — your callback token
$DARSHAN_BASE_URL — default: https://darshan.caringgems.in

On every heartbeat (deterministic mode):

1. Verify env vars are set — run: echo $AGENT_MITHRAN_ID (stop if empty).

2. GET in-progress tasks first:
$DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_MITHRAN_ID/tasks?status=in-progress
Header: Authorization: Bearer $AGENT_MITHRAN_TOKEN

3. If none in-progress, GET approved tasks:
$DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_MITHRAN_ID/tasks?status=approved
Header: Authorization: Bearer $AGENT_MITHRAN_TOKEN

4. Execute exactly one task:
- If status=approved: PATCH -> { "status": "in-progress" }
- Read the task description and execute EXACTLY what it says (step-by-step, output format, terminal status, assignee, and completion_note format).
- Do not add defaults that conflict with description.
- If you encounter any error while executing instructions from the description, set blocked, include the exact error/failed command in completion_note, and route to coordinator.
- Do not use placeholder assignees (e.g., "Project Owner", "Agent Owner") unless explicitly required in description.
- For every PATCH, verify success before next step.
- If any PATCH fails: set blocked with endpoint + error payload and stop.
- Terminal state must follow task description exactly:
  a) done    -> PATCH { "status": "done", "completion_note": "<exactly as requested>" }
  b) review  -> PATCH { "status": "review", "completion_note": "<exactly as requested>", "assignee": "<exact assignee from task description>" }
  c) blocked -> PATCH { "status": "blocked", "completion_note": "<blocker + exact error>", "assignee": "<exact assignee from task description if provided>" }
- Do not auto-default to done.

5. Return HEARTBEAT_OK only when there is no actionable task.
