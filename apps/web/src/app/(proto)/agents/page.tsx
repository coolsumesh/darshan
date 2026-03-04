"use client";

import * as React from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  Bot, Check, Plus, Search, X, Zap,
  Activity, Trash2, Pencil, Key, Copy, Upload, Terminal, Download, Share2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchAgents, createAgent, pingAgent,
  fetchAgentProjects, deleteAgent, updateAgent,
  type AgentProject,
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
  platform?: string;
};
type StatusFilter = "all" | "online" | "offline";

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

const PROVIDERS     = ["anthropic", "openai", "google", "mistral", "other"];
const CAPABILITIES  = ["code", "design", "ux", "review", "api", "infra", "deploy", "plan", "data", "writing"];
const POPULAR_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6", "gpt-4o", "gpt-4-turbo", "gemini-1.5-pro", "mistral-large"];

// ─── Platform config ──────────────────────────────────────────────────────────
const PLATFORMS: { value: string; label: string }[] = [
  { value: "openclaw",       label: "OpenClaw"         },
  { value: "claude_code",    label: "Claude Code"      },
  { value: "cursor",         label: "Cursor"           },
  { value: "github_copilot", label: "GitHub Copilot"   },
  { value: "crewai",         label: "CrewAI"           },
  { value: "langchain",      label: "LangChain"        },
  { value: "autogen",        label: "AutoGen"          },
  { value: "agno",           label: "Agno"             },
  { value: "custom",         label: "Custom"           },
];
const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  PLATFORMS.map(p => [p.value, p.label])
);
function platformLabel(platform?: string): string {
  return PLATFORM_LABEL[platform ?? "openclaw"] ?? platform ?? "OpenClaw";
}
const PLATFORM_BADGE = "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300";

