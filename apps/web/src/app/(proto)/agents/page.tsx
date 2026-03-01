"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  Bot, Check, ChevronDown, Plus, Search, X, Zap,
  Activity, Trash2, Pencil, Building2, Users, Key, Copy, Upload, UserPlus, Link2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchAgents, fetchOrgs, createOrg, createOrgAgent, pingAgent,
  fetchAgentProjects, deleteAgent, updateAgent, updateOrg, deleteOrg,
  createInvite, type Org, type AgentProject,
} from "@/lib/api";
import type { Agent } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────
type ExtAgent = Agent & {
  org_id?: string; org_name?: string; org_slug?: string; org_type?: string;
  agent_type?: string; model?: string; provider?: string;
  capabilities?: string[]; ping_status?: string;
  last_ping_at?: string; last_seen_at?: string; callback_token?: string;
  last_ping_ms?: number;
  open_task_count?: number;
};
type StatusFilter = "all" | "online" | "offline" | "ai_agent" | "human";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(dateStr?: string): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_META: Record<string, { dot: string; label: string; text: string }> = {
  online:  { dot: "bg-emerald-400", label: "Online",  text: "text-emerald-600 dark:text-emerald-400" },
  away:    { dot: "bg-amber-400",   label: "Away",    text: "text-amber-600"   },
  offline: { dot: "bg-zinc-400",    label: "Offline", text: "text-zinc-400"    },
};

const PING_META: Record<string, { dot: string; label: string; cls: string }> = {
  ok:      { dot: "bg-emerald-400",            label: "OK",       cls: "text-emerald-600" },
  pending: { dot: "bg-amber-400 animate-pulse", label: "Pinging…", cls: "text-amber-600" },
  timeout: { dot: "bg-red-400",                 label: "Timeout",  cls: "text-red-600"   },
  unknown: { dot: "bg-zinc-400",                label: "Unknown",  cls: "text-zinc-400"  },
};

function pingLabel(status: string, ms?: number) {
  if (status === "ok") return ms != null ? `OK · ${ms}ms` : "OK";
  return PING_META[status]?.label ?? "Unknown";
}

const AGENT_TYPES   = ["ai_agent", "human"] as const;
type AgentType = typeof AGENT_TYPES[number];
const PROVIDERS     = ["anthropic", "openai", "google", "mistral", "other"];
const CAPABILITIES  = ["code", "design", "ux", "review", "api", "infra", "deploy", "plan", "data", "writing"];
const POPULAR_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6", "gpt-4o", "gpt-4-turbo", "gemini-1.5-pro", "mistral-large"];

const TYPE_BADGE: Record<string, string> = {
  ai_agent: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
  human:    "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
};
const TYPE_LABEL: Record<string, string> = { ai_agent: "AI Agent", human: "Human" };

// ─── Column config ─────────────────────────────────────────────────────────────
const COLS = [
  { label: "Name",         cls: "flex-1 min-w-0"  },
  { label: "Type",         cls: "w-24 shrink-0"   },
  { label: "Model",        cls: "w-36 shrink-0"   },
  { label: "Capabilities", cls: "w-48 shrink-0"   },
  { label: "Ping",         cls: "w-24 shrink-0"   },
  { label: "Last seen",    cls: "w-24 shrink-0"   },
  { label: "Tasks",        cls: "w-14 shrink-0 text-center" },
  { label: "",             cls: "w-16 shrink-0"   },
];

