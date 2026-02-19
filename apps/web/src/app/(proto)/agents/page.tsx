"use client";

import * as React from "react";
import {
  Building2, Bot, Check, ChevronDown, ExternalLink,
  LayoutGrid, List, Plus, Search, X, Zap, Users,
  Activity, Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAgents, fetchOrgs, createOrg, createOrgAgent, pingAgent, fetchAgentProjects, type Org, type AgentProject } from "@/lib/api";
import type { Agent } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────
type ExtAgent = Agent & {
  org_id?: string; org_name?: string; org_slug?: string; org_type?: string;
  agent_type?: string; model?: string; provider?: string;
  capabilities?: string[]; ping_status?: string;
  last_ping_at?: string; last_seen_at?: string; callback_token?: string;
  last_ping_ms?: number;
};
type AgentView   = "grid" | "list";
type StatusFilter = "all" | "online" | "offline" | "coordinator" | "human";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(dateStr?: string): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)   return "just now";
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_META: Record<string, { dot: string; label: string; text: string }> = {
  online:  { dot: "bg-emerald-400", label: "Online",  text: "text-emerald-600" },
  away:    { dot: "bg-amber-400",   label: "Away",    text: "text-amber-600"   },
  offline: { dot: "bg-zinc-400",    label: "Offline", text: "text-zinc-500"    },
};

const PING_META: Record<string, { dot: string; label: string; cls: string }> = {
  ok:      { dot: "bg-emerald-400",             label: "OK",        cls: "text-emerald-600" },
  pending: { dot: "bg-amber-400 animate-pulse",  label: "Pinging…", cls: "text-amber-600"  },
  timeout: { dot: "bg-red-400",                  label: "Timeout",  cls: "text-red-600"    },
  unknown: { dot: "bg-zinc-400",                 label: "Unknown",  cls: "text-zinc-500"   },
};

function pingLabel(status: string, ms?: number): string {
  if (status === "ok") return ms != null ? `OK · ${ms}ms` : "OK";
  return PING_META[status]?.label ?? "Unknown";
}

const AGENT_TYPES   = ["ai_agent", "ai_coordinator", "human", "system"];
const PROVIDERS     = ["anthropic", "openai", "google", "mistral", "other"];
const CAPABILITIES  = ["code", "design", "ux", "review", "api", "infra", "deploy", "plan", "data", "writing"];
const POPULAR_MODELS = ["claude-sonnet-4-6", "claude-opus-4-6", "gpt-4o", "gpt-4-turbo", "gemini-1.5-pro", "mistral-large"];
const ORG_TYPES     = [{ value: "partner", label: "Partner" }, { value: "client", label: "Client" }, { value: "vendor", label: "Vendor" }];

