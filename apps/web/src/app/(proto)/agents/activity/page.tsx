"use client";

import * as React from "react";
import { Zap, RefreshCw, Circle, Clock } from "lucide-react";
import { fetchAgents, pingAgent } from "@/lib/api";
import { cn } from "@/lib/cn";

type ExtAgent = {
  id: string; name: string; status: string;
  agent_type?: string; model?: string; provider?: string;
  ping_status?: string; last_ping_ms?: number;
  last_seen_at?: string; last_ping_at?: string;
  org_name?: string;
};

function relativeTime(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const PING_META: Record<string, { dot: string; label: string; text: string }> = {
  ok:      { dot: "bg-emerald-400", label: "Reachable", text: "text-emerald-600 dark:text-emerald-400" },
  pending: { dot: "bg-amber-400 animate-pulse", label: "Pinging…", text: "text-amber-600 dark:text-amber-400" },
  timeout: { dot: "bg-red-400",     label: "Timeout",   text: "text-red-600 dark:text-red-400"     },
  unknown: { dot: "bg-zinc-400",    label: "Unknown",   text: "text-zinc-500"                       },
};

export default function AgentActivityPage() {
  const [agents,    setAgents]    = React.useState<ExtAgent[]>([]);
  const [loading,   setLoading]   = React.useState(true);
  const [pinging,   setPinging]   = React.useState<Set<string>>(new Set());
  const [refreshed, setRefreshed] = React.useState<Date | null>(null);

  async function load() {
    setLoading(true);
    const data = await fetchAgents();
    setAgents(data as ExtAgent[]);
    setRefreshed(new Date());
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  async function handlePing(agentId: string) {
    setPinging((s) => new Set(s).add(agentId));
    await pingAgent(agentId);
    // Poll for result
    setTimeout(async () => {
      const data = await fetchAgents();
      setAgents(data as ExtAgent[]);
      setPinging((s) => { const n = new Set(s); n.delete(agentId); return n; });
    }, 8000);
  }

  async function handlePingAll() {
    const aiAgents = agents.filter((a) => a.agent_type !== "human");
    await Promise.all(aiAgents.map((a) => handlePing(a.id)));
  }

  const online  = agents.filter((a) => a.status === "online").length;
  const offline = agents.filter((a) => a.status !== "online").length;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-100 dark:bg-amber-500/10">
          <Zap className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Agent Activity</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Live status, ping health, and last-seen times
            {refreshed && <span className="ml-2 text-zinc-400">· refreshed {relativeTime(refreshed.toISOString())}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handlePingAll}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-violet-700 ring-1 ring-violet-200 transition-colors hover:bg-violet-50 dark:text-violet-400 dark:ring-violet-500/30 dark:hover:bg-violet-500/10"
          >
            <Zap className="h-3.5 w-3.5" /> Ping all
          </button>
          <button
            onClick={load}
            className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-zinc-600 ring-1 ring-zinc-200 transition-colors hover:bg-zinc-50 dark:text-zinc-400 dark:ring-[#2D2A45] dark:hover:bg-white/5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </button>
        </div>
      </header>

      {/* Summary pills */}
      {!loading && (
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">{online} online</span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-4 py-3 dark:bg-white/5">
            <span className="h-2 w-2 rounded-full bg-zinc-400" />
            <span className="text-sm font-semibold text-zinc-600 dark:text-zinc-400">{offline} offline</span>
          </div>
        </div>
      )}

      {/* Agent table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
        <div className="hidden md:flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
          <div className="w-4 shrink-0 mr-3" />
          <div className="flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Agent</div>
          <div className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Type</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Ping</div>
          <div className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Latency</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Last seen</div>
          <div className="w-20 shrink-0" />
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />)}
          </div>
        ) : agents.length === 0 ? (
          <div className="py-16 text-center text-sm text-zinc-400">No agents registered</div>
        ) : (
          agents.map((agent) => {
            const isOnline  = agent.status === "online";
            const isPinging = pinging.has(agent.id);
            const pingKey   = isPinging ? "pending" : (agent.ping_status ?? "unknown");
            const pm        = PING_META[pingKey] ?? PING_META.unknown;
            const isAI      = agent.agent_type !== "human";

            return (
              <div key={agent.id} className="group border-b border-zinc-100 last:border-0 dark:border-[#2D2A45] hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                {/* Mobile */}
                <div className="flex md:hidden items-center gap-3 px-4 py-3">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", isOnline ? "bg-emerald-400" : "bg-zinc-300")} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</p>
                    <p className="text-xs text-zinc-400">{pm.label} · {relativeTime(agent.last_seen_at)}</p>
                  </div>
                  <button onClick={() => handlePing(agent.id)} disabled={isPinging || !isAI}
                    className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 disabled:opacity-30 transition-colors dark:hover:bg-white/10">
                    <Zap className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Desktop */}
                <div className="hidden md:flex items-center px-4 py-3">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full mr-3", isOnline ? "bg-emerald-400" : "bg-zinc-300")} />
                  <div className="flex-1 min-w-0 flex items-center gap-2.5">
                    <div className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
                      isAI ? "bg-violet-700" : "bg-sky-700"
                    )}>
                      {agent.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{agent.name}</p>
                      {agent.org_name && <p className="text-[11px] text-zinc-400 truncate">{agent.org_name}</p>}
                    </div>
                  </div>
                  <div className="w-24 shrink-0">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isAI ? "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                           : "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                    )}>
                      {isAI ? "AI Agent" : "Human"}
                    </span>
                  </div>
                  <div className="w-28 shrink-0 flex items-center gap-1.5">
                    <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", pm.dot)} />
                    <span className={cn("text-xs", pm.text)}>{pm.label}</span>
                  </div>
                  <div className="w-24 shrink-0">
                    {agent.last_ping_ms != null ? (
                      <span className="text-xs font-mono text-zinc-500">{agent.last_ping_ms} ms</span>
                    ) : (
                      <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>
                    )}
                  </div>
                  <div className="w-28 shrink-0 flex items-center gap-1.5 text-xs text-zinc-500">
                    <Clock className="h-3 w-3 shrink-0" />
                    {relativeTime(agent.last_seen_at)}
                  </div>
                  <div className="w-20 shrink-0 flex justify-end">
                    <button
                      onClick={() => handlePing(agent.id)}
                      disabled={isPinging || !isAI}
                      title={isAI ? "Ping agent" : "Can't ping human agents"}
                      className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-200 hover:text-violet-600 disabled:opacity-30 transition-colors dark:hover:bg-white/10 dark:hover:text-violet-400"
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