// ─── Agent Row ────────────────────────────────────────────────────────────────
function AgentRow({ agent, onInspect, onPing, onDelete, pinging }: {
  agent: ExtAgent;
  onInspect: () => void;
  onPing: () => void;
  onDelete: () => void;
  pinging: boolean;
}) {
  const sm = STATUS_META[agent.status] ?? STATUS_META.offline;
  const pingKey = pinging ? "pending" : (agent.ping_status ?? "unknown");
  const pm = PING_META[pingKey] ?? PING_META.unknown;
  const caps = Array.isArray(agent.capabilities) ? agent.capabilities : [];

  return (
    <div
      onClick={onInspect}
      className="group flex cursor-pointer items-center gap-3 border-b border-zinc-100 px-4 py-2.5 hover:bg-zinc-50 dark:border-[#2D2A45] dark:hover:bg-white/5 transition-colors"
    >
      {/* Status dot */}
      <span className={cn("h-2 w-2 shrink-0 rounded-full", sm.dot)} />

      {/* Name + desc */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
          agent.agent_type === "human" ? "bg-sky-700" : "bg-zinc-800 dark:bg-zinc-700"
        )}>
          {agent.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</div>
          {agent.desc && (
            <div className="truncate text-[11px] text-zinc-400">{agent.desc}</div>
          )}
        </div>
      </div>

      {/* Type */}
      <div className="w-24 shrink-0">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", TYPE_BADGE[agent.agent_type ?? "ai_agent"])}>
          {TYPE_LABEL[agent.agent_type ?? "ai_agent"] ?? agent.agent_type}
        </span>
      </div>

      {/* Model */}
      <div className="w-36 shrink-0">
        {agent.model
          ? <div className="flex flex-col gap-0.5">
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{agent.model}</span>
              {agent.last_ping_at && <span className="text-[9px] text-zinc-400/60" title={`Last reported at ${new Date(agent.last_ping_at).toLocaleString()}`}>as of {relativeTime(agent.last_ping_at)}</span>}
            </div>
          : <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
        }
      </div>

      {/* Capabilities */}
      <div className="w-48 shrink-0">
        <div className="flex flex-wrap gap-1">
          {caps.slice(0, 3).map(c => (
            <span key={c} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{c}</span>
          ))}
          {caps.length > 3 && (
            <span className="text-[10px] text-zinc-400">+{caps.length - 3}</span>
          )}
          {caps.length === 0 && <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>}
        </div>
        {caps.length > 0 && agent.last_ping_at && (
          <span className="text-[9px] text-zinc-400/60">as of {relativeTime(agent.last_ping_at)}</span>
        )}
      </div>

      {/* Ping */}
      <div className="w-24 shrink-0 flex items-center gap-1">
        <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", pm.dot)} />
        <span className={cn("text-[11px] font-medium truncate", pm.cls)}>
          {pingLabel(pingKey, agent.last_ping_ms)}
        </span>
      </div>

      {/* Last seen */}
      <div className="w-24 shrink-0 text-[11px] text-zinc-400">
        {relativeTime(agent.last_seen_at)}
      </div>

      {/* Open tasks */}
      <div className="w-14 shrink-0 flex items-center justify-center">
        {(agent.open_task_count ?? 0) > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            {agent.open_task_count}
          </span>
        ) : (
          <span className="text-[11px] text-zinc-300 dark:text-zinc-600">—</span>
        )}
      </div>

      {/* Row actions — show on hover */}
      <div className="w-16 shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={e => { e.stopPropagation(); onPing(); }}
          disabled={pinging}
          title="Ping"
          className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 transition-colors">
          <Zap className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title="Delete"
          className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Org Section ──────────────────────────────────────────────────────────────
function OrgSection({ org, agents, onInspect, onPing, onDelete, onAddAgent, pingingIds }: {
  org: Org; agents: ExtAgent[];
  onInspect: (a: ExtAgent) => void;
  onPing: (id: string) => void;
  onDelete: (a: ExtAgent) => void;
  onAddAgent: (orgId: string) => void;
  pingingIds: Set<string>;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const onlineCount = agents.filter(a => a.status === "online").length;

  const role = org.my_role ?? "owner";
  const orgTypeCls =
    role === "owner"       ? "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300" :
    role === "admin"       ? "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300"         :
    role === "contributor" ? "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300"     :
                             "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400";

  return (
    <div className="mb-2">
      {/* Section header */}
      <div className="flex items-center gap-2 px-2 py-2">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <div className={cn("h-4 w-1 shrink-0 rounded-full",
            role === "owner" ? "bg-purple-500" : role === "admin" ? "bg-blue-500" :
            role === "contributor" ? "bg-brand-500" : "bg-zinc-400")} />
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform", collapsed && "-rotate-90")} />
          <span className="font-display font-bold text-zinc-900 dark:text-white text-sm">{org.name}</span>
          <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize", orgTypeCls)}>{role}</span>
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-semibold text-zinc-500 dark:bg-white/10">
            {agents.length}
          </span>
          {onlineCount > 0 && (
            <span className="text-xs text-emerald-500 font-medium">{onlineCount} online</span>
          )}
        </button>
        <button
          onClick={() => onAddAgent(org.id)}
          className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-300 transition-colors">
          <Plus className="h-3 w-3" /> Add
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A] mx-2">
          {/* Column headers */}
          <div className="flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
            <div className="w-2 shrink-0 mr-3" />{/* status dot placeholder */}
            {COLS.map(c => (
              <div key={c.label} className={cn("text-[11px] font-semibold uppercase tracking-wide text-zinc-400", c.cls)}>
                {c.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {agents.length === 0 ? (
            <div className="px-8 py-6 text-center text-sm text-zinc-400">
              No agents yet.{" "}
              <button onClick={() => onAddAgent(org.id)} className="text-brand-600 hover:underline">Add one</button>
            </div>
          ) : (
            agents.map(a => (
              <AgentRow
                key={a.id}
                agent={a}
                onInspect={() => onInspect(a)}
                onPing={() => onPing(a.id)}
                onDelete={() => onDelete(a)}
                pinging={pingingIds.has(a.id)}
              />
            ))
          )}

          {/* Add row */}
          <button
            onClick={() => onAddAgent(org.id)}
            className="flex w-full items-center gap-2 border-t border-dashed border-zinc-200 px-6 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:border-[#2D2A45] dark:hover:bg-white/5 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add agent
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Agent Credentials Panel ─────────────────────────────────────────────────
const BASE_URL = "https://darshan.caringgems.in/api/backend/api/v1";

function AgentCredentialsPanel({ agent }: { agent: ExtAgent }) {
  const agentId  = agent.id;
  const token    = agent.callback_token ?? "";
  const inboxUrl = `${BASE_URL}/agents/${agentId}/inbox`;
  const ackUrl   = `${BASE_URL}/agents/${agentId}/inbox/ack`;
  const [revealed, setRevealed] = React.useState(false);
  const [copied,   setCopied]   = React.useState<string | null>(null);

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  const heartbeatBlock =
`## Darshan Agent Inbox — ${agent.name}
AGENT_ID:  ${agentId}
TOKEN:     ${token}
INBOX_URL: ${inboxUrl}
ACK_URL:   ${ackUrl}

### Steps (run on every heartbeat):
1. GET INBOX_URL with header: Authorization: Bearer ${token}
   (use the TOKEN value above — replace literal "TOKEN" with the value if your config tool requires it)
2. For each pending item, handle by type:

**type = "ping"**
- POST to ACK_URL: { inbox_id, callback_token: "${token}", response: "pong — ${agent.name} online" }

**type = "welcome"**
- Read payload.heartbeat_config — this is the full HEARTBEAT.md block you need
- Write it to your ~/.openclaw/workspace/HEARTBEAT.md (append the Darshan section)
- POST to ACK_URL: { inbox_id, callback_token: "${token}", response: "setup complete — ${agent.name} ready" }

**type = "task_assigned"**
- PATCH task to in-progress: PATCH https://darshan.caringgems.in/api/backend/api/v1/projects/{project_id}/tasks/{task_id} with body { "status": "in-progress" }
- Execute the task
- POST to ACK_URL: { inbox_id, callback_token: "${token}", response: "picked up — working on: {title}" }

**Any other type**
- POST to ACK_URL: { inbox_id, callback_token: "${token}", response: "ack" }`;

  function CopyRow({ label, value, id }: { label: string; value: string; id: string }) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
        <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100 dark:bg-white/5 dark:ring-white/10">
          <code className="min-w-0 flex-1 truncate text-xs font-mono text-zinc-700 dark:text-zinc-300">{value}</code>
          <button onClick={() => copy(value, id)}
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 transition-colors">
            {copied === id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Warning */}
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
        <span className="text-base leading-none">⚠️</span>
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Keep these credentials secret. Anyone with this token can read and acknowledge this agent&apos;s inbox.
        </p>
      </div>

      {/* Credentials */}
      <CopyRow label="Agent ID" value={agentId} id="agent_id" />

      {/* Token with reveal toggle */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Callback Token</span>
          <button onClick={() => setRevealed(r => !r)}
            className="text-[10px] text-brand-600 hover:underline">{revealed ? "Hide" : "Reveal"}</button>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-zinc-50 px-3 py-2 ring-1 ring-zinc-100 dark:bg-white/5 dark:ring-white/10">
          <code className="min-w-0 flex-1 truncate text-xs font-mono text-zinc-700 dark:text-zinc-300">
            {revealed ? token : "•".repeat(Math.min(token.length, 28))}
          </code>
          <button onClick={() => copy(token, "token")}
            className="shrink-0 rounded p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 transition-colors">
            {copied === "token" ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <CopyRow label="Inbox URL" value={inboxUrl} id="inbox_url" />
      <CopyRow label="Ack URL"   value={ackUrl}   id="ack_url"   />

      {/* Instructions */}
      <div className="rounded-xl bg-violet-50 p-3 dark:bg-violet-500/10">
        <p className="mb-2 text-xs font-semibold text-violet-700 dark:text-violet-300">📋 Setup instructions for your friend</p>
        <ol className="list-decimal list-inside space-y-1 text-xs text-violet-600 dark:text-violet-400">
          <li>Install OpenClaw on their machine</li>
          <li>Open <code className="rounded bg-violet-100 px-1 dark:bg-violet-500/20">~/.openclaw/workspace/HEARTBEAT.md</code></li>
          <li>Paste the config block below into it</li>
          <li>OpenClaw will start polling Darshan on every heartbeat (~30 min)</li>
        </ol>
      </div>

      {/* Ready-to-paste block */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Paste into HEARTBEAT.md</span>
          <button onClick={() => copy(heartbeatBlock, "heartbeat")}
            className="flex items-center gap-1 text-[10px] font-semibold text-brand-600 hover:underline">
            {copied === "heartbeat"
              ? <><Check className="h-3 w-3 text-emerald-500" /> Copied!</>
              : <><Copy className="h-3 w-3" /> Copy all</>}
          </button>
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-zinc-900 p-3 text-[10px] leading-relaxed text-zinc-300 dark:bg-black/40">
          {heartbeatBlock}
        </pre>
      </div>
    </div>
  );
}

// ─── Agent ID Row ─────────────────────────────────────────────────────────────
function AgentIdRow({ id }: { id: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  return (
    <div className="mt-1.5 flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">ID</span>
      <code className="flex-1 truncate rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
        {id}
      </code>
      <button onClick={copy} title="Copy ID"
        className="shrink-0 rounded px-1 py-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10 transition-colors">
        {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
      </button>
    </div>
  );
}

// ─── Agent Detail Panel ───────────────────────────────────────────────────────
function AgentDetailPanel({ agent, onClose, onPing, onRemove, onUpdated, pinging }: {
  agent: ExtAgent; onClose: () => void;
  onPing: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdated: () => void;
  pinging: boolean;
}) {
  const sm  = STATUS_META[agent.status] ?? STATUS_META.offline;
  const pingKey = pinging ? "pending" : (agent.ping_status ?? "unknown");
  const pm  = PING_META[pingKey] ?? PING_META.unknown;
  const [projects, setProjects] = React.useState<AgentProject[]>([]);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const [showCreds, setShowCreds]       = React.useState(false);
  const [editing, setEditing]           = React.useState(false);
  React.useEffect(() => { setShowCreds(false); setEditing(false); }, [agent.id]);
  const [editName, setEditName]         = React.useState(agent.name);
  const [editDesc, setEditDesc]         = React.useState(agent.desc ?? "");
  const [editType, setEditType]         = React.useState<AgentType>((agent.agent_type as AgentType) ?? "ai_agent");
  const [editModel, setEditModel]       = React.useState(agent.model ?? "");
  const [editProvider, setEditProvider] = React.useState(agent.provider ?? "anthropic");
  const [editCaps, setEditCaps]         = React.useState<string[]>(Array.isArray(agent.capabilities) ? agent.capabilities : []);
  const [saving, setSaving]             = React.useState(false);

  function startEdit() {
    setShowCreds(false);
    setEditName(agent.name); setEditDesc(agent.desc ?? "");
    setEditType((agent.agent_type as AgentType) ?? "ai_agent");
    setEditModel(agent.model ?? ""); setEditProvider(agent.provider ?? "anthropic");
    setEditCaps(Array.isArray(agent.capabilities) ? agent.capabilities : []); setEditing(true);
  }
  async function saveEdit() {
    setSaving(true);
    await updateAgent(agent.id, {
      name: editName.trim(), desc: editDesc.trim(),
      agent_type: editType, model: editModel, provider: editProvider, capabilities: editCaps,
    });
    setSaving(false); setEditing(false); onUpdated();
  }
  function toggleCap(c: string) { setEditCaps(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]); }

  React.useEffect(() => { fetchAgentProjects(agent.id).then(setProjects); }, [agent.id]);

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A] animate-slide-in-right">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-[#2D2A45]">
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
          agent.agent_type === "human" ? "bg-sky-700" : "bg-zinc-800")}>
          {agent.name[0]?.toUpperCase()}
        </div>
        <span className="flex-1 truncate font-display font-bold text-zinc-900 dark:text-white">
          {editing ? <span className="text-brand-600">Editing</span> : agent.name}
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", TYPE_BADGE[agent.agent_type ?? "ai_agent"])}>
          {TYPE_LABEL[agent.agent_type ?? "ai_agent"]}
        </span>
        {!editing && (
          <>
            <button onClick={() => setShowCreds(s => !s)} title="Credentials"
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg transition-colors",
                showCreds
                  ? "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400"
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
              )}>
              <Key className="h-3.5 w-3.5" />
            </button>
            <button onClick={startEdit} title="Edit"
              className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setConfirmDelete(true)} title="Delete"
              className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="mx-4 mt-3 shrink-0 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/20 dark:bg-red-500/10">
          <p className="text-sm font-semibold text-red-700 dark:text-red-400">Remove {agent.name}?</p>
          <p className="mt-0.5 text-xs text-red-500">Removes from all projects. Cannot be undone.</p>
          <div className="mt-3 flex gap-2">
            <button onClick={async () => { setDeleting(true); await onRemove(agent.id); }}
              disabled={deleting}
              className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {deleting ? "Removing…" : "Yes, remove"}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="flex-1 rounded-lg ring-1 ring-zinc-200 py-1.5 text-xs font-semibold text-zinc-600 dark:ring-white/10 dark:text-zinc-400">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showCreds && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]" onClick={() => setShowCreds(false)} />
          <div className="relative z-10 flex w-[480px] max-h-[90vh] flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
            <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
              <span className="font-display text-sm font-semibold text-zinc-900 dark:text-white">🔑 Agent Credentials — {agent.name}</span>
              <button onClick={() => setShowCreds(false)} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AgentCredentialsPanel agent={agent} />
            </div>
          </div>
        </div>,
        document.body
      )}

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 flex flex-col gap-5">
        {editing ? (
          /* ── Edit Mode ── */
          <>
            <div className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Name</label>
                <input value={editName} onChange={e => setEditName(e.target.value)} className={sel} />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Description</label>
                <textarea value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3}
                  className={cn(sel, "resize-none")} placeholder="What does this agent do?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Type</label>
                  <select value={editType} onChange={e => setEditType(e.target.value as AgentType)} className={sel}>
                    <option value="ai_agent">AI Agent</option>
                    <option value="human">Human</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Provider</label>
                  <select value={editProvider} onChange={e => setEditProvider(e.target.value)} className={sel}>
                    {PROVIDERS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Model</label>
                <select value={editModel} onChange={e => setEditModel(e.target.value)} className={sel}>
                  <option value="">— none —</option>
                  {POPULAR_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Capabilities</label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {CAPABILITIES.map(c => (
                    <button key={c} onClick={() => toggleCap(c)}
                      className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                        editCaps.includes(c)
                          ? "bg-brand-600 text-white ring-brand-600"
                          : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10")}>
                      {editCaps.includes(c) && <Check className="h-3 w-3" />}{c}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-zinc-100 pt-4 dark:border-white/5">
              <button onClick={() => setEditing(false)}
                className="flex-1 rounded-xl py-2 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-400 dark:ring-white/10">
                Cancel
              </button>
              <button onClick={saveEdit} disabled={saving || !editName.trim()}
                className="flex-1 rounded-xl bg-brand-600 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : (
          /* ── View Mode ── */
          <>
            {/* Status + identity */}
            <div className="flex items-start gap-3">
              <div className={cn("relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white",
                agent.agent_type === "human" ? "bg-sky-700" : "bg-zinc-800")}>
                {agent.name[0]?.toUpperCase()}
                <span className={cn("absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white dark:ring-[#16132A]", sm.dot)} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-display text-xl font-extrabold text-zinc-900 dark:text-white">{agent.name}</div>
                <div className={cn("text-sm font-medium", sm.text)}>{sm.label} · {relativeTime(agent.last_seen_at)}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {agent.model && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono text-zinc-500 dark:bg-white/10">{agent.model}</span>}
                  {agent.provider && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 dark:bg-white/10">{agent.provider}</span>}
                </div>
                <AgentIdRow id={agent.id} />
              </div>
            </div>

            {agent.desc && (
              <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">{agent.desc}</p>
              </div>
            )}

            {agent.org_name && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Organisation</p>
                <div className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                  <Building2 className="h-4 w-4 text-zinc-400 shrink-0" />
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{agent.org_name}</span>
                  <span className="ml-auto rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 capitalize">
                    {agent.org_type}
                  </span>
                </div>
              </div>
            )}

            {/* Capabilities */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Capabilities</p>
              {(Array.isArray(agent.capabilities) ? agent.capabilities : []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {(Array.isArray(agent.capabilities) ? agent.capabilities : []).map(c => (
                    <span key={c} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{c}</span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No capabilities listed</p>
              )}
            </div>

            {/* Open tasks */}
            <div className="flex items-center justify-between rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Open Tasks</p>
                <p className="text-[11px] text-zinc-400 mt-0.5">backlog · approved · in-progress · review</p>
              </div>
              <span className={cn(
                "rounded-full px-3 py-1 text-sm font-bold",
                (agent.open_task_count ?? 0) > 0
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
                  : "bg-zinc-100 text-zinc-400 dark:bg-white/10"
              )}>
                {agent.open_task_count ?? 0}
              </span>
            </div>

            {/* Connectivity */}
            <div className="rounded-xl bg-zinc-50 p-4 dark:bg-white/5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Connectivity</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <span className={cn("h-2 w-2 rounded-full", pm.dot)} />
                  <span className={cn("font-semibold", pm.cls)}>
                    {pingLabel(pingKey, agent.last_ping_ms)}
                  </span>
                  {agent.last_ping_at && (
                    <span className="text-zinc-400 text-xs">· {relativeTime(agent.last_ping_at)}</span>
                  )}
                </div>
                <button
                  onClick={() => onPing(agent.id)}
                  disabled={pinging}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors",
                    pinging
                      ? "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                      : "bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/10"
                  )}>
                  <Zap className="h-3.5 w-3.5" />
                  {pinging ? "Pinging…" : "Ping"}
                </button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-zinc-400">
                <Activity className="h-3.5 w-3.5" />
                <span className="font-mono">{(agent as unknown as { endpoint_type?: string }).endpoint_type ?? "openclaw_poll"}</span>
              </div>
            </div>

            {/* Assigned projects */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Projects {projects.length > 0 && `(${projects.length})`}
              </p>
              {projects.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  {projects.map(p => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                      <div className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-brand-700 text-xs font-bold text-white">
                        {p.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-200">{p.name}</div>
                        {p.role && <div className="text-[11px] text-zinc-400 capitalize">{p.role}</div>}
                      </div>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                        p.status === "active"  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                        p.status === "planned" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500")}>
                        {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">Not assigned to any projects</p>
              )}
            </div>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// ─── Onboard Agent Modal ──────────────────────────────────────────────────────
function OnboardAgentModal({ orgs, defaultOrgId, onDone, onClose }: {
  orgs: Org[]; defaultOrgId?: string; onDone: () => void; onClose: () => void;
}) {
  const [orgId,       setOrgId]       = React.useState(defaultOrgId ?? orgs[0]?.id ?? "");
  const [name,        setName]        = React.useState("");
  const [desc,        setDesc]        = React.useState("");
  const [agentType,   setAgentType]   = React.useState<AgentType>("ai_agent");
  const [endpointType, setEndpointType] = React.useState("openclaw_poll");
  const [saving,      setSaving]      = React.useState(false);
  const [error,       setError]       = React.useState("");

  async function handleSave() {
    if (!name.trim() || !orgId) { setError("Name and organisation are required."); return; }
    setSaving(true); setError("");
    const ok = await createOrgAgent(orgId, {
      name: name.trim(), desc: desc.trim() || undefined,
      agent_type: agentType, endpoint_type: endpointType,
    });
    if (ok) onDone();
    else { setError("Failed to onboard agent."); setSaving(false); }
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  const ENDPOINT_TIPS: Record<string, string> = {
    openclaw_poll: "Agent polls OpenClaw for tasks.",
    webhook: "Darshan pushes tasks to the agent's URL.",
    manual: "Human-operated. Tasks handled manually.",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">New Agent</div>
            <div className="mt-0.5 text-xs text-zinc-500">Register an agent under an organisation</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Organisation <span className="text-red-500">*</span></label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)} className={sel}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Name <span className="text-red-500">*</span></label>
              <Input autoFocus placeholder="e.g. Komal, Sanjaya…" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Type</label>
              <select value={agentType} onChange={e => setAgentType(e.target.value as AgentType)} className={sel}>
                <option value="ai_agent">AI Agent</option>
                <option value="human">Human</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <Input placeholder="What does this agent do?" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          {agentType === "ai_agent" && (
            <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">Model &amp; capabilities</span> are self-reported by the agent on its first ping — no need to set them here.
            </div>
          )}
          {agentType === "ai_agent" && (
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Connection type</label>
              <select value={endpointType} onChange={e => setEndpointType(e.target.value)} className={sel}>
                <option value="openclaw_poll">OpenClaw (poll-based)</option>
                <option value="webhook">Webhook (push)</option>
                <option value="manual">Manual</option>
              </select>
              <p className="mt-1 text-[11px] text-zinc-400">{ENDPOINT_TIPS[endpointType]}</p>
            </div>
          )}
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!name || !orgId || saving}>
            {saving ? "Creating…" : "Create Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Invite Agent Modal ───────────────────────────────────────────────────────
function InviteAgentModal({ orgs, onClose }: { orgs: Org[]; onClose: () => void }) {
  const ownOrg = orgs.find(o => o.my_role === "owner");
  const [orgId,    setOrgId]    = React.useState(ownOrg?.id ?? orgs[0]?.id ?? "");
  const [label,    setLabel]    = React.useState("");
  const [loading,  setLoading]  = React.useState(false);
  const [copied,   setCopied]   = React.useState(false);
  const [result,   setResult]   = React.useState<{ invite_url: string; expires_at: string } | null>(null);
  const [error,    setError]    = React.useState("");

  async function handleGenerate() {
    setLoading(true); setError("");
    const data = await createInvite(orgId, label.trim() || undefined);
    if (data) setResult(data);
    else setError("Failed to create invite link.");
    setLoading(false);
  }

  function copyLink() {
    if (!result) return;
    navigator.clipboard.writeText(result.invite_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const inp = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";
  const sel = inp + " cursor-pointer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Invite Agent</div>
            <div className="mt-0.5 text-xs text-zinc-500">Generate a one-time link — valid 24 hours</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          {!result ? (
            <>
              {/* Org */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Organisation</label>
                <select value={orgId} onChange={e => setOrgId(e.target.value)} className={sel}>
                  {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </div>

              {/* Label */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Label <span className="font-normal text-zinc-400">(optional — shown to the recipient)</span>
                </label>
                <input
                  value={label}
                  onChange={e => setLabel(e.target.value)}
                  placeholder="e.g. For Alex's coding agent"
                  className={inp}
                />
              </div>

              {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
            </>
          ) : (
            <>
              {/* Invite URL */}
              <div className="rounded-xl bg-emerald-50 p-4 ring-1 ring-emerald-200 dark:bg-emerald-500/5 dark:ring-emerald-500/20">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <Check className="h-3.5 w-3.5" /> Invite link generated
                </p>
                <code className="block break-all text-[11px] text-zinc-700 dark:text-zinc-300">{result.invite_url}</code>
                <p className="mt-2 text-[10px] text-zinc-400">
                  Expires {new Date(result.expires_at).toLocaleString()} · One-time use
                </p>
              </div>
              <p className="text-xs text-zinc-500">
                Send this link to your friend. Their agent registers directly and receives credentials that only they see.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <button onClick={onClose} className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-white/5">
            {result ? "Close" : "Cancel"}
          </button>
          {!result ? (
            <button
              onClick={handleGenerate}
              disabled={!orgId || loading}
              className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors shadow-lg"
            >
              <Link2 className="h-4 w-4" />
              {loading ? "Generating…" : "Generate Link"}
            </button>
          ) : (
            <button
              onClick={copyLink}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied!" : "Copy Link"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Import Agent Modal ───────────────────────────────────────────────────────
type ImportPayload = {
  name?: string; desc?: string; agent_type?: string;
  provider?: string; model?: string;
  capabilities?: string[]; endpoint_type?: string;
};

function ImportAgentModal({ orgs, onDone, onClose }: {
  orgs: Org[]; onDone: () => void; onClose: () => void;
}) {
  const [raw,    setRaw]    = React.useState("");
  const [orgId,  setOrgId]  = React.useState(orgs.find(o => o.my_role === "owner")?.id ?? orgs[0]?.id ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error,  setError]  = React.useState("");

  // Parse JSON live
  const parsed: ImportPayload | null = React.useMemo(() => {
    if (!raw.trim()) return null;
    try { return JSON.parse(raw) as ImportPayload; } catch { return null; }
  }, [raw]);

  const parseError = raw.trim() && !parsed ? "Invalid JSON — check the format." : "";
  const caps = Array.isArray(parsed?.capabilities) ? parsed!.capabilities : [];

  async function handleImport() {
    if (!parsed?.name?.trim()) { setError("Name is required."); return; }
    if (!orgId) { setError("Select an organisation."); return; }
    setSaving(true); setError("");
    const ok = await createOrgAgent(orgId, {
      name:          parsed.name.trim(),
      desc:          parsed.desc?.trim(),
      agent_type:    parsed.agent_type ?? "ai_agent",
      model:         parsed.model,
      provider:      parsed.provider ?? "anthropic",
      capabilities:  caps,
      endpoint_type: parsed.endpoint_type ?? "openclaw_poll",
    });
    if (ok) onDone();
    else { setError("Failed to create agent."); setSaving(false); }
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Import Agent</div>
            <div className="mt-0.5 text-xs text-zinc-500">Paste an agent card JSON to register instantly</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">

          {/* Paste area */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Agent Card JSON
            </label>
            <textarea
              autoFocus
              rows={7}
              value={raw}
              onChange={e => { setRaw(e.target.value); setError(""); }}
              placeholder={`{\n  "name": "Sanjaya",\n  "agent_type": "ai_agent",\n  "provider": "anthropic",\n  "model": "claude-sonnet-4-6",\n  "capabilities": ["code", "review", "plan"],\n  "endpoint_type": "openclaw_poll"\n}`}
              className="w-full rounded-xl bg-zinc-50 px-3 py-2.5 font-mono text-xs text-zinc-800 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700 resize-none"
            />
            {parseError && <p className="mt-1 text-[11px] text-red-500">{parseError}</p>}
          </div>

          {/* Live preview */}
          {parsed && (
            <div className="rounded-xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Preview</p>
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-800 text-base font-bold text-white">
                  {parsed.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-zinc-900 dark:text-white">{parsed.name || <span className="text-zinc-400">No name</span>}</div>
                  {parsed.desc && <div className="mt-0.5 text-xs text-zinc-500">{parsed.desc}</div>}
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {parsed.model && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{parsed.model}</span>}
                    {parsed.provider && <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{parsed.provider}</span>}
                    {caps.map(c => <span key={c} className="rounded bg-brand-100 px-1.5 py-0.5 text-[11px] text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{c}</span>)}
                  </div>
                </div>
                <Check className="h-4 w-4 shrink-0 text-emerald-500 mt-1" />
              </div>
            </div>
          )}

          {/* Org selector */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Add to Organisation <span className="text-red-500">*</span>
            </label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)} className={sel}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="sm"
            onClick={handleImport}
            disabled={!parsed?.name || !orgId || saving || !!parseError}
          >
            <Upload className="h-3.5 w-3.5" />
            {saving ? "Importing…" : "Import Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────
function DeleteAgentConfirm({ agent, onConfirm, onClose, deleting }: {
  agent: ExtAgent; onConfirm: () => void; onClose: () => void; deleting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-red-100 dark:bg-red-500/10">
          <Trash2 className="h-6 w-6 text-red-600 dark:text-red-400" />
        </div>
        <h3 className="font-display text-base font-bold text-zinc-900 dark:text-white">Remove {agent.name}?</h3>
        <p className="mt-2 text-sm text-zinc-500">
          This will remove the agent from all projects and delete their record permanently.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={onClose}
            className="flex-1 rounded-xl py-2 text-sm font-semibold text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-400 dark:ring-white/10">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={deleting}
            className="flex-1 rounded-xl bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
            {deleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [orgs,         setOrgs]         = React.useState<Org[]>([]);
  const [agents,       setAgents]       = React.useState<ExtAgent[]>([]);
  const [loading,      setLoading]      = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [query,        setQuery]        = React.useState("");
  const [pingingIds,   setPingingIds]   = React.useState<Set<string>>(new Set());
  const [detailAgent,  setDetailAgent]  = React.useState<ExtAgent | null>(null);
  const [showAgentModal,  setShowAgentModal]  = React.useState(false);
  const [agentModalOrgId, setAgentModalOrgId] = React.useState<string | undefined>();
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [showInviteModal, setShowInviteModal] = React.useState(false);
  const [deleteTarget,    setDeleteTarget]    = React.useState<ExtAgent | null>(null);
  const [deleting,        setDeleting]        = React.useState(false);

  async function reload() {
    const [os, ag] = await Promise.all([fetchOrgs(), fetchAgents()]);
    setOrgs(os);
    setAgents(ag as ExtAgent[]);
    setLoading(false);
  }
  React.useEffect(() => { reload(); }, []);

  async function handlePing(agentId: string) {
    setPingingIds(s => new Set(s).add(agentId));
    await pingAgent(agentId);
    setTimeout(() => {
      reload();
      setPingingIds(s => { const n = new Set(s); n.delete(agentId); return n; });
    }, 8000);
  }

  async function handleDelete(agentId: string) {
    setDeleting(true);
    await deleteAgent(agentId);
    setDeleting(false);
    setDeleteTarget(null);
    setDetailAgent(null);
    reload();
  }

  function openAgentModal(orgId?: string) {
    setAgentModalOrgId(orgId);
    setShowAgentModal(true);
  }

  // Derived
  const totalOnline = agents.filter(a => a.status === "online").length;
  const aiCount     = agents.filter(a => a.agent_type === "ai_agent").length;
  const humanCount  = agents.filter(a => a.agent_type === "human").length;

  // Filter
  const filtered = agents.filter(a => {
    if (statusFilter === "online"   && a.status !== "online") return false;
    if (statusFilter === "offline"  && a.status === "online") return false;
    if (statusFilter === "ai_agent" && a.agent_type !== "ai_agent") return false;
    if (statusFilter === "human"    && a.agent_type !== "human") return false;
    if (query) {
      const q = query.toLowerCase();
      if (![a.name, a.desc ?? "", a.model ?? "", a.org_name ?? "", ...(Array.isArray(a.capabilities) ? a.capabilities : [])].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const ownOrg      = orgs.find(o => o.my_role === "owner");
  const externalOrgs = orgs.filter(o => o.my_role !== "owner");
  const agentsFor   = (orgId: string) => filtered.filter(a => a.org_id === orgId);
  const unassigned  = filtered.filter(a => !a.org_id);

  const STATUS_TABS: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all",      label: "All",      count: agents.length },
    { id: "online",   label: "Online",   count: agents.filter(a => a.status === "online").length },
    { id: "offline",  label: "Offline",  count: agents.filter(a => a.status !== "online").length },
    { id: "ai_agent", label: "AI Agent", count: aiCount },
    { id: "human",    label: "Human",    count: humanCount },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agents</h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                {agents.length} agents · {totalOnline} online · {orgs.length} orgs
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowInviteModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
                <UserPlus className="h-4 w-4" /> Invite
              </button>
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
                <Upload className="h-4 w-4" /> Import
              </button>
              <button
                onClick={() => openAgentModal(ownOrg?.id)}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                <Plus className="h-4 w-4" /> New Agent
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-4">
            {[
              { label: "Total",    value: agents.length, icon: Bot,     cls: "bg-brand-600"   },
              { label: "Online",   value: totalOnline,   icon: Zap,     cls: "bg-emerald-500" },
              { label: "AI Agent", value: aiCount,       icon: Bot,     cls: "bg-violet-500"  },
              { label: "Human",    value: humanCount,    icon: Users,   cls: "bg-sky-500"     },
            ].map(({ label, value, icon: Icon, cls }) => (
              <div key={label} className="flex flex-1 items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]">
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", cls)}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="font-display text-2xl font-extrabold leading-none text-zinc-900 dark:text-white">{value}</div>
                  <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter + search */}
          <div className="flex items-center border-b border-zinc-200 dark:border-[#2D2A45]">
            {STATUS_TABS.map(tab => (
              <button key={tab.id} onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors -mb-px",
                  statusFilter === tab.id
                    ? "border-brand-600 text-zinc-900 dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}>
                {tab.label}
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-white/10">{tab.count}</span>
              </button>
            ))}
            <div className="ml-auto pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agents…"
                  className="w-52 rounded-lg bg-zinc-100 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-white/10 dark:text-white" />
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
          ) : (
            <div>
              {/* Own org */}
              {ownOrg && (
                <OrgSection
                  org={ownOrg}
                  agents={agentsFor(ownOrg.id)}
                  onInspect={setDetailAgent}
                  onPing={handlePing}
                  onDelete={setDeleteTarget}
                  onAddAgent={openAgentModal}
                  pingingIds={pingingIds}
                />
              )}

              {/* External orgs */}
              {externalOrgs.length > 0 && (
                <>
                  <div className="my-4 flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">External</span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                  </div>
                  {externalOrgs.map(org => (
                    <OrgSection
                      key={org.id}
                      org={org}
                      agents={agentsFor(org.id)}
                      onInspect={setDetailAgent}
                      onPing={handlePing}
                      onDelete={setDeleteTarget}
                      onAddAgent={openAgentModal}
                      pingingIds={pingingIds}
                    />
                  ))}
                </>
              )}

              {/* Unassigned */}
              {unassigned.length > 0 && (
                <div className="mt-4">
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Unassigned</span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                  </div>
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white mx-2 dark:border-[#2D2A45] dark:bg-[#16132A]">
                    {unassigned.map(a => (
                      <AgentRow key={a.id} agent={a}
                        onInspect={() => setDetailAgent(a)}
                        onPing={() => handlePing(a.id)}
                        onDelete={() => setDeleteTarget(a)}
                        pinging={pingingIds.has(a.id)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {filtered.length === 0 && !loading && (
                <div className="py-20 text-center">
                  <Search className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No agents match</p>
                  <button onClick={() => { setStatusFilter("all"); setQuery(""); }}
                    className="mt-2 text-sm text-brand-600 hover:underline">× Clear filters</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {detailAgent && (
        <AgentDetailPanel
          agent={detailAgent}
          onClose={() => setDetailAgent(null)}
          onPing={id => { handlePing(id); setDetailAgent(a => a ? { ...a, ping_status: "pending" } : null); }}
          onRemove={async id => { await handleDelete(id); }}
          onUpdated={() => { reload(); setDetailAgent(null); }}
          pinging={pingingIds.has(detailAgent.id)}
        />
      )}

      {/* Invite agent modal */}
      {showInviteModal && (
        <InviteAgentModal
          orgs={orgs}
          onClose={() => setShowInviteModal(false)}
        />
      )}

      {/* Import agent modal */}
      {showImportModal && (
        <ImportAgentModal
          orgs={orgs}
          onDone={() => { setShowImportModal(false); reload(); }}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* New agent modal */}
      {showAgentModal && (
        <OnboardAgentModal
          orgs={orgs}
          defaultOrgId={agentModalOrgId}
          onDone={() => { setShowAgentModal(false); reload(); }}
          onClose={() => setShowAgentModal(false)}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <DeleteAgentConfirm
          agent={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}
    </div>
  );
}
