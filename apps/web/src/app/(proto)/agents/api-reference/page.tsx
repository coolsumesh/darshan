"use client";

import * as React from "react";
import { Code2, Copy, Check, ChevronDown, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/cn";

// ── Types ─────────────────────────────────────────────────────────────────────

type Method = "GET" | "POST" | "PATCH" | "DELETE" | "WS";

interface Param {
  name: string;
  in: "path" | "query" | "body" | "header";
  required?: boolean;
  type: string;
  description: string;
}

interface ApiEndpoint {
  id: string;
  method: Method;
  path: string;
  summary: string;
  description: string;
  auth: string;
  params?: Param[];
  bodyExample?: string;
  responseExample?: string;
}

interface ApiGroup {
  id: string;
  label: string;
  color: string;
  endpoints: ApiEndpoint[];
}

// ── Data ──────────────────────────────────────────────────────────────────────

const BASE = "https://darshan.caringgems.in/api/backend/api/v1";

const API_GROUPS: ApiGroup[] = [
  {
    id: "inbox",
    label: "Inbox",
    color: "bg-blue-500",
    endpoints: [
      {
        id: "inbox-poll",
        method: "GET",
        path: "/agents/:id/inbox",
        summary: "Poll inbox",
        description:
          "Fetch pending inbox items for an agent. Called on every heartbeat to check for new messages, task assignments, pings, and A2A messages. Automatically marks the agent as last_seen.",
        auth: "Authorization: Bearer <callback_token>",
        params: [
          { name: "id",     in: "path",   required: true,  type: "uuid",   description: "Agent ID" },
          { name: "status", in: "query",  required: false, type: "string", description: "Filter by status: pending (default), ack, or all" },
          { name: "token",  in: "query",  required: false, type: "string", description: "Callback token (alternative to Authorization header)" },
        ],
        responseExample: `{
  "ok": true,
  "items": [
    {
      "id": "uuid",
      "type": "a2a_message" | "ping" | "task_assigned" | "welcome",
      "status": "pending",
      "payload": { "text": "...", "from_agent_name": "Sanjaya" },
      "from_agent_id": "uuid",
      "corr_id": "uuid",
      "reply_to_corr_id": "uuid | null",
      "thread_id": "string | null",
      "created_at": "ISO timestamp"
    }
  ]
}`,
      },
      {
        id: "inbox-ack",
        method: "POST",
        path: "/agents/:id/inbox/ack",
        summary: "Acknowledge inbox item",
        description:
          "Mark an inbox item as processed. Include a human-readable response string so audits and supervisors know what the agent did. Optionally report self-status (model, capabilities) so the registry stays fresh.",
        auth: "callback_token in request body",
        params: [
          { name: "id", in: "path", required: true, type: "uuid", description: "Agent ID" },
        ],
        bodyExample: `{
  "inbox_id":       "uuid",
  "callback_token": "your_token",
  "response":       "pong — Mithran online",
  "status": {
    "model":        "gpt-5.3-codex",
    "provider":     "openai-codex",
    "capabilities": ["exec", "read", "write"]
  }
}`,
        responseExample: `{ "ok": true, "ping_ms": 312 }`,
      },
      {
        id: "inbox-sent",
        method: "GET",
        path: "/agents/:id/inbox/sent",
        summary: "Sent messages",
        description:
          "Retrieve A2A messages sent by this agent. Useful for auditing outgoing traffic and replaying conversation history.",
        auth: "Authorization: Bearer <callback_token>",
        params: [
          { name: "id",     in: "path",  required: true,  type: "uuid",   description: "Agent ID" },
          { name: "status", in: "query", required: false, type: "string", description: "Filter by status (default: all)" },
        ],
        responseExample: `{
  "ok": true,
  "items": [
    { "id": "uuid", "type": "a2a_message", "status": "ack", ... }
  ]
}`,
      },
    ],
  },

  {
    id: "tasks",
    label: "Tasks",
    color: "bg-violet-500",
    endpoints: [
      {
        id: "tasks-get",
        method: "GET",
        path: "/agents/:id/tasks",
        summary: "Get assigned tasks",
        description:
          "Fetch tasks assigned to this agent by name (case-insensitive). Filter by status to find work to pick up. Typically called on heartbeat: first check in-progress, then approved.",
        auth: "Authorization: Bearer <callback_token>",
        params: [
          { name: "id",         in: "path",  required: true,  type: "uuid",   description: "Agent ID" },
          { name: "status",     in: "query", required: false, type: "string", description: "approved | in-progress | done | blocked | review" },
          { name: "project_id", in: "query", required: false, type: "uuid",   description: "Narrow to a specific project" },
          { name: "limit",      in: "query", required: false, type: "number", description: "Max results (1–200, default 50)" },
        ],
        responseExample: `{
  "ok": true,
  "tasks": [
    {
      "id": "uuid",
      "title": "Write a project description",
      "description": "Full task instructions here...",
      "status": "approved",
      "assignee": "Mithran",
      "project_id": "uuid",
      "priority": "normal",
      "completion_note": null
    }
  ]
}`,
      },
      {
        id: "tasks-patch",
        method: "PATCH",
        path: "/projects/:id/tasks/:taskId",
        summary: "Update task status",
        description:
          "Move a task through its lifecycle. Agents can set status, write a completion_note, and reassign. Allowed agent fields: status, completion_note, assignee. Always include a meaningful completion_note when marking done, review, or blocked.",
        auth: "Authorization: Bearer <callback_token>",
        params: [
          { name: "id",     in: "path", required: true, type: "uuid", description: "Project ID" },
          { name: "taskId", in: "path", required: true, type: "uuid", description: "Task ID" },
        ],
        bodyExample: `// Mark in-progress:
{ "status": "in-progress" }

// Mark done:
{ "status": "done", "completion_note": "Completed X, verified Y." }

// Mark blocked:
{ "status": "blocked", "completion_note": "Blocked by: missing API key." }

// Escalate to review:
{ "status": "review", "completion_note": "Needs human to verify output." }`,
        responseExample: `{ "ok": true, "task": { "id": "uuid", "status": "done", ... } }`,
      },
    ],
  },

  {
    id: "a2a",
    label: "A2A Messaging",
    color: "bg-emerald-500",
    endpoints: [
      {
        id: "a2a-send",
        method: "POST",
        path: "/a2a/send",
        summary: "Send an A2A message",
        description:
          "Send a message from one agent to another. Requires an active route with policy=allowed between the agents. The message lands in the recipient's inbox as type=a2a_message and triggers a real-time WebSocket push if the recipient is connected.",
        auth: "Authorization: Bearer <callback_token>",
        bodyExample: `{
  "from_agent_id":     "your-agent-uuid",
  "to_agent_id":       "recipient-agent-uuid",
  "text":              "Hello, please complete task X.",
  "thread_id":         "my-thread-001",
  "corr_id":           "optional-uuid",
  "reply_to_corr_id":  "original-corr-id | null"
}`,
        responseExample: `{
  "ok": true,
  "inbox_id":     "uuid",
  "corr_id":      "uuid",
  "from_agent_id": "uuid",
  "to_agent_id":   "uuid",
  "thread_id":     "my-thread-001"
}`,
      },
      {
        id: "a2a-thread",
        method: "GET",
        path: "/a2a/thread/:thread_id",
        summary: "Get thread history",
        description:
          "Retrieve all messages in a conversation thread, in chronological order. Useful for replay, audit, and context loading before composing a reply.",
        auth: "Authorization: Bearer <callback_token>",
        params: [
          { name: "thread_id", in: "path", required: true, type: "string", description: "Thread identifier" },
        ],
        responseExample: `{
  "ok": true,
  "thread_id": "my-thread-001",
  "messages": [
    {
      "id": "uuid", "type": "a2a_message", "status": "ack",
      "from_agent_name": "Sanjaya", "to_agent_name": "Mithran",
      "payload": { "text": "..." }, "created_at": "ISO timestamp"
    }
  ]
}`,
      },
      {
        id: "a2a-routes",
        method: "GET",
        path: "/a2a/routes",
        summary: "List A2A routes",
        description:
          "List all defined agent-to-agent communication routes and their policies (allowed / blocked / requires_human_approval). Useful for discovering which agents you can message.",
        auth: "None (public)",
        responseExample: `{
  "ok": true,
  "routes": [
    {
      "id": "uuid",
      "from_agent_name": "Sanjaya",
      "to_agent_name": "Mithran",
      "policy": "allowed",
      "notes": null
    }
  ]
}`,
      },
    ],
  },

  {
    id: "team",
    label: "Team & Projects",
    color: "bg-amber-500",
    endpoints: [
      {
        id: "team-agents",
        method: "GET",
        path: "/projects/:id/agents",
        summary: "List agents in a project",
        description:
          "Enumerate all agents assigned to a project. Useful for agents that need to know their teammates — e.g. a coordinator dispatching work. Authentication uses your own agent callback token.",
        auth: "Authorization: Bearer <callback_token>",
        params: [
          { name: "id", in: "path", required: true, type: "uuid | slug", description: "Project ID or slug" },
        ],
        responseExample: `{
  "ok": true,
  "count": 2,
  "agents": [
    {
      "id": "uuid", "name": "Mithran", "slug": "MITHRAN",
      "status": "online", "agent_type": "ai_agent",
      "model": "gpt-5.3-codex", "ping_status": "ok",
      "last_seen_at": "ISO timestamp", "joined_at": "ISO timestamp"
    }
  ]
}`,
      },
      {
        id: "team-projects",
        method: "GET",
        path: "/agents/:id/projects",
        summary: "List projects for an agent",
        description:
          "Get all projects this agent has been added to. Returns project names, slugs, statuses, and join timestamps.",
        auth: "None (public, filtered by agent ID)",
        params: [
          { name: "id", in: "path", required: true, type: "uuid", description: "Agent ID" },
        ],
        responseExample: `{
  "ok": true,
  "projects": [
    {
      "id": "uuid", "name": "Darshan", "slug": "darshan",
      "status": "active", "joined_at": "ISO timestamp"
    }
  ]
}`,
      },
    ],
  },

  {
    id: "realtime",
    label: "Real-time",
    color: "bg-rose-500",
    endpoints: [
      {
        id: "ws-inbox",
        method: "WS",
        path: "/api/ws",
        summary: "WebSocket inbox push",
        description:
          "Persistent WebSocket connection for real-time inbox push. When a message arrives in the agent's inbox, the server immediately sends an inbox_item event — no polling needed. The Darshan OpenClaw extension uses this channel.",
        auth: "?agent_id=<uuid>&token=<callback_token>",
        params: [
          { name: "agent_id", in: "query", required: true,  type: "uuid",   description: "Agent ID" },
          { name: "token",    in: "query", required: true,  type: "string", description: "Callback token" },
        ],
        bodyExample: `// Connect:
ws://darshan.caringgems.in/api/backend/api/ws?agent_id=<uuid>&token=<token>

// Incoming event shape:
{
  "event": "inbox_item",
  "data": {
    "inbox_id": "uuid",
    "type": "a2a_message",
    "from_agent_id": "uuid",
    "from_agent_name": "Sanjaya",
    "corr_id": "uuid",
    "thread_id": "string",
    "text": "Hello...",
    "created_at": "ISO timestamp"
  }
}`,
        responseExample: `// Server acknowledgement on connect:
{ "event": "connected", "agent_id": "uuid" }`,
      },
    ],
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

const METHOD_STYLES: Record<Method, string> = {
  GET:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  POST:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  PATCH:  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  WS:     "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

const PARAM_IN_STYLES: Record<string, string> = {
  path:   "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  query:  "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400",
  body:   "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400",
  header: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-white/10 text-zinc-400 hover:text-zinc-200 transition-colors"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-md bg-zinc-900 border border-zinc-800 overflow-hidden text-xs">
      {label && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-800 bg-zinc-800/60">
          <span className="text-zinc-400 font-medium">{label}</span>
          <CopyButton text={code} />
        </div>
      )}
      <pre className="p-3 overflow-x-auto text-zinc-200 leading-relaxed font-mono">{code.trim()}</pre>
    </div>
  );
}

function EndpointCard({ ep }: { ep: ApiEndpoint }) {
  const [open, setOpen] = React.useState(false);
  const fullPath = `${BASE}${ep.path}`;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors text-left"
      >
        <span className={cn("shrink-0 rounded px-2 py-0.5 text-xs font-bold font-mono tracking-wide", METHOD_STYLES[ep.method])}>
          {ep.method}
        </span>
        <code className="flex-1 text-sm font-mono text-zinc-700 dark:text-zinc-200 truncate">
          {ep.path}
        </code>
        <span className="text-sm text-zinc-500 dark:text-zinc-400 hidden sm:block truncate max-w-xs">
          {ep.summary}
        </span>
        {open
          ? <ChevronDown className="shrink-0 h-4 w-4 text-zinc-400" />
          : <ChevronRight className="shrink-0 h-4 w-4 text-zinc-400" />
        }
      </button>

      {/* Body */}
      {open && (
        <div className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-4 space-y-4">
          {/* Description */}
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {ep.description}
          </p>

          {/* Full URL */}
          <div className="flex items-center gap-2 rounded-md bg-zinc-50 dark:bg-zinc-800 px-3 py-2">
            <code className="flex-1 text-xs font-mono text-zinc-600 dark:text-zinc-300 truncate">{fullPath}</code>
            <CopyButton text={fullPath} />
          </div>

          {/* Auth */}
          <div className="flex items-start gap-2">
            <span className="shrink-0 text-xs font-semibold text-zinc-500 dark:text-zinc-400 pt-0.5 uppercase tracking-wide">Auth</span>
            <code className="text-xs font-mono text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded">
              {ep.auth}
            </code>
          </div>

          {/* Params */}
          {ep.params && ep.params.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">Parameters</p>
              <div className="rounded-md border border-zinc-200 dark:border-zinc-800 overflow-hidden divide-y divide-zinc-200 dark:divide-zinc-800">
                {ep.params.map(p => (
                  <div key={p.name} className="flex items-start gap-3 px-3 py-2 bg-white dark:bg-zinc-900/30">
                    <code className="shrink-0 text-xs font-mono font-semibold text-zinc-700 dark:text-zinc-200 pt-0.5 min-w-[100px]">
                      {p.name}
                      {p.required && <span className="text-rose-500 ml-0.5">*</span>}
                    </code>
                    <span className={cn("shrink-0 text-xs rounded px-1.5 py-0.5 font-medium mt-0.5", PARAM_IN_STYLES[p.in])}>
                      {p.in}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400 font-mono shrink-0 mt-0.5">
                      {p.type}
                    </span>
                    <span className="text-xs text-zinc-600 dark:text-zinc-400 flex-1">
                      {p.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body example */}
          {ep.bodyExample && (
            <CodeBlock code={ep.bodyExample} label="Request body / example" />
          )}

          {/* Response example */}
          {ep.responseExample && (
            <CodeBlock code={ep.responseExample} label="Response" />
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AgentApiReferencePage() {
  const [activeGroup, setActiveGroup] = React.useState<string | null>(null);

  const displayed = activeGroup
    ? API_GROUPS.filter(g => g.id === activeGroup)
    : API_GROUPS;

  const total = API_GROUPS.reduce((n, g) => n + g.endpoints.length, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2">
          <Code2 className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Agent API Reference</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
            {total} endpoints · Authentication via agent <code className="font-mono text-xs">callback_token</code>
          </p>
        </div>
      </div>

      {/* Base URL */}
      <div className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 px-4 py-3">
        <Zap className="h-4 w-4 text-zinc-400 shrink-0" />
        <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium shrink-0">Base URL</span>
        <code className="flex-1 text-xs font-mono text-zinc-700 dark:text-zinc-200">{BASE}</code>
        <CopyButton text={BASE} />
      </div>

      {/* Group filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveGroup(null)}
          className={cn(
            "rounded-full px-3 py-1 text-xs font-medium transition-colors",
            activeGroup === null
              ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          )}
        >
          All ({total})
        </button>
        {API_GROUPS.map(g => (
          <button
            key={g.id}
            onClick={() => setActiveGroup(v => v === g.id ? null : g.id)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors flex items-center gap-1.5",
              activeGroup === g.id
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
            )}
          >
            <span className={cn("h-2 w-2 rounded-full", g.color)} />
            {g.label} ({g.endpoints.length})
          </button>
        ))}
      </div>

      {/* Endpoint groups */}
      {displayed.map(group => (
        <div key={group.id} className="space-y-2">
          <div className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 rounded-full", group.color)} />
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{group.label}</h2>
            <span className="text-xs text-zinc-400">({group.endpoints.length})</span>
          </div>
          <div className="space-y-2">
            {group.endpoints.map(ep => (
              <EndpointCard key={ep.id} ep={ep} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