// ─── Column config ─────────────────────────────────────────────────────────────
const COLS = [
  { label: "Name",         cls: "flex-1 min-w-0"  },
  { label: "Platform",     cls: "w-24 shrink-0"   },
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
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-800 dark:bg-zinc-700 text-xs font-bold text-white">
          {agent.name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</div>
          {agent.desc && (
            <div className="truncate text-[11px] text-zinc-400">{agent.desc}</div>
          )}
        </div>
      </div>

      {/* Platform */}
      <div className="w-24 shrink-0">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", PLATFORM_BADGE)}>
          {platformLabel(agent.platform)}
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
2. GET ${BASE_URL}/agents/${agentId}/tasks?status=approved with header: Authorization: Bearer ${token}
3. For each pending item, handle by type:

**type = "ping"**
- POST to ACK_URL: { inbox_id, callback_token: "${token}", response: "pong — ${agent.name} online" }

**type = "welcome"**
- Read payload.heartbeat_config — this is the full HEARTBEAT.md block you need
- Write it to your ~/.openclaw/workspace/HEARTBEAT.md (append the Darshan section)
- POST to ACK_URL: { inbox_id, callback_token: "${token}", response: "setup complete — ${agent.name} ready" }

**type = "task_assigned"**
- PATCH task to in-progress: PATCH https://darshan.caringgems.in/api/backend/api/v1/projects/{project_id}/tasks/{task_id} with body { "status": "in-progress" }
- Execute the task
- If no human action is needed: PATCH task -> { "status": "done", "completion_note": "..." }
- If human validation is needed: PATCH task -> { "status": "review", "completion_note": "...", "assignee": "<Project Owner or Agent Owner>" }
- If blocked on human action: PATCH task -> { "status": "blocked", "completion_note": "...", "assignee": "<Project Owner or Agent Owner>" }
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
  const [showOnboard, setShowOnboard]   = React.useState(false);
  const [editing, setEditing]           = React.useState(false);
  React.useEffect(() => { setShowCreds(false); setShowOnboard(false); setEditing(false); }, [agent.id]);
  const [editName, setEditName]         = React.useState(agent.name);
  const [editDesc, setEditDesc]         = React.useState(agent.desc ?? "");
  const [editModel, setEditModel]       = React.useState(agent.model ?? "");
  const [editProvider, setEditProvider] = React.useState(agent.provider ?? "anthropic");
  const [editCaps, setEditCaps]         = React.useState<string[]>(Array.isArray(agent.capabilities) ? agent.capabilities : []);
  const [saving, setSaving]             = React.useState(false);

  function startEdit() {
    setShowCreds(false);
    setEditName(agent.name); setEditDesc(agent.desc ?? "");
    setEditModel(agent.model ?? ""); setEditProvider(agent.provider ?? "anthropic");
    setEditCaps(Array.isArray(agent.capabilities) ? agent.capabilities : []); setEditing(true);
  }
  async function saveEdit() {
    setSaving(true);
    await updateAgent(agent.id, {
      name: editName.trim(), desc: editDesc.trim(),
      agent_type: "ai_agent", model: editModel, provider: editProvider, capabilities: editCaps,
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
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-zinc-800 text-xs font-bold text-white">
          {agent.name[0]?.toUpperCase()}
        </div>
        <span className="flex-1 truncate font-display font-bold text-zinc-900 dark:text-white">
          {editing ? <span className="text-brand-600">Editing</span> : agent.name}
        </span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", PLATFORM_BADGE)}>
          {platformLabel(agent.platform)}
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
            <button onClick={() => setShowOnboard(true)} title="Onboard"
              className={cn(
                "grid h-7 w-7 place-items-center rounded-lg transition-colors",
                showOnboard
                  ? "bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-400"
                  : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
              )}>
              <Terminal className="h-3.5 w-3.5" />
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

      {showOnboard && createPortal(
        <AgentOnboardPanel agent={agent} onClose={() => setShowOnboard(false)} />,
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
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-500 uppercase tracking-wide">Provider</label>
                <select value={editProvider} onChange={e => setEditProvider(e.target.value)} className={sel}>
                  {PROVIDERS.map(p => <option key={p}>{p}</option>)}
                </select>
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
              <div className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-zinc-800 text-xl font-bold text-white">
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
                <span className="font-mono">{platformLabel(agent.platform)}</span>
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

            {/* Assign to Orgs & Projects */}
            <Link
              href={`/agents/${agent.id}/assign`}
              className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-200 px-4 py-3 text-sm font-semibold text-zinc-500 transition-colors hover:border-brand-400 hover:bg-brand-50/40 hover:text-brand-700 dark:border-[#2D2A45] dark:hover:border-brand-500/40 dark:hover:text-brand-400">
              <Share2 className="h-4 w-4" />
              Assign to Organisations &amp; Projects
            </Link>
          </>
        )}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Onboard Panel ─────────────────────────────────────────────────────
type OsTab = "linux" | "windows_ps" | "windows_cmd";
const OS_TABS: { id: OsTab; label: string }[] = [
  { id: "linux",       label: "Linux / macOS"    },
  { id: "windows_ps",  label: "Windows PS"       },
  { id: "windows_cmd", label: "Windows CMD"      },
];

function AgentOnboardPanel({ agent, onClose }: { agent: ExtAgent; onClose: () => void }) {
  const [os, setOs]       = React.useState<OsTab>("linux");
  const [copied, setCopied] = React.useState<string | null>(null);

  const agentSlug = agent.name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const agentId   = agent.id;
  const token     = agent.callback_token ?? "YOUR_TOKEN_HERE";
  const baseUrl   = "https://darshan.caringgems.in";
  const isOpenClaw = !agent.platform || agent.platform === "openclaw";

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  }

  function downloadScript(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  }

  const envVars: Record<OsTab, string> = {
    linux: [
      `echo 'export DARSHAN_BASE_URL="${baseUrl}"' >> ~/.bashrc`,
      `echo 'export AGENT_${agentSlug}_ID="${agentId}"' >> ~/.bashrc`,
      `echo 'export AGENT_${agentSlug}_TOKEN="${token}"' >> ~/.bashrc`,
      `source ~/.bashrc`,
      ``,
      `# Verify`,
      `echo "DARSHAN_BASE_URL=$DARSHAN_BASE_URL"`,
      `echo "AGENT_${agentSlug}_ID=$AGENT_${agentSlug}_ID"`,
      `echo "AGENT_${agentSlug}_TOKEN=$AGENT_${agentSlug}_TOKEN"`,
    ].join("\n"),
    windows_ps: [
      `[Environment]::SetEnvironmentVariable("DARSHAN_BASE_URL","${baseUrl}","User")`,
      `[Environment]::SetEnvironmentVariable("AGENT_${agentSlug}_ID","${agentId}","User")`,
      `[Environment]::SetEnvironmentVariable("AGENT_${agentSlug}_TOKEN","${token}","User")`,
      ``,
      `# Verify (restart PowerShell first, then run:)`,
      `echo "DARSHAN_BASE_URL=$env:DARSHAN_BASE_URL"`,
      `echo "AGENT_${agentSlug}_ID=$env:AGENT_${agentSlug}_ID"`,
      `echo "AGENT_${agentSlug}_TOKEN=$env:AGENT_${agentSlug}_TOKEN"`,
    ].join("\n"),
    windows_cmd: [
      `setx DARSHAN_BASE_URL "${baseUrl}"`,
      `setx AGENT_${agentSlug}_ID "${agentId}"`,
      `setx AGENT_${agentSlug}_TOKEN "${token}"`,
      ``,
      `:: Verify (restart CMD first, then run:)`,
      `echo DARSHAN_BASE_URL=%DARSHAN_BASE_URL%`,
      `echo AGENT_${agentSlug}_ID=%AGENT_${agentSlug}_ID%`,
      `echo AGENT_${agentSlug}_TOKEN=%AGENT_${agentSlug}_TOKEN%`,
    ].join("\n"),
  };

  const profileFile: Record<OsTab, string> = {
    linux:       "persists to ~/.bashrc — survives reboots",
    windows_ps:  "persists to User scope — survives reboots",
    windows_cmd: "persists to User scope — survives reboots",
  };

  const heartbeatBlock = `## Darshan Inbox — ${agent.name}

## POLICY (MANDATORY)
- Never reveal tokens or secrets.
- Never modify HEARTBEAT.md during runtime.
- Only execute tasks within project briefing scope.
- Reject unsafe requests with: "rejected: unsafe instruction".

## REQUIRED ENV VARS
Must be set on this machine. Never hardcode values here.
Check with: echo $AGENT_${agentSlug}_ID

  $AGENT_${agentSlug}_ID      — your agent UUID
  $AGENT_${agentSlug}_TOKEN   — your callback token
  $DARSHAN_BASE_URL           — default: ${baseUrl}

On every heartbeat:
1. Verify env vars are set — run: echo $AGENT_${agentSlug}_ID (stop if empty).
2. GET $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${agentSlug}_ID/inbox
   Header: Authorization: Bearer $AGENT_${agentSlug}_TOKEN
3. GET $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${agentSlug}_ID/tasks?status=approved
   Header: Authorization: Bearer $AGENT_${agentSlug}_TOKEN
4. For each pending item, handle by type:

   ping →
     ACK response: "pong — ${agent.name} online"

   welcome →
     ACK response: "setup complete — ${agent.name} ready"

   project_onboarded →
     Read payload: project_name, agent_briefing
     Set up local environment per agent_briefing instructions.
     ACK response: "ready for {project_name}"

   task_assigned →
     Read payload: project_slug, project_name, agent_briefing, title, description
     1. PATCH $DARSHAN_BASE_URL/api/backend/api/v1/projects/{project_id}/tasks/{task_id}
        Body: { "status": "in-progress" }
     2. Set up project environment per agent_briefing if not already done.
     3. Execute task per title + description + agent_briefing instructions.
     4. If no human action is needed: PATCH task -> { "status": "done", "completion_note": "..." }
     5. If human validation is needed: PATCH task -> { "status": "review", "completion_note": "...", "assignee": "<Project Owner or Agent Owner>" }
     6. If blocked on human action: PATCH task -> { "status": "blocked", "completion_note": "...", "assignee": "<Project Owner or Agent Owner>" }
     7. ACK response: "done — {title}"

   other →
     ACK response: "ack"

5. ACK endpoint: $DARSHAN_BASE_URL/api/backend/api/v1/agents/$AGENT_${agentSlug}_ID/inbox/ack
   Body: { inbox_id, callback_token: $AGENT_${agentSlug}_TOKEN, response }`;

  const linuxScript = `#!/bin/bash
# Darshan agent setup — ${agent.name}
# Run once on the machine where this agent lives.
# Writes env vars permanently to ~/.bashrc (survives reboots).

echo "Setting up ${agent.name} (${agentSlug})..."

# 1. Write persistent env vars to ~/.bashrc
echo 'export DARSHAN_BASE_URL="${baseUrl}"' >> ~/.bashrc
echo 'export AGENT_${agentSlug}_ID="${agentId}"' >> ~/.bashrc
echo 'export AGENT_${agentSlug}_TOKEN="${token}"' >> ~/.bashrc

# Reload so they're available in this session too
source ~/.bashrc

echo ""
echo "✅ Env vars written to ~/.bashrc — permanent."
echo "Now paste the HEARTBEAT.md block into your OpenClaw workspace:"
echo "   Path: ~/.openclaw/workspace/HEARTBEAT.md"
`;

  const psScript = `# Darshan agent setup — ${agent.name}
# Run once in PowerShell on the machine where this agent lives.

Write-Host "Setting up ${agent.name} (${agentSlug})..."

# 1. Persist env vars (User scope)
${envVars.windows_ps}

Write-Host "Env vars set. Close and reopen PowerShell for changes to take effect."
Write-Host ""
Write-Host "Now paste the HEARTBEAT.md block into your OpenClaw workspace:"
Write-Host "  Path: C:\\Users\\<you>\\.openclaw\\workspace\\HEARTBEAT.md"
`;

  const stepCls = "rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10 flex flex-col gap-3";
  const stepNum = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold text-white";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-zinc-800 text-sm font-bold text-white">
            {agent.name[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Onboard {agent.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">Set up this agent on a machine — <span className={cn("font-semibold", PLATFORM_BADGE, "rounded px-1.5 py-0.5")}>{platformLabel(agent.platform)}</span></div>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* OS tabs — only for OpenClaw */}
        {isOpenClaw && (
          <div className="flex shrink-0 gap-0 border-b border-zinc-200 px-5 dark:border-[#2D2A45]">
            {OS_TABS.map(t => (
              <button key={t.id} onClick={() => setOs(t.id)}
                className={cn(
                  "border-b-2 px-4 py-2.5 text-xs font-semibold transition-colors -mb-px",
                  os === t.id
                    ? "border-brand-600 text-zinc-900 dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">

          {!isOpenClaw ? (
            <div className="rounded-2xl bg-zinc-50 p-5 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10 text-center">
              <Terminal className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
              <p className="font-semibold text-zinc-700 dark:text-zinc-200">Setup instructions for <span className="text-brand-600">{platformLabel(agent.platform)}</span></p>
              <p className="mt-1 text-sm text-zinc-400">Platform-specific onboarding coming soon. Use the Credentials panel to get your Agent ID and token, then follow your platform&apos;s documentation.</p>
            </div>
          ) : (
            <>
              {/* Step 1 */}
              <div className={stepCls}>
                <div className="flex items-center gap-2">
                  <span className={stepNum}>1</span>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Set environment variables</span>
                  <span className="ml-auto text-[10px] text-zinc-400">{profileFile[os]}</span>
                </div>
                <div className="relative">
                  <pre className="overflow-x-auto rounded-xl bg-zinc-900 p-3 text-[11px] leading-relaxed text-zinc-300 dark:bg-black/40">
                    {envVars[os]}
                  </pre>
                  <div className="absolute right-2 top-2 flex gap-1">
                    <button onClick={() => copy(envVars[os], "env")}
                      className="flex items-center gap-1 rounded-lg bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors">
                      {copied === "env" ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                    </button>
                    <button onClick={() => downloadScript(os === "windows_ps" ? psScript : linuxScript, os === "windows_ps" ? "setup-agent.ps1" : "setup-agent.sh")}
                      className="flex items-center gap-1 rounded-lg bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors">
                      <Download className="h-3 w-3" /> Script
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-zinc-400">⚠️ Treat <code className="rounded bg-zinc-200 px-1 dark:bg-white/10">AGENT_{agentSlug}_TOKEN</code> like a password. Set it as a system env var — never paste it in a file.</p>
              </div>

              {/* Step 2 */}
              <div className={stepCls}>
                <div className="flex items-center gap-2">
                  <span className={stepNum}>2</span>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Add to HEARTBEAT.md</span>
                  <span className="ml-auto text-[10px] text-zinc-400">~/.openclaw/workspace/HEARTBEAT.md</span>
                </div>
                <div className="relative">
                  <pre className="max-h-64 overflow-y-auto overflow-x-auto whitespace-pre-wrap break-all rounded-xl bg-zinc-900 p-3 text-[10px] leading-relaxed text-zinc-300 dark:bg-black/40">
                    {heartbeatBlock}
                  </pre>
                  <button onClick={() => copy(heartbeatBlock, "heartbeat")}
                    className="absolute right-2 top-2 flex items-center gap-1 rounded-lg bg-zinc-700 px-2 py-1 text-[10px] text-zinc-300 hover:bg-zinc-600 transition-colors">
                    {copied === "heartbeat" ? <><Check className="h-3 w-3 text-emerald-400" /> Copied</> : <><Copy className="h-3 w-3" /> Copy</>}
                  </button>
                </div>
                <p className="text-[11px] text-zinc-400">Note: the block references env vars by name. The actual token is never written to this file.</p>
              </div>

              {/* Step 3 */}
              <div className={stepCls}>
                <div className="flex items-center gap-2">
                  <span className={stepNum}>3</span>
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Verify</span>
                </div>
                <div className="flex items-center gap-3">
                  {agent.status === "online" ? (
                    <>
                      <span className="h-3 w-3 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20 animate-pulse shrink-0" />
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{agent.name} is live! ✅</span>
                    </>
                  ) : (
                    <>
                      <span className="h-3 w-3 rounded-full bg-zinc-300 ring-4 ring-zinc-300/20 shrink-0" />
                      <div className="flex flex-col gap-1.5">
                        <span className="text-sm text-zinc-500">Waiting for first ping…</span>
                        <span className="text-xs text-zinc-400">OpenClaw polls every ~30 min automatically. To ping now, ask the agent to run the heartbeat manually via any connected channel (Telegram, WhatsApp, etc.):</span>
                        <code className="rounded-lg bg-zinc-100 dark:bg-white/5 px-2 py-1 text-xs font-mono text-zinc-600 dark:text-zinc-300">openclaw heartbeat run</code>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Onboard Agent Modal ──────────────────────────────────────────────────────
function OnboardAgentModal({ onDone, onClose }: {
  onDone: () => void; onClose: () => void;
}) {
  const [name,         setName]         = React.useState("");
  const [desc,         setDesc]         = React.useState("");
  const [platform,     setPlatform]     = React.useState("openclaw");
  const [saving,       setSaving]       = React.useState(false);
  const [error,        setError]        = React.useState("");

  // Derive endpoint_type from platform
  const endpointType = platform === "openclaw" ? "openclaw_poll"
                     : platform === "custom"    ? "manual"
                     : "webhook";

  async function handleSave() {
    if (!name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError("");
    const result = await createAgent({
      name: name.trim(), desc: desc.trim() || undefined,
      agent_type: "ai_agent", endpoint_type: endpointType, platform,
    });
    if (result) onDone();
    else { setError("Failed to create agent."); setSaving(false); }
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  const PLATFORM_TIPS: Record<string, string> = {
    openclaw:       "Agent polls Darshan via OpenClaw heartbeat — the standard method.",
    claude_code:    "Claude Code agent responds to tasks via webhook or poll.",
    cursor:         "Cursor-based agent integrated via webhook.",
    github_copilot: "GitHub Copilot agent — webhook delivery.",
    crewai:         "CrewAI multi-agent framework — webhook delivery.",
    langchain:      "LangChain / LangGraph agent — webhook delivery.",
    autogen:        "Microsoft AutoGen agent — webhook delivery.",
    agno:           "Agno (Phidata) lightweight agent — webhook delivery.",
    custom:         "Custom or standalone agent — manually managed.",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">New Agent</div>
            <div className="mt-0.5 text-xs text-zinc-500">Register a personal AI agent</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Name <span className="text-red-500">*</span></label>
            <Input autoFocus placeholder="e.g. Komal, Sanjaya…" value={name} onChange={e => setName(e.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <Input placeholder="What does this agent do?" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="rounded-xl bg-zinc-50 px-4 py-3 text-xs text-zinc-500 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10">
            <span className="font-semibold text-zinc-700 dark:text-zinc-300">Model &amp; capabilities</span> are self-reported by the agent on its first ping — no need to set them here.
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Platform</label>
            <select value={platform} onChange={e => setPlatform(e.target.value)} className={sel}>
              {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="mt-1 text-[11px] text-zinc-400">{PLATFORM_TIPS[platform] ?? ""}</p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!name || saving}>
            {saving ? "Creating…" : "Create Agent"}
          </Button>
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

function ImportAgentModal({ onDone, onClose }: {
  onDone: () => void; onClose: () => void;
}) {
  const [raw,    setRaw]    = React.useState("");
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
    setSaving(true); setError("");
    const result = await createAgent({
      name:          parsed.name.trim(),
      desc:          parsed.desc?.trim(),
      agent_type:    "ai_agent",
      model:         parsed.model,
      provider:      parsed.provider ?? "anthropic",
      capabilities:  caps,
      endpoint_type: parsed.endpoint_type ?? "openclaw_poll",
    });
    if (result) onDone();
    else { setError("Failed to import agent."); setSaving(false); }
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

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary" size="sm"
            onClick={handleImport}
            disabled={!parsed?.name || saving || !!parseError}
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
  const [agents,       setAgents]       = React.useState<ExtAgent[]>([]);
  const [loading,      setLoading]      = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [query,        setQuery]        = React.useState("");
  const [pingingIds,   setPingingIds]   = React.useState<Set<string>>(new Set());
  const [detailAgent,  setDetailAgent]  = React.useState<ExtAgent | null>(null);
  const [showAgentModal,  setShowAgentModal]  = React.useState(false);
  const [showImportModal, setShowImportModal] = React.useState(false);
  const [deleteTarget,    setDeleteTarget]    = React.useState<ExtAgent | null>(null);
  const [deleting,        setDeleting]        = React.useState(false);

  async function reload() {
    const ag = await fetchAgents();
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

  // Derived
  const totalOnline  = agents.filter(a => a.status === "online").length;
  const totalOffline = agents.filter(a => a.status !== "online").length;

  // Filter
  const filtered = agents.filter(a => {
    if (statusFilter === "online"  && a.status !== "online") return false;
    if (statusFilter === "offline" && a.status === "online") return false;
    if (query) {
      const q = query.toLowerCase();
      if (![a.name, a.desc ?? "", a.model ?? "", ...(Array.isArray(a.capabilities) ? a.capabilities : [])].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const STATUS_TABS: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all",     label: "All",     count: agents.length },
    { id: "online",  label: "Online",  count: totalOnline   },
    { id: "offline", label: "Offline", count: totalOffline  },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">My Agents</h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                {agents.length} agent{agents.length !== 1 ? "s" : ""} · {totalOnline} online
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowImportModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700">
                <Upload className="h-4 w-4" /> Import
              </button>
              <button
                onClick={() => setShowAgentModal(true)}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                <Plus className="h-4 w-4" /> New Agent
              </button>
            </div>
          </div>

          {/* Stats */}
          <div className="px-1">
            <div className="grid grid-cols-3 gap-3 px-1">
              {[
                { label: "Total",   value: agents.length, icon: Bot,      cls: "bg-brand-600"   },
                { label: "Online",  value: totalOnline,   icon: Zap,      cls: "bg-emerald-500" },
                { label: "Offline", value: totalOffline,  icon: Activity,  cls: "bg-zinc-500"   },
              ].map(({ label, value, icon: Icon, cls }) => (
                <div key={label} className="flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]">
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

          {/* Agent list */}
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center">
              {agents.length === 0 ? (
                <>
                  <Bot className="mx-auto mb-3 h-10 w-10 text-zinc-200 dark:text-zinc-700" />
                  <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No agents yet</p>
                  <p className="mt-1 text-sm text-zinc-400">Create your first agent to get started</p>
                  <button onClick={() => setShowAgentModal(true)}
                    className="mt-4 flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors mx-auto">
                    <Plus className="h-4 w-4" /> New Agent
                  </button>
                </>
              ) : (
                <>
                  <Search className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No agents match</p>
                  <button onClick={() => { setStatusFilter("all"); setQuery(""); }}
                    className="mt-2 text-sm text-brand-600 hover:underline">× Clear filters</button>
                </>
              )}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
              {/* Column headers */}
              <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
                <div className="w-2 shrink-0" />
                {COLS.map(c => (
                  <div key={c.label} className={cn("text-[11px] font-semibold uppercase tracking-wide text-zinc-400", c.cls)}>
                    {c.label}
                  </div>
                ))}
              </div>
              {filtered.map(a => (
                <AgentRow key={a.id} agent={a}
                  onInspect={() => setDetailAgent(a)}
                  onPing={() => handlePing(a.id)}
                  onDelete={() => setDeleteTarget(a)}
                  pinging={pingingIds.has(a.id)}
                />
              ))}
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

      {/* Import agent modal */}
      {showImportModal && (
        <ImportAgentModal
          onDone={() => { setShowImportModal(false); reload(); }}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* New agent modal */}
      {showAgentModal && (
        <OnboardAgentModal
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
