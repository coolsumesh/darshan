"use client";

import * as React from "react";
import { BarChart2, RefreshCw, Zap, Hash, Cpu } from "lucide-react";
import { fetchUsage, type UsageEvent, type UsageSummary } from "@/lib/api";

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtTokens(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000)    return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function SummaryCard({ label, value, icon: Icon, sub }: {
  label: string;
  value: string;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        <Icon className="h-4 w-4 text-violet-400" />
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

function EventRow({ event }: { event: UsageEvent }) {
  const shortKey = event.session_key.replace(/^session:/, "").replace(/^agent:main:/, "").slice(0, 40);
  return (
    <tr className="border-b border-slate-100 text-sm hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40">
      <td className="px-4 py-2.5 text-xs text-slate-400">{relativeTime(event.recorded_at)}</td>
      <td className="max-w-[180px] truncate px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300" title={event.session_key}>
        {shortKey}
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        {event.thread_id
          ? <a href={`/threads`} className="text-violet-600 hover:underline dark:text-violet-400">{event.thread_id.slice(0, 8)}…</a>
          : <span className="text-slate-300 dark:text-slate-600">—</span>
        }
      </td>
      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        {event.agent_id ? event.agent_id.slice(0, 8) + "…" : <span className="text-slate-300 dark:text-slate-600">—</span>}
      </td>
      <td className="px-4 py-2.5">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-mono text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {event.model}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right text-xs font-medium text-violet-600 dark:text-violet-400">
        +{fmtTokens(event.tokens_delta)}
      </td>
      <td className="px-4 py-2.5 text-right text-xs text-slate-400">
        {fmtTokens(event.tokens_total)}
      </td>
    </tr>
  );
}

export default function UsagePage() {
  const [data, setData] = React.useState<UsageSummary>({ events: [], total_tokens: 0, total_events: 0, by_model: {} });
  const [loading, setLoading] = React.useState(true);
  const [lastRefresh, setLastRefresh] = React.useState<Date>(new Date());

  const load = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const result = await fetchUsage({ limit: 200 });
    setData(result);
    setLastRefresh(new Date());
    if (!silent) setLoading(false);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s
  React.useEffect(() => {
    const id = setInterval(() => load(true), 30000);
    return () => clearInterval(id);
  }, [load]);

  const topModel = Object.entries(data.by_model).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  // Today's tokens
  const todayMs = new Date().setHours(0, 0, 0, 0);
  const todayTokens = data.events
    .filter(e => new Date(e.recorded_at).getTime() >= todayMs)
    .reduce((sum, e) => sum + e.tokens_delta, 0);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <BarChart2 className="h-5 w-5 text-violet-500" />
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">LLM Usage</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">
            Updated {relativeTime(lastRefresh.toISOString())}
          </span>
          <button
            onClick={() => load()}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-violet-400 hover:text-violet-600 dark:border-slate-700 dark:text-slate-300"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label="Tokens Today"   value={fmtTokens(todayTokens)}       icon={Zap}      sub="since midnight" />
        <SummaryCard label="Total Events"   value={String(data.total_events)}     icon={Hash}     sub="all time" />
        <SummaryCard label="Top Model"      value={topModel}                      icon={Cpu}      sub={data.by_model[topModel] ? fmtTokens(data.by_model[topModel]) + " tokens" : undefined} />
      </div>

      {/* By model breakdown */}
      {Object.keys(data.by_model).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">By Model</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(data.by_model).sort((a, b) => b[1] - a[1]).map(([model, tokens]) => (
              <div key={model} className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-800/60">
                <span className="font-mono text-xs text-slate-600 dark:text-slate-300">{model}</span>
                <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">{fmtTokens(tokens)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            Recent Events ({data.total_events})
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
          </div>
        ) : data.events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
            <BarChart2 className="h-8 w-8 opacity-30" />
            <span className="text-sm">No usage events yet</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:border-slate-800">
                  <th className="px-4 py-2">Time</th>
                  <th className="px-4 py-2">Session</th>
                  <th className="px-4 py-2">Thread</th>
                  <th className="px-4 py-2">Agent</th>
                  <th className="px-4 py-2">Model</th>
                  <th className="px-4 py-2 text-right">Delta</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map(e => <EventRow key={e.id} event={e} />)}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
