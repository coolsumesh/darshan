"use client";

import * as React from "react";
import {
  Building2, ChevronDown, ChevronRight, Plus, Search,
  Zap, X, Check, Users, Bot, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchAgents, fetchOrgs, createOrg, createOrgAgent, pingAgent, type Org } from "@/lib/api";
import type { Agent } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────
type ExtAgent = Agent & {
  org_id?: string; org_name?: string; org_slug?: string; org_type?: string;
  agent_type?: string; model?: string; provider?: string;
  capabilities?: string[]; ping_status?: string;
  last_ping_at?: string; last_seen_at?: string; callback_token?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const PING_META: Record<string, { dot: string; label: string }> = {
  ok:      { dot: "bg-emerald-400",             label: "Reachable"  },
  pending: { dot: "bg-amber-400 animate-pulse",  label: "Pinging…"  },
  timeout: { dot: "bg-red-400",                  label: "Timeout"   },
  unknown: { dot: "bg-zinc-400",                 label: "Unknown"   },
};

const STATUS_DOT: Record<string, string> = {
  online:  "bg-emerald-400",
  away:    "bg-amber-400",
  offline: "bg-zinc-400",
};

const AGENT_TYPES   = ["ai_agent", "ai_coordinator", "human", "system"];
const PROVIDERS     = ["anthropic", "openai", "google", "mistral", "other"];
const CAPABILITIES  = ["code", "design", "ux", "review", "api", "infra", "deploy", "plan", "data", "writing"];
const ORG_TYPES     = [{ value: "partner", label: "Partner" }, { value: "client", label: "Client" }, { value: "vendor", label: "Vendor" }];

// ─── Onboard Org Modal ────────────────────────────────────────────────────────
function OnboardOrgModal({ onDone, onClose }: {
  onDone: (org: Org) => void; onClose: () => void;
}) {
  const [name,  setName]  = React.useState("");
  const [slug,  setSlug]  = React.useState("");
  const [desc,  setDesc]  = React.useState("");
  const [type,  setType]  = React.useState("partner");
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
    if (org) { onDone(org); }
    else { setError("Failed to create org. Slug may already be taken."); setSaving(false); }
  }

  const inp = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Onboard Organisation</div>
            <div className="mt-0.5 text-xs text-zinc-500">Register a new org to onboard their agents</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 flex-1 overflow-y-auto min-h-0">
          {/* Org type selector */}
          <div>
            <label className="mb-2 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Relationship type</label>
            <div className="flex gap-2">
              {ORG_TYPES.map(({ value, label }) => (
                <button key={value} onClick={() => setType(value)}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-sm font-semibold ring-1 transition-colors",
                    type === value
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-zinc-50 text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10"
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Organisation name <span className="text-red-500">*</span></label>
            <Input autoFocus placeholder="e.g. DesignCo, FriendLabs…" value={name} onChange={(e) => autoSlug(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Slug <span className="text-red-500">*</span></label>
            <div className="flex items-center gap-0 overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700">
              <span className="shrink-0 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-400 dark:bg-zinc-800">@</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value)}
                className="flex-1 border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100" />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <Input placeholder="What does this org do?" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
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
  orgs: Org[]; defaultOrgId?: string;
  onDone: () => void; onClose: () => void;
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

  function toggleCap(c: string) {
    setCaps((prev) => prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]);
  }

  async function handleSave() {
    if (!name.trim() || !orgId) { setError("Name and organisation are required."); return; }
    setSaving(true); setError("");
    const ok = await createOrgAgent(orgId, {
      name: name.trim(),
      desc: desc.trim() || undefined,
      agent_type: agentType,
      model: model || undefined,
      provider,
      capabilities: caps,
      endpoint_type: endpointType,
    });
    if (ok) { onDone(); }
    else { setError("Failed to onboard agent. Please try again."); setSaving(false); }
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-xl ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div>
            <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">Onboard Agent</div>
            <div className="mt-0.5 text-xs text-zinc-500">Register an AI agent under an organisation</div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5 flex-1 overflow-y-auto min-h-0">
          {/* Org picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Organisation <span className="text-red-500">*</span></label>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className={sel}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name} ({o.type})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Agent name <span className="text-red-500">*</span></label>
              <Input autoFocus placeholder="e.g. Mithran, Komal…" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Agent type</label>
              <select value={agentType} onChange={(e) => setAgentType(e.target.value)} className={sel}>
                {AGENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <Input placeholder="What does this agent do?" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Provider</label>
              <select value={provider} onChange={(e) => setProvider(e.target.value)} className={sel}>
                {PROVIDERS.map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Model</label>
              <Input placeholder="claude-sonnet-4-6" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>

          {/* Capabilities */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Capabilities</label>
            <div className="flex flex-wrap gap-2">
              {CAPABILITIES.map((c) => (
                <button key={c} onClick={() => toggleCap(c)}
                  className={cn(
                    "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ring-1 transition-colors",
                    caps.includes(c)
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10"
                  )}>
                  {caps.includes(c) && <Check className="h-3 w-3" />}
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Endpoint type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Connection type</label>
            <select value={endpointType} onChange={(e) => setEndpointType(e.target.value)} className={sel}>
              <option value="openclaw_poll">OpenClaw (poll-based)</option>
              <option value="webhook">Webhook (push)</option>
              <option value="manual">Manual (human)</option>
            </select>
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">{error}</p>}
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

// ─── Org section ──────────────────────────────────────────────────────────────
function OrgSection({ org, agents, onPing, onOnboardAgent, pingingIds }: {
  org: Org; agents: ExtAgent[];
  onPing: (id: string) => void;
  onOnboardAgent: (orgId: string) => void;
  pingingIds: Set<string>;
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  const orgTypeCls =
    org.type === "own"     ? "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300" :
    org.type === "partner" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"         :
    org.type === "client"  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10"                :
                             "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400";

  return (
    <div className="mb-6">
      {/* Org header */}
      <button onClick={() => setCollapsed((c) => !c)}
        className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-900 dark:bg-zinc-700">
          <Building2 className="h-4 w-4 text-white" />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-zinc-900 dark:text-white">{org.name}</span>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", orgTypeCls)}>
              {org.type}
            </span>
            <span className="text-xs text-zinc-400">@{org.slug}</span>
          </div>
          {org.description && <p className="mt-0.5 text-xs text-zinc-500 truncate">{org.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-zinc-400">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onOnboardAgent(org.id); }}
            className="flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
            <Plus className="h-3 w-3" /> Agent
          </button>
          <ChevronDown className={cn("h-4 w-4 text-zinc-400 transition-transform", collapsed && "-rotate-90")} />
        </div>
      </button>

      {/* Agent cards */}
      {!collapsed && (
        <div className="mt-2 grid grid-cols-1 gap-3 px-2 sm:grid-cols-2 xl:grid-cols-3">
          {agents.length === 0 ? (
            <div className="col-span-full rounded-xl border-2 border-dashed border-zinc-200 py-8 text-center dark:border-white/10">
              <Bot className="mx-auto mb-2 h-6 w-6 text-zinc-300" />
              <p className="text-sm text-zinc-400">No agents yet</p>
              <button onClick={() => onOnboardAgent(org.id)}
                className="mt-2 text-xs font-semibold text-brand-600 hover:underline">
                + Onboard first agent
              </button>
            </div>
          ) : agents.map((a) => {
            const pingStatus = pingingIds.has(a.id) ? "pending" : (a.ping_status ?? "unknown");
            const pm = PING_META[pingStatus] ?? PING_META.unknown;
            const sdot = STATUS_DOT[a.status] ?? STATUS_DOT.offline;

            return (
              <div key={a.id}
                className="flex flex-col gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]">
                {/* Card header */}
                <div className="flex items-start gap-3">
                  <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-700">
                    <span className="font-display font-bold">{a.name[0]?.toUpperCase()}</span>
                    <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-[#16132A]", sdot)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold text-zinc-900 dark:text-white">{a.name}</div>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      {a.model && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10">{a.model}</span>
                      )}
                      {a.agent_type && a.agent_type !== "ai_agent" && (
                        <span className="rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                          {a.agent_type}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {a.desc && <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">{a.desc}</p>}

                {/* Capabilities */}
                {(a.capabilities ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(a.capabilities ?? []).slice(0, 5).map((c) => (
                      <span key={c} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10 dark:text-zinc-400">{c}</span>
                    ))}
                    {(a.capabilities ?? []).length > 5 && (
                      <span className="text-[10px] text-zinc-400">+{(a.capabilities ?? []).length - 5}</span>
                    )}
                  </div>
                )}

                {/* Ping status */}
                <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
                  <span className={cn("h-1.5 w-1.5 rounded-full", pm.dot)} />
                  {pm.label}
                  {a.last_seen_at && (
                    <span className="text-zinc-400">· seen {new Date(a.last_seen_at).toLocaleTimeString()}</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 border-t border-zinc-100 pt-3 dark:border-white/5">
                  <button
                    onClick={() => onPing(a.id)}
                    disabled={pingingIds.has(a.id)}
                    className={cn(
                      "flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 transition-colors",
                      pingingIds.has(a.id)
                        ? "bg-amber-50 text-amber-600 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-400"
                        : "bg-zinc-50 text-zinc-700 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10"
                    )}>
                    {pingingIds.has(a.id) ? "Pinging…" : "⚡ Ping"}
                  </button>
                  <button className="flex-1 rounded-lg bg-zinc-50 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-300 dark:ring-white/10 transition-colors">
                    Inspect
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AgentsPage() {
  const [orgs,       setOrgs]       = React.useState<Org[]>([]);
  const [agents,     setAgents]     = React.useState<ExtAgent[]>([]);
  const [query,      setQuery]      = React.useState("");
  const [loading,    setLoading]    = React.useState(true);
  const [pingingIds, setPingingIds] = React.useState<Set<string>>(new Set());

  // Modals
  const [showOrgModal,     setShowOrgModal]     = React.useState(false);
  const [showAgentModal,   setShowAgentModal]   = React.useState(false);
  const [agentModalOrgId,  setAgentModalOrgId]  = React.useState<string | undefined>();

  async function reload() {
    const [os, ag] = await Promise.all([fetchOrgs(), fetchAgents()]);
    setOrgs(os);
    setAgents(ag as ExtAgent[]);
    setLoading(false);
  }

  React.useEffect(() => { reload(); }, []);

  async function handlePing(agentId: string) {
    setPingingIds((s) => new Set(s).add(agentId));
    await pingAgent(agentId);
    setTimeout(() => {
      reload();
      setPingingIds((s) => { const n = new Set(s); n.delete(agentId); return n; });
    }, 8000);
  }

  function openAgentModal(orgId?: string) {
    setAgentModalOrgId(orgId);
    setShowAgentModal(true);
  }

  // Group agents by org
  const filteredAgents = agents.filter((a) =>
    !query || a.name.toLowerCase().includes(query.toLowerCase()) || (a.desc ?? "").toLowerCase().includes(query.toLowerCase())
  );

  const ownOrg     = orgs.find((o) => o.type === "own");
  const partnerOrgs = orgs.filter((o) => o.type !== "own");

  const agentsFor = (orgId: string) => filteredAgents.filter((a) => a.org_id === orgId);
  const unassigned = filteredAgents.filter((a) => !a.org_id);

  const totalOnline = agents.filter((a) => a.status === "online").length;

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Agent Registry</h1>
          <p className="mt-0.5 text-sm text-zinc-500">
            {agents.length} agents · {orgs.length} organisations · {totalOnline} online
          </p>
        </div>
        {/* CTA buttons */}
        <div className="flex items-center gap-2">
          <button onClick={() => setShowOrgModal(true)}
            className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 shadow-sm hover:bg-zinc-50 dark:bg-white/5 dark:border-white/10 dark:text-zinc-300 transition-colors">
            <Building2 className="h-4 w-4" /> Onboard Org
          </button>
          <button onClick={() => openAgentModal(ownOrg?.id)}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors">
            <Bot className="h-4 w-4" /> Onboard Agent
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-4">
        {[
          { label: "Total Agents",  value: agents.length,                icon: Bot,      cls: "bg-brand-600"   },
          { label: "Organisations", value: orgs.length,                  icon: Building2, cls: "bg-sky-500"    },
          { label: "Online Now",    value: totalOnline,                  icon: Zap,      cls: "bg-emerald-500" },
          { label: "Partner Orgs",  value: partnerOrgs.length,           icon: Users,    cls: "bg-amber-500"   },
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

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input type="text" placeholder="Search agents…" value={query} onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl bg-white py-2.5 pl-9 pr-4 text-sm ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:bg-[#16132A] dark:ring-[#2D2A45] dark:text-white" />
      </div>

      {/* Agent list by org */}
      {loading ? (
        <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
      ) : (
        <div>
          {/* Own org first */}
          {ownOrg && (
            <OrgSection org={ownOrg} agents={agentsFor(ownOrg.id)}
              onPing={handlePing} onOnboardAgent={openAgentModal} pingingIds={pingingIds} />
          )}

          {/* Partner orgs */}
          {partnerOrgs.length > 0 && (
            <div className="mb-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
              <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Partner Organisations</span>
              <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
            </div>
          )}
          {partnerOrgs.map((org) => (
            <OrgSection key={org.id} org={org} agents={agentsFor(org.id)}
              onPing={handlePing} onOnboardAgent={openAgentModal} pingingIds={pingingIds} />
          ))}

          {/* Unassigned agents (legacy/fallback) */}
          {unassigned.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Unassigned</span>
                <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {unassigned.map((a) => (
                  <div key={a.id} className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
                    <div className="font-display font-bold text-zinc-900 dark:text-white">{a.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-500">{a.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {orgs.length === 0 && agents.length === 0 && (
            <div className="py-20 text-center">
              <Bot className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
              <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No agents yet</p>
              <p className="mt-1 text-sm text-zinc-400">Start by onboarding an organisation, then add agents under it.</p>
              <div className="mt-4 flex justify-center gap-3">
                <button onClick={() => setShowOrgModal(true)}
                  className="flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
                  <Building2 className="h-4 w-4" /> Onboard Org
                </button>
                <button onClick={() => openAgentModal()}
                  className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  <Bot className="h-4 w-4" /> Onboard Agent
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showOrgModal && (
        <OnboardOrgModal
          onDone={(org) => { setShowOrgModal(false); reload(); setAgentModalOrgId(org.id); setShowAgentModal(true); }}
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