// ─── Agent Detail Panel ───────────────────────────────────────────────────────
function AgentDetailPanel({ agent, onClose, onPing, pinging }: {
  agent: ExtAgent; onClose: () => void;
  onPing: (id: string) => void; pinging: boolean;
}) {
  const sm  = STATUS_META[agent.status] ?? STATUS_META.offline;
  const pingStatusKey = pinging ? "pending" : (agent.ping_status ?? "unknown");
  const pm  = PING_META[pingStatusKey] ?? PING_META.unknown;
  const isCoord = agent.agent_type === "ai_coordinator";
  const [projects, setProjects] = React.useState<AgentProject[]>([]);

  React.useEffect(() => {
    fetchAgentProjects(agent.id).then(setProjects);
  }, [agent.id]);

  return (
    <div className="flex h-full w-[400px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A] animate-slide-in-right">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-[#2D2A45]">
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <span className="font-display font-bold text-zinc-900 dark:text-white">{agent.name}</span>
        {isCoord && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">Coordinator</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        {/* Identity */}
        <div className="flex items-start gap-4">
          <div className={cn(
            "relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white",
            isCoord ? "bg-brand-700" : "bg-zinc-800"
          )}>
            {agent.name[0]?.toUpperCase()}
            <span className={cn("absolute -bottom-1 -right-1 h-4 w-4 rounded-full ring-2 ring-white dark:ring-[#16132A]", sm.dot)} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-xl font-extrabold text-zinc-900 dark:text-white">{agent.name}</h3>
            <div className={cn("text-sm font-semibold", sm.text)}>{sm.label} · {relativeTime(agent.last_seen_at)}</div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {agent.model && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{agent.model}</span>}
              {agent.provider && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{agent.provider}</span>}
              {agent.agent_type && <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{agent.agent_type}</span>}
            </div>
          </div>
        </div>

        {/* Description */}
        {agent.desc && (
          <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">{agent.desc}</p>
          </div>
        )}

        {/* Org */}
        {agent.org_name && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Organisation</p>
            <div className="flex items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-lg bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-700">
                {agent.org_name[0]?.toUpperCase()}
              </div>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{agent.org_name}</span>
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-300 capitalize">
                {agent.org_type ?? "partner"}
              </span>
            </div>
          </div>
        )}

        {/* Capabilities */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Capabilities</p>
          {(agent.capabilities ?? []).length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {(agent.capabilities ?? []).map((c) => (
                <span key={c} className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">{c}</span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">No capabilities listed</p>
          )}
        </div>

        {/* Ping */}
        <div className="rounded-xl bg-zinc-50 p-4 dark:bg-white/5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Connectivity</p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <span className={cn("h-2 w-2 rounded-full", pm.dot)} />
              <span className={cn("font-semibold", pm.cls)}>
                {pingLabel(pingStatusKey, agent.last_ping_ms)}
              </span>
              {agent.last_ping_at && (
                <span className="text-zinc-400">· {relativeTime(agent.last_ping_at)}</span>
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
              {pinging ? "Pinging…" : "Ping now"}
            </button>
          </div>
        </div>

        {/* Endpoint */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Connection</p>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/5">
            <Activity className="h-4 w-4 text-zinc-400" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400 font-mono">
              {(agent as unknown as { endpoint_type?: string }).endpoint_type ?? "openclaw_poll"}
            </span>
          </div>
        </div>

        {/* Assigned Projects */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
            Assigned Projects {projects.length > 0 && <span className="normal-case font-normal text-zinc-300">({projects.length})</span>}
          </p>
          {projects.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {projects.map(p => (
                <div key={p.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                  <div className="h-6 w-6 rounded-md shrink-0 flex items-center justify-center text-xs font-bold text-white bg-brand-700">
                    {p.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">{p.name}</div>
                    {p.role && <div className="text-[11px] text-zinc-400">{p.role}</div>}
                  </div>
                  <span className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                    p.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                    p.status === "planned" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400" :
                    "bg-zinc-100 text-zinc-500"
                  )}>{p.status}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-400">Not assigned to any projects</p>
          )}
        </div>

        {/* Activity feed (placeholder) */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Activity</p>
          <div className="flex flex-col gap-2">
            {agent.status === "online" && (
              <div className="flex items-center gap-2.5 text-xs text-zinc-500">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                Came online · {relativeTime(agent.last_seen_at)}
              </div>
            )}
            {agent.last_ping_at && (
              <div className="flex items-center gap-2.5 text-xs text-zinc-500">
                <Zap className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                Ping — {agent.ping_status === "ok" ? "✅ OK" : "❓ Unknown"} · {relativeTime(agent.last_ping_at)}
              </div>
            )}
            <div className="flex items-center gap-2.5 text-xs text-zinc-500">
              <Bot className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
              Agent onboarded
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card (Grid) ────────────────────────────────────────────────────────
function AgentCard({ agent, onPing, onInspect, pinging }: {
  agent: ExtAgent; onPing: () => void; onInspect: () => void; pinging: boolean;
}) {
  const isCoord   = agent.agent_type === "ai_coordinator";
  const sm        = STATUS_META[agent.status] ?? STATUS_META.offline;
  const pingStatus = pinging ? "pending" : (agent.ping_status ?? "unknown");
  const pm        = PING_META[pingStatus] ?? PING_META.unknown;

  return (
    <div className={cn(
      "flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]",
      "transition-all hover:shadow-md hover:-translate-y-0.5",
      isCoord && "border-l-4 border-l-brand-500"
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className={cn(
          "relative grid h-11 w-11 shrink-0 place-items-center rounded-xl text-sm font-bold text-white",
          isCoord ? "bg-brand-700" : "bg-zinc-800 dark:bg-zinc-700"
        )}>
          {agent.name[0]?.toUpperCase()}
          <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-[#16132A]", sm.dot)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-display font-bold text-zinc-900 dark:text-white truncate">{agent.name}</span>
            {isCoord && (
              <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">COORD</span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {agent.model && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10">{agent.model}</span>}
          </div>
        </div>
      </div>

      {/* Description */}
      {agent.desc && (
        <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{agent.desc}</p>
      )}

      {/* Capabilities */}
      {(agent.capabilities ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(agent.capabilities ?? []).slice(0, 4).map((c) => (
            <span key={c} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{c}</span>
          ))}
          {(agent.capabilities ?? []).length > 4 && (
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-400 dark:bg-white/10">+{(agent.capabilities ?? []).length - 4}</span>
          )}
        </div>
      )}

      {/* Status + ping */}
      <div className="flex items-center justify-between text-[11px]">
        <span className={cn("flex items-center gap-1 font-semibold", sm.text)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />
          {sm.label} · {relativeTime(agent.last_seen_at)}
        </span>
        <span className={cn("flex items-center gap-1", pm.cls)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", pm.dot)} />
          {pingLabel(pingStatus, agent.last_ping_ms)}
        </span>
      </div>

      {/* Actions */}
      <div className="flex gap-2 border-t border-zinc-100 pt-3 dark:border-white/5">
        <button onClick={onPing} disabled={pinging}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-semibold ring-1 transition-colors",
            pinging
              ? "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
              : "bg-zinc-50 text-zinc-700 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10"
          )}>
          <Zap className="h-3 w-3" />
          {pinging ? "Pinging…" : "Ping"}
        </button>
        <button onClick={onInspect}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-50 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10 transition-colors">
          <ExternalLink className="h-3 w-3" />
          Inspect
        </button>
      </div>
    </div>
  );
}

// ─── Agent Row (List view) ────────────────────────────────────────────────────
function AgentListRow({ agent, onPing, onInspect, pinging }: {
  agent: ExtAgent; onPing: () => void; onInspect: () => void; pinging: boolean;
}) {
  const isCoord = agent.agent_type === "ai_coordinator";
  const sm = STATUS_META[agent.status] ?? STATUS_META.offline;
  const pm = PING_META[pinging ? "pending" : (agent.ping_status ?? "unknown")] ?? PING_META.unknown;

  return (
    <div className={cn(
      "group flex items-center gap-4 border-b border-zinc-100 py-3 dark:border-[#2D2A45] hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors px-2",
      isCoord && "border-l-2 border-l-brand-500"
    )}>
      <div className={cn("relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
        isCoord ? "bg-brand-700" : "bg-zinc-800 dark:bg-zinc-700")}>
        {agent.name[0]?.toUpperCase()}
        <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-1 ring-white dark:ring-[#16132A]", sm.dot)} />
      </div>
      <div className="w-36 shrink-0">
        <div className="flex items-center gap-1">
          <span className="font-display text-sm font-semibold text-zinc-900 dark:text-white truncate">{agent.name}</span>
          {isCoord && <span className="rounded bg-brand-100 px-1 text-[9px] font-bold text-brand-700 dark:bg-brand-500/10">CO</span>}
        </div>
      </div>
      <div className="w-28 shrink-0 text-xs text-zinc-500">{agent.org_name ?? "—"}</div>
      <div className={cn("w-24 shrink-0 flex items-center gap-1 text-xs font-semibold", sm.text)}>
        <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />{sm.label}
      </div>
      <div className="w-28 shrink-0 text-xs text-zinc-500">{agent.agent_type ?? "—"}</div>
      <div className="w-36 shrink-0 text-xs text-zinc-500 font-mono">{agent.model ?? "—"}</div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-1">
        {(agent.capabilities ?? []).slice(0, 3).map((c) => (
          <span key={c} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-white/10">{c}</span>
        ))}
        {(agent.capabilities ?? []).length > 3 && <span className="text-[10px] text-zinc-400">+{(agent.capabilities ?? []).length - 3}</span>}
      </div>
      <div className="w-20 shrink-0 text-xs text-zinc-400">{relativeTime(agent.last_seen_at)}</div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onPing} disabled={pinging}
          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10">
          <Zap className="h-3.5 w-3.5" />
        </button>
        <button onClick={onInspect}
          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── Org Section ──────────────────────────────────────────────────────────────
function OrgSection({ org, agents, view, onPing, onInspect, onOnboardAgent, pingingIds }: {
  org: Org; agents: ExtAgent[]; view: AgentView;
  onPing: (id: string) => void; onInspect: (a: ExtAgent) => void;
  onOnboardAgent: (orgId: string) => void; pingingIds: Set<string>;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const orgTypeCls =
    org.type === "own"     ? "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" :
    org.type === "partner" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"         :
    org.type === "client"  ? "bg-emerald-100 text-emerald-700"                                       :
                             "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400";
  const onlineCount = agents.filter(a => a.status === "online").length;

  return (
    <div className="mb-6">
      <button onClick={() => setCollapsed(c => !c)}
        className="group/org flex w-full items-center gap-3 rounded-xl px-3 py-3 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900 dark:bg-zinc-700">
          <Building2 className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-display font-bold text-zinc-900 dark:text-white">{org.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", orgTypeCls)}>{org.type}</span>
            <span className="font-mono text-xs text-zinc-400">@{org.slug}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-3 text-xs text-zinc-400">
            <span>{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span className="text-emerald-500">{onlineCount} online</span>
            {org.project_count != null && <><span>·</span><span>{org.project_count} project{org.project_count !== 1 ? "s" : ""}</span></>}
          </div>
        </div>
        <button onClick={e => { e.stopPropagation(); onOnboardAgent(org.id); }}
          className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors opacity-0 group-hover/org:opacity-100">
          <Plus className="h-3 w-3" /> Agent
        </button>
        <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform shrink-0", collapsed && "-rotate-90")} />
      </button>

      {!collapsed && (
        <div className="mt-2 px-2">
          {agents.length === 0 ? (
            <div className="rounded-xl border-2 border-dashed border-zinc-200 py-10 text-center dark:border-white/10">
              <Bot className="mx-auto mb-2 h-7 w-7 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-500">No agents in {org.name} yet</p>
              <button onClick={() => onOnboardAgent(org.id)}
                className="mt-2 text-xs font-semibold text-brand-600 hover:underline">+ Onboard first agent</button>
            </div>
          ) : view === "grid" ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map(a => (
                <AgentCard key={a.id} agent={a}
                  onPing={() => onPing(a.id)} onInspect={() => onInspect(a)}
                  pinging={pingingIds.has(a.id)} />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
              {/* List header */}
              <div className="flex items-center gap-4 border-b border-zinc-100 bg-zinc-50 px-2 py-2 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
                <div className="w-8 shrink-0" />
                {[["w-36","Agent"],["w-28","Org"],["w-24","Status"],["w-28","Type"],["w-36","Model"],["flex-1","Capabilities"],["w-20","Last seen"],["w-16",""]].map(([w,l]) => (
                  <div key={l} className={cn("text-[11px] font-semibold uppercase tracking-wide text-zinc-400", w)}>{l}</div>
                ))}
              </div>
              {agents.map(a => (
                <AgentListRow key={a.id} agent={a}
                  onPing={() => onPing(a.id)} onInspect={() => onInspect(a)}
                  pinging={pingingIds.has(a.id)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Onboard Org Modal ────────────────────────────────────────────────────────
function OnboardOrgModal({ onDone, onClose }: {
  onDone: () => void; onClose: () => void;
}) {
  const [name,  setName]    = React.useState("");
  const [slug,  setSlug]    = React.useState("");
  const [desc,  setDesc]    = React.useState("");
  const [type,  setType]    = React.useState("partner");
  const [saving, setSaving] = React.useState(false);
  const [error,  setError]  = React.useState("");

  function autoSlug(v: string) {
    setName(v);
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  }

  async function handleSave() {
    if (!name.trim() || !slug.trim()) { setError("Name and slug are required."); return; }
    setSaving(true); setError("");
    const org = await createOrg({ name: name.trim(), slug: slug.trim(), description: desc.trim() || undefined, type });
    if (org) { onDone(); }
    else { setError("Failed to create org. Slug may already be taken."); setSaving(false); }
  }

  const inp = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Onboard Organisation</div>
            <div className="mt-0.5 text-xs text-zinc-500">Register a partner org to onboard their agents</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Relationship type</label>
            <div className="flex gap-2">
              {ORG_TYPES.map(({ value, label }) => (
                <button key={value} onClick={() => setType(value)}
                  className={cn("flex-1 rounded-xl py-2 text-sm font-semibold ring-1 transition-colors",
                    type === value ? "bg-brand-600 text-white ring-brand-600" : "bg-zinc-50 text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10")}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Organisation name <span className="text-red-500">*</span></label>
            <Input autoFocus placeholder="e.g. DesignCo, FriendLabs…" value={name} onChange={e => autoSlug(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Slug <span className="text-red-500">*</span></label>
            <div className="flex overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700">
              <span className="shrink-0 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-400 dark:bg-zinc-800">@</span>
              <input value={slug} onChange={e => setSlug(e.target.value)}
                className="flex-1 border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100" />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <Input placeholder="What does this org do?" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!name || !slug || saving}>
            {saving ? "Creating…" : "Create Organisation"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Onboard Agent Modal ──────────────────────────────────────────────────────
function OnboardAgentModal({ orgs, defaultOrgId, onDone, onClose }: {
  orgs: Org[]; defaultOrgId?: string; onDone: () => void; onClose: () => void;
}) {
  const [orgId,     setOrgId]     = React.useState(defaultOrgId ?? orgs[0]?.id ?? "");
  const [name,      setName]      = React.useState("");
  const [desc,      setDesc]      = React.useState("");
  const [agentType, setAgentType] = React.useState("ai_agent");
  const [model,     setModel]     = React.useState("");
  const [provider,  setProvider]  = React.useState("anthropic");
  const [caps,      setCaps]      = React.useState<string[]>([]);
  const [endpointType, setEndpointType] = React.useState("openclaw_poll");
  const [saving,    setSaving]    = React.useState(false);
  const [error,     setError]     = React.useState("");

  function toggleCap(c: string) { setCaps(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]); }

  async function handleSave() {
    if (!name.trim() || !orgId) { setError("Name and organisation are required."); return; }
    setSaving(true); setError("");
    const ok = await createOrgAgent(orgId, { name: name.trim(), desc: desc.trim() || undefined, agent_type: agentType, model: model || undefined, provider, capabilities: caps, endpoint_type: endpointType });
    if (ok) onDone();
    else { setError("Failed to onboard agent."); setSaving(false); }
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";
  const ENDPOINT_TIPS: Record<string, string> = {
    openclaw_poll: "Agent polls OpenClaw for tasks. Best for OpenClaw-hosted agents.",
    webhook: "Darshan pushes tasks to your agent's URL. Requires a public endpoint.",
    manual: "Human-operated. Tasks are handled manually.",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Onboard Agent</div>
            <div className="mt-0.5 text-xs text-zinc-500">Register an AI agent under an organisation</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Organisation <span className="text-red-500">*</span></label>
            <select value={orgId} onChange={e => setOrgId(e.target.value)} className={sel}>
              {orgs.map(o => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Agent name <span className="text-red-500">*</span></label>
              <Input autoFocus placeholder="e.g. Mithran, Komal…" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Agent type</label>
              <select value={agentType} onChange={e => setAgentType(e.target.value)} className={sel}>
                {AGENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <Input placeholder="What does this agent do?" value={desc} onChange={e => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Provider</label>
              <select value={provider} onChange={e => setProvider(e.target.value)} className={sel}>
                {PROVIDERS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Model</label>
              <select value={model} onChange={e => setModel(e.target.value)} className={sel}>
                <option value="">— select —</option>
                {POPULAR_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Capabilities</label>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map(c => (
                <button key={c} onClick={() => toggleCap(c)}
                  className={cn("flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                    caps.includes(c) ? "bg-brand-600 text-white ring-brand-600" : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10")}>
                  {caps.includes(c) && <Check className="h-3 w-3" />}{c}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Connection type</label>
            <select value={endpointType} onChange={e => setEndpointType(e.target.value)} className={sel}>
              <option value="openclaw_poll">OpenClaw (poll-based)</option>
              <option value="webhook">Webhook (push)</option>
              <option value="manual">Manual (human)</option>
            </select>
            <p className="text-[11px] text-zinc-400 mt-0.5">{ENDPOINT_TIPS[endpointType]}</p>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
        </div>
        <div className="flex shrink-0 justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!name || !orgId || saving}>
            {saving ? "Onboarding…" : "Onboard Agent"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [orgs,       setOrgs]       = React.useState<Org[]>([]);
  const [agents,     setAgents]     = React.useState<ExtAgent[]>([]);
  const [loading,    setLoading]    = React.useState(true);
  const [view,       setView]       = React.useState<AgentView>("grid");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("all");
  const [capFilter,  setCapFilter]  = React.useState<string[]>([]);
  const [query,      setQuery]      = React.useState("");
  const [pingingIds, setPingingIds] = React.useState<Set<string>>(new Set());
  const [detailAgent, setDetailAgent] = React.useState<ExtAgent | null>(null);

  // Modals — independent, not chained
  const [showOrgModal,    setShowOrgModal]    = React.useState(false);
  const [showAgentModal,  setShowAgentModal]  = React.useState(false);
  const [agentModalOrgId, setAgentModalOrgId] = React.useState<string | undefined>();

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
    setTimeout(() => { reload(); setPingingIds(s => { const n = new Set(s); n.delete(agentId); return n; }); }, 8000);
  }

  function openAgentModal(orgId?: string) { setAgentModalOrgId(orgId); setShowAgentModal(true); }

  // Derived stats
  const totalOnline   = agents.filter(a => a.status === "online").length;
  const allCaps       = [...new Set(agents.flatMap(a => a.capabilities ?? []))];
  const uniqueCapCount = allCaps.length;

  // Cap counts
  const capCounts = Object.fromEntries(allCaps.map(c => [c, agents.filter(a => (a.capabilities ?? []).includes(c)).length]));

  // Filter
  const filtered = agents.filter(a => {
    if (statusFilter === "online"      && a.status !== "online") return false;
    if (statusFilter === "offline"     && a.status === "online") return false;
    if (statusFilter === "coordinator" && a.agent_type !== "ai_coordinator") return false;
    if (statusFilter === "human"       && a.agent_type !== "human") return false;
    if (capFilter.length > 0 && !capFilter.every(c => (a.capabilities ?? []).includes(c))) return false;
    if (query) {
      const q = query.toLowerCase();
      if (![a.name, a.desc ?? "", a.model ?? "", a.org_name ?? "", ...(a.capabilities ?? [])].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const ownOrg      = orgs.find(o => o.type === "own");
  const partnerOrgs = orgs.filter(o => o.type !== "own");
  const agentsFor   = (orgId: string) => filtered.filter(a => a.org_id === orgId);
  const unassigned  = filtered.filter(a => !a.org_id);

  const STATUS_TABS: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all",         label: "All",          count: agents.length },
    { id: "online",      label: "Online",        count: agents.filter(a => a.status === "online").length },
    { id: "offline",     label: "Offline",       count: agents.filter(a => a.status !== "online").length },
    { id: "coordinator", label: "Coordinators",  count: agents.filter(a => a.agent_type === "ai_coordinator").length },
    { id: "human",       label: "Human",         count: agents.filter(a => a.agent_type === "human").length },
  ];

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-5 p-0">
          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agent Registry</h1>
              <p className="mt-0.5 text-sm text-zinc-500">{agents.length} agents · {orgs.length} organisations · {totalOnline} online</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowOrgModal(true)}
                className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:bg-white/5 dark:border-white/10 dark:text-zinc-300 transition-colors">
                <Building2 className="h-4 w-4" /> Onboard Org
              </button>
              <button onClick={() => openAgentModal(ownOrg?.id)}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                <Bot className="h-4 w-4" /> Onboard Agent
              </button>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4">
            {[
              { label: "Total Agents",      value: agents.length,   icon: Bot,       cls: "bg-brand-600"   },
              { label: "Organisations",      value: orgs.length,     icon: Building2, cls: "bg-sky-500"     },
              { label: "Online Now",         value: totalOnline,     icon: Zap,       cls: "bg-emerald-500" },
              { label: "Unique Capabilities",value: uniqueCapCount,  icon: Users,     cls: "bg-amber-500"   },
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

          {/* Filter tabs + view toggle */}
          <div className="flex items-center gap-0 border-b border-zinc-200 dark:border-[#2D2A45]">
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
            <div className="ml-auto flex items-center gap-2 pb-2">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agents…"
                  className="w-44 rounded-lg bg-zinc-100 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-white/10 dark:text-white" />
              </div>
              {/* View toggle */}
              <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-white/10">
                {([["grid", LayoutGrid], ["list", List]] as const).map(([v, Icon]) => (
                  <button key={v} onClick={() => setView(v)}
                    className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors",
                      view === v ? "bg-white text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-400 hover:text-zinc-600")}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Capability quick-filter */}
          {allCaps.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
              <span className="shrink-0 text-xs font-semibold text-zinc-400">Filter:</span>
              {allCaps.map(c => (
                <button key={c} onClick={() => setCapFilter(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c])}
                  className={cn(
                    "shrink-0 flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                    capFilter.includes(c)
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10"
                  )}>
                  {c}
                  <span className={cn("text-[10px]", capFilter.includes(c) ? "text-brand-200" : "text-zinc-400")}>×{capCounts[c]}</span>
                </button>
              ))}
              {capFilter.length > 0 && (
                <button onClick={() => setCapFilter([])} className="shrink-0 text-xs text-zinc-400 hover:text-zinc-600 underline">clear</button>
              )}
            </div>
          )}

          {/* Agent list */}
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
          ) : (
            <div>
              {ownOrg && (
                <OrgSection org={ownOrg} agents={agentsFor(ownOrg.id)} view={view}
                  onPing={handlePing} onInspect={setDetailAgent}
                  onOnboardAgent={openAgentModal} pingingIds={pingingIds} />
              )}
              {partnerOrgs.length > 0 && (
                <div className="mb-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Partner Organisations</span>
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                </div>
              )}
              {partnerOrgs.map(org => (
                <OrgSection key={org.id} org={org} agents={agentsFor(org.id)} view={view}
                  onPing={handlePing} onInspect={setDetailAgent}
                  onOnboardAgent={openAgentModal} pingingIds={pingingIds} />
              ))}
              {unassigned.length > 0 && (
                <div>
                  <div className="mb-3 flex items-center gap-3">
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Unassigned</span>
                    <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {unassigned.map(a => (
                      <AgentCard key={a.id} agent={a} onPing={() => handlePing(a.id)}
                        onInspect={() => setDetailAgent(a)} pinging={pingingIds.has(a.id)} />
                    ))}
                  </div>
                </div>
              )}
              {filtered.length === 0 && !loading && (
                <div className="py-20 text-center">
                  <Search className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                  <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No agents match your filter</p>
                  <button onClick={() => { setStatusFilter("all"); setCapFilter([]); setQuery(""); }}
                    className="mt-2 text-sm text-brand-600 hover:underline">× Clear filters</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Agent Detail Panel */}
      {detailAgent && (
        <AgentDetailPanel
          agent={detailAgent}
          onClose={() => setDetailAgent(null)}
          onPing={(id) => { handlePing(id); setDetailAgent(a => a ? { ...a, ping_status: "pending" } : null); }}
          pinging={pingingIds.has(detailAgent.id)}
        />
      )}

      {/* Modals — independent flows */}
      {showOrgModal && (
        <OnboardOrgModal
          onDone={() => { setShowOrgModal(false); reload(); }}
          onClose={() => setShowOrgModal(false)}
        />
      )}
      {showAgentModal && (
        <OnboardAgentModal
          orgs={orgs.length ? orgs : []}
          defaultOrgId={agentModalOrgId}
          onDone={() => { setShowAgentModal(false); reload(); }}
          onClose={() => setShowAgentModal(false)}
        />
      )}
    </div>
  );
}
