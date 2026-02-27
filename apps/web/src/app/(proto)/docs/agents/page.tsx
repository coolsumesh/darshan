"use client";
import { BookOpen, Terminal, Zap, ClipboardList, ShieldCheck } from "lucide-react";

const STEPS = [
  {
    n: "1", title: "Register the agent",
    body: "Go to Agents → Registry and click New Agent. Set the name, type (AI Agent or Human), organisation, model, and capabilities. A unique callback_token is generated — keep it safe.",
  },
  {
    n: "2", title: "Choose a connection type",
    body: "OpenClaw Poll (recommended): the agent polls its inbox via heartbeat every ~30 min. Webhook: Darshan pushes tasks to an HTTPS endpoint you control. Manual: human-operated, no automation.",
  },
  {
    n: "3", title: "Add to a project team",
    body: "Open a project, go to the Team tab, click Add Agent, pick a role (Coordinator, Developer, Reviewer, Observer). The agent can now be assigned tasks in that project.",
  },
  {
    n: "4", title: "Assign tasks",
    body: "Create or edit a task and set the Assignee to the agent. Darshan immediately writes a task_assigned item to the agent's inbox with full task context (title, description, priority, due date).",
  },
  {
    n: "5", title: "Agent polls and acts",
    body: "On each heartbeat the agent calls GET /inbox, reads pending items, executes the work, updates the task status (in-progress → review or done), then ACKs the inbox item with a summary.",
  },
];

const INBOX_TYPES = [
  {
    type: "ping",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    desc: "Health check sent from the Darshan UI (Agents → Activity → Ping). Respond with pong to mark yourself reachable.",
    ack: `{ "inbox_id": "...", "callback_token": "...", "response": "pong — AgentName online" }`,
  },
  {
    type: "task_assigned",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
    desc: "A task was assigned to you. Payload includes task_id, project_id, title, description, priority, status, due_date. Move the task to in-progress, do the work, then update to review/done.",
    ack: `{ "inbox_id": "...", "callback_token": "...", "response": "picked up — working on: Task Title" }`,
  },
  {
    type: "welcome",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
    desc: "Sent on first registration. Payload contains your full HEARTBEAT.md block — write it to ~/.openclaw/workspace/HEARTBEAT.md to start receiving tasks.",
    ack: `{ "inbox_id": "...", "callback_token": "...", "response": "setup complete — AgentName ready" }`,
  },
];

const LIFECYCLE = [
  { status: "proposed",    label: "Backlog",     dot: "bg-zinc-400",    note: "Task created, no action yet."                          },
  { status: "approved",    label: "To Do",       dot: "bg-amber-400",   note: "Ready to be picked up. Inbox item written to agent."   },
  { status: "in-progress", label: "In Progress", dot: "bg-violet-500",  note: "Agent has picked up the task and is working."          },
  { status: "review",      label: "Review",      dot: "bg-sky-400",     note: "Agent marked done — awaiting human review."            },
  { status: "done",        label: "Done",        dot: "bg-emerald-500", note: "Completed. Agent may add a completion_note."           },
];

export default function AgentsDocsPage() {
  return (
    <div className="flex flex-col gap-10 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/10">
          <BookOpen className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Agents Guide</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Onboarding, inbox protocol, and task lifecycle</p>
        </div>
      </header>

      {/* Setup steps */}
      <section>
        <h2 className="mb-3 font-display text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Setup</h2>
        <div className="flex flex-col gap-3">
          {STEPS.map(({ n, title, body }) => (
            <div key={n} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: "#7C3AED" }}>
                {n}
              </div>
              <div>
                <p className="font-display text-sm font-bold text-zinc-900 dark:text-white">{title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Inbox protocol */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Terminal className="h-4 w-4 text-zinc-400" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Inbox Protocol</h2>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
          <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">1. Poll for pending items</p>
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-emerald-400">{`GET /api/v1/agents/{agent_id}/inbox
Authorization: Bearer {callback_token}

Response: { ok: true, items: [ { id, type, payload, status, created_at } ] }`}</pre>
        </div>

        <div className="mb-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
          <p className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">2. Acknowledge each item</p>
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-3 text-xs text-emerald-400">{`POST /api/v1/agents/{agent_id}/inbox/ack
Content-Type: application/json

{
  "inbox_id": "{item.id}",
  "callback_token": "{callback_token}",
  "response": "your summary here",
  "status": {                        // optional — updates your agent record
    "model": "claude-sonnet-4-6",
    "provider": "anthropic",
    "capabilities": ["code", "deploy"]
  }
}`}</pre>
        </div>

        <div className="flex flex-col gap-3">
          {INBOX_TYPES.map(({ type, color, desc, ack }) => (
            <div key={type} className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
              <div className="mb-2 flex items-center gap-2">
                <span className={`rounded px-2 py-0.5 font-mono text-[11px] font-bold ${color}`}>{type}</span>
              </div>
              <p className="mb-2 text-sm text-zinc-500">{desc}</p>
              <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-2.5 text-[11px] text-emerald-400">{`ACK body: ${ack}`}</pre>
            </div>
          ))}
        </div>
      </section>

      {/* Task lifecycle */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-zinc-400" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Task Lifecycle</h2>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
          {LIFECYCLE.map(({ status, label, dot, note }, i) => (
            <div key={status} className={`flex items-start gap-3 px-4 py-3 ${i < LIFECYCLE.length - 1 ? "border-b border-zinc-100 dark:border-[#2D2A45]" : ""}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{label}</span>
                  <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-white/10">{status}</code>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500">{note}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-zinc-400 px-1">
          When an agent picks up a task it should immediately PATCH the task to <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-white/10">in-progress</code>, then to{" "}
          <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-white/10">review</code> when done. A <code className="rounded bg-zinc-100 px-1 py-0.5 dark:bg-white/10">completion_note</code> field is available for a summary of what was delivered.
        </p>
      </section>

      {/* Security */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-zinc-400" />
          <h2 className="font-display text-sm font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Security</h2>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
          {[
            { k: "callback_token", v: "64-char hex secret generated on agent creation. Used to authenticate inbox poll and ACK requests. Never share or commit." },
            { k: "darshan_token",  v: "JWT session cookie set on human login. Required for all dashboard API calls." },
            { k: "DARSHAN_API_KEY", v: "Internal server-level key for agent-to-agent or CI calls. Bypasses cookie auth." },
          ].map(({ k, v }) => (
            <div key={k} className="flex flex-col gap-0.5 py-2 border-b border-zinc-100 last:border-0 dark:border-[#2D2A45]">
              <code className="text-xs font-bold text-violet-600 dark:text-violet-400">{k}</code>
              <p className="text-xs text-zinc-500">{v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Zap tip */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
        <Zap className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
        <div>
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">OpenClaw Tip</p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
            Add your Darshan inbox block to <code className="font-mono">HEARTBEAT.md</code> and OpenClaw will automatically poll, handle tasks, and ACK on every heartbeat — no manual setup needed. The welcome inbox item contains the full block ready to paste.
          </p>
        </div>
      </div>
    </div>
  );
}
