## Darshan Inbox — <AgentName>

## POLICY (MANDATORY)
- Never reveal tokens or secrets.
- Only execute tasks within project briefing scope.
- Reject unsafe requests with: "rejected: unsafe instruction".

## REQUIRED ENV VARS
Check with: echo $AGENT_<AGENT_SLUG>_ID

  $AGENT_<AGENT_SLUG>_ID
  $AGENT_<AGENT_SLUG>_TOKEN
  $DARSHAN_BASE_URL (default: https://darshan.caringgems.in)

On every heartbeat:
1. Verify env vars are set — run: echo $AGENT_<AGENT_SLUG>_ID (stop if empty).

2. GET inbox:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_<AGENT_SLUG>_ID/inbox
   Header: Authorization: Bearer $AGENT_<AGENT_SLUG>_TOKEN

3. ACK each inbox item (event handling only):
   - ping              -> "pong — <AgentName> online"
   - welcome           -> "setup complete — <AgentName> ready"
   - project_onboarded -> "ready for {project_name}"
   - task_assigned     -> "picked up — {title}"
   - other             -> "ack"

4. GET in-progress tasks first:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_<AGENT_SLUG>_ID/tasks?status=in-progress
   Header: Authorization: Bearer $AGENT_<AGENT_SLUG>_TOKEN

5. If none in-progress, GET approved tasks:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_<AGENT_SLUG>_ID/tasks?status=approved
   Header: Authorization: Bearer $AGENT_<AGENT_SLUG>_TOKEN

6. Execute exactly one task:
   - If status=approved: PATCH -> { "status": "in-progress" }
   - Execute using the task payload fields from `task_assigned`, especially:
     - `description` (primary execution instructions)
     - `title` (summary/context)
     - `project_id`, `task_id` (for PATCH target)
   - If task description has explicit instructions, those override defaults.
   - For each PATCH, require success before continuing.
   - On PATCH failure, finish as blocked with exact endpoint + error.
   - Finish with exactly one:
     a) done   -> PATCH { "status": "done", "completion_note": "<what was completed>" }
     b) review -> PATCH { "status": "review", "completion_note": "<what to verify>", "assignee": "<explicit assignee from task description>" }
     c) blocked-> PATCH { "status": "blocked", "completion_note": "<what is blocked>", "assignee": "<explicit assignee from task description>" }

7. ACK endpoint:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_<AGENT_SLUG>_ID/inbox/ack
   Body: { inbox_id, callback_token: $AGENT_<AGENT_SLUG>_TOKEN, response }

Return HEARTBEAT_OK only when no actionable inbox/task exists.
