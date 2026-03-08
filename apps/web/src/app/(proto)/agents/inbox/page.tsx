"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { fetchAgents, fetchAgentInbox, fetchAgentInboxSent, fetchProjects, type AgentInboxItem } from "@/lib/api";
import type { Agent } from "@/lib/agents";
import { cn } from "@/lib/cn";

type ExtAgent = Agent & { callback_token?: string };

function relativeTime(dateStr?: string): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function formatBytes(input?: number | string | null): string {
  const n = typeof input === "string" ? Number(input) : input;
  if (!n || Number.isNaN(n)) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileNameFromUrl(url?: string): string {
  if (!url) return "attachment";
  try {
    const p = new URL(url).pathname;
    return decodeURIComponent(p.split("/").pop() || "attachment");
  } catch {
    return url;
  }
}

function InboxPageInner() {
  const params = useSearchParams();
  const [agents, setAgents] = React.useState<ExtAgent[]>([]);
  const [agentId, setAgentId] = React.useState("");
  const [tab, setTab] = React.useState<"inbox" | "sent">("inbox");
  const [status, setStatus] = React.useState<"all" | "pending" | "ack" | "failed">("all");
  const [items, setItems] = React.useState<AgentInboxItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [projectNameById, setProjectNameById] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    fetchAgents().then((rows) => {
      const list = rows as ExtAgent[];
      setAgents(list);
      const fromQ = params.get("agent");
      const init = fromQ && list.find(a => a.id === fromQ) ? fromQ : (list[0]?.id ?? "");
      setAgentId(init);
    });
    fetchProjects()
      .then((rows) => setProjectNameById(Object.fromEntries(rows.map((p) => [p.id, p.name]))))
      .catch(() => setProjectNameById({}));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = agents.find(a => a.id === agentId) ?? null;
  const agentNameById = React.useMemo(
    () => Object.fromEntries(agents.map(a => [a.id, a.name])),
    [agents]
  );

  async function load() {
    if (!selected?.callback_token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const rows = tab === "inbox"
      ? await fetchAgentInbox(selected.id, selected.callback_token, status)
      : await fetchAgentInboxSent(selected.id, selected.callback_token, status);
    setItems(rows);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, tab, status]);

  React.useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some(i => i.id === selectedId)) {
      setSelectedId(items[0].id);
    }
  }, [items, selectedId]);

  const typeBadge = (t: string) =>
    t === "a2a_message" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400"
    : t === "task_assigned" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
    : t === "ping" ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-400"
    : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300";

  const statusBadge = (s: string) =>
    s === "pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400"
    : s === "ack" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
    : s === "failed" ? "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400"
    : "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Inbox</h1>
        <p className="mt-1 text-sm text-zinc-500">Agent message history (received + sent)</p>
      </div>

      <div className="rounded-2xl bg-white p-4 ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Agent</label>
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
            >
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Tab</label>
            <div className="flex rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden">
              {(["inbox", "sent"] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "flex-1 py-2 text-xs font-semibold transition-colors",
                    tab === t
                      ? "bg-brand-600 text-white"
                      : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900"
                  )}
                >
                  {t === "inbox" ? "Inbox" : "Sent"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Status</label>
            <div className="flex rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700 overflow-hidden">
              {(["all", "pending", "ack", "failed"] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex-1 py-2 text-[11px] font-semibold transition-colors",
                    status === s
                      ? "bg-zinc-800 text-white dark:bg-zinc-100 dark:text-zinc-900"
                      : "bg-zinc-50 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">No messages</div>
        ) : (
          <div className="grid min-h-[520px] grid-cols-1 md:grid-cols-[380px_1fr]">
            <div className="border-r border-zinc-100 dark:border-[#2D2A45]">
              <div className="max-h-[70vh] overflow-y-auto">
                {items.map(item => {
                  const from = item.payload?.from_agent_name ?? item.from_agent_id ?? "unknown";
                  const body = String(item.payload?.text ?? "(no body)");
                  const subject = String(item.payload?.subject ?? item.type ?? "(no subject)");
                  const selected = selectedId === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={cn(
                        "w-full border-b border-zinc-100 px-4 py-3 text-left transition-colors dark:border-[#2D2A45]",
                        selected ? "bg-brand-50 dark:bg-brand-500/10" : "hover:bg-zinc-50 dark:hover:bg-white/5"
                      )}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{from}</span>
                        <span className="ml-auto text-[11px] text-zinc-400">{relativeTime(item.created_at)}</span>
                      </div>
                      <div className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{subject}</div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{body.replace(/\s+/g, " ")}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-5">
              {(() => {
                const item = items.find(i => i.id === selectedId) ?? items[0];
                if (!item) return null;
                const from = item.payload?.from_agent_name ?? item.from_agent_id ?? "unknown";
                const to = item.to_agent_name ?? (item.agent_id ? agentNameById[item.agent_id] : undefined) ?? item.agent_id ?? "unknown";
                const subject = String(item.payload?.subject ?? item.type ?? "(no subject)");
                const body = String(item.payload?.text ?? "(no body)");
                const projectId = item.payload?.project_id ?? item.payload?.projectId;
                const projectName = projectId ? (projectNameById[String(projectId)] ?? "Unknown") : null;
                const attachmentsRaw = Array.isArray(item.payload?.attachments) ? item.payload.attachments : [];
                const attachments = attachmentsRaw.map((a: any) => {
                  if (typeof a === "string") {
                    return { name: fileNameFromUrl(a), size: null, url: a };
                  }
                  return {
                    name: a?.name ?? a?.filename ?? fileNameFromUrl(a?.url),
                    size: a?.size ?? a?.bytes ?? null,
                    url: a?.url ?? a?.href ?? null,
                  };
                });
                return (
                  <div>
                    <div className="mb-4 border-b border-zinc-100 pb-4 dark:border-[#2D2A45]">
                      <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">{subject}</h2>
                      {projectId && (
                        <div className="mt-1 text-xs text-zinc-500">
                          Project: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{projectName}</span>
                          <div className="font-mono text-[10px] text-zinc-400">{String(projectId)}</div>
                        </div>
                      )}
                      {item.thread_id && <div className="mt-1 font-mono text-[10px] text-zinc-400">conversation: {item.thread_id}</div>}
                      <div className="mt-2 grid gap-1 text-xs text-zinc-500">
                        <div>From: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{from}</span></div>
                        <div>To: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{to}</span></div>
                        <div>Received: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{relativeTime(item.created_at)}</span></div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
                      <p className="whitespace-pre-wrap">{body}</p>
                    </div>

                    {attachments.length > 0 && (
                      <div className="mt-3 rounded-xl bg-zinc-50 p-3 text-xs dark:bg-white/5">
                        <div className="mb-2 font-semibold text-zinc-600 dark:text-zinc-300">Attachments</div>
                        <div className="grid gap-2">
                          {attachments.map((a: any, idx: number) => (
                            <div key={idx} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10">
                              <span className="truncate text-zinc-700 dark:text-zinc-200">{a.name}</span>
                              {formatBytes(a.size) && <span className="text-zinc-400">({formatBytes(a.size)})</span>}
                              <span className="ml-auto flex items-center gap-2">
                                {a.url && <a className="text-brand-600 hover:underline" href={a.url} target="_blank" rel="noreferrer">Open</a>}
                                {a.url && <button onClick={() => navigator.clipboard?.writeText(String(a.url))} className="text-zinc-500 hover:underline">Copy URL</button>}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold", statusBadge(item.status))}>{item.status}</span>
                      {item.corr_id && <span>Message ID: <span className="font-mono text-zinc-500">{item.corr_id}</span></span>}
                      {item.reply_to_corr_id && <span>Reply To: <span className="font-mono text-zinc-500">{item.reply_to_corr_id}</span></span>}
                      <span className={cn("rounded-full px-2 py-0.5 font-semibold", typeBadge(item.type))}>{item.type}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AgentsInboxPage() {
  return (
    <React.Suspense fallback={<div className="py-10 text-center text-sm text-zinc-400">Loading…</div>}>
      <InboxPageInner />
    </React.Suspense>
  );
}
