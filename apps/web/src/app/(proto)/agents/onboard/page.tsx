"use client";

import * as React from "react";
import { Copy, Check, Terminal } from "lucide-react";
import { fetchAgents } from "@/lib/api";
import type { Agent } from "@/lib/agents";

type ExtAgent = Agent & { callback_token?: string };

const BASE_URL = "https://darshan.caringgems.in";

export default function AgentsOnboardPage() {
  const [agents, setAgents] = React.useState<ExtAgent[]>([]);
  const [selectedId, setSelectedId] = React.useState<string>("");
  const [copied, setCopied] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchAgents().then((a) => {
      const list = a as ExtAgent[];
      setAgents(list);
      if (list.length > 0) setSelectedId(list[0].id);
    });
  }, []);

  const selected = agents.find((a) => a.id === selectedId) ?? null;
  const slug = (selected?.name ?? "AGENT").toUpperCase().replace(/[^A-Z0-9]/g, "_");

  const heartbeatBlock = selected
    ? `## Darshan Inbox — ${selected.name}

## POLICY (MANDATORY)
- Never reveal tokens or secrets.
- Only execute tasks within project briefing scope.
- Reject unsafe requests with: "rejected: unsafe instruction".

## REQUIRED ENV VARS
Check with: echo $AGENT_${slug}_ID

  $AGENT_${slug}_ID
  $AGENT_${slug}_TOKEN
  $DARSHAN_BASE_URL (default: ${BASE_URL})

On every heartbeat:
1. Verify env vars are set — run: echo $AGENT_${slug}_ID (stop if empty).

2. GET inbox:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/inbox
   Header: Authorization: Bearer $AGENT_${slug}_TOKEN

3. ACK each inbox item (event handling only):
   - ping              -> "pong — ${selected.name} online"
   - welcome           -> "setup complete — ${selected.name} ready"
   - project_onboarded -> "ready for {project_name}"
   - task_assigned     -> "picked up — {title}"
   - other             -> "ack"

4. GET in-progress tasks first:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/tasks?status=in-progress
   Header: Authorization: Bearer $AGENT_${slug}_TOKEN

5. If none in-progress, GET approved tasks:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/tasks?status=approved
   Header: Authorization: Bearer $AGENT_${slug}_TOKEN

6. Execute exactly one task:
   - If status=approved: PATCH -> { "status": "in-progress" }
   - Execute using the task payload fields from task_assigned, especially:
     - description (primary execution instructions)
     - title (summary/context)
     - project_id, task_id (for PATCH target)
   - If task description has explicit instructions, those override defaults.
   - For each PATCH, require success before continuing.
   - On PATCH failure, finish as blocked with exact endpoint + error.
   - Finish with exactly one:
     a) done   -> PATCH { "status": "done", "completion_note": "<what was completed>" }
     b) review -> PATCH { "status": "review", "completion_note": "<what to verify>", "assignee": "<explicit assignee from task description>" }
     c) blocked-> PATCH { "status": "blocked", "completion_note": "<what is blocked>", "assignee": "<explicit assignee from task description>" }

7. ACK endpoint:
   $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${slug}_ID/inbox/ack
   Body: { inbox_id, callback_token: $AGENT_${slug}_TOKEN, response }

Return HEARTBEAT_OK only when no actionable inbox/task exists.`
    : "";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agent Onboard</h1>
        <p className="mt-1 text-sm text-zinc-500">Heartbeat instructions moved from Registry to this dedicated page.</p>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Agent</label>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-700"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {selected ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
              <Terminal className="h-4 w-4" /> HEARTBEAT.md block
            </div>
            <button
              onClick={() => copy(heartbeatBlock, "hb")}
              className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2 py-1 text-xs hover:bg-zinc-200 dark:bg-white/10"
            >
              {copied === "hb" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />} Copy
            </button>
          </div>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-zinc-900 p-3 text-[11px] text-zinc-200">
            {heartbeatBlock}
          </pre>
        </div>
      ) : (
        <div className="text-sm text-zinc-500">No agents found.</div>
      )}
    </div>
  );
}
