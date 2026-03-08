"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { fetchAgents, fetchAgentInbox, fetchAgentInboxSent, type AgentInboxItem } from "@/lib/api";
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

function InboxPageInner() {
  const params = useSearchParams();
  const [agents, setAgents] = React.useState<ExtAgent[]>([]);
  const [agentId, setAgentId] = React.useState("");
  const [tab, setTab] = React.useState<"inbox" | "sent">("inbox");
  const [status, setStatus] = React.useState<"all" | "pending" | "ack" | "failed">("all");
  const [items, setItems] = React.useState<AgentInboxItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchAgents().then((rows) => {
      const list = rows as ExtAgent[];
      setAgents(list);
      const fromQ = params.get("agent");
      const init = fromQ && list.find(a => a.id === fromQ) ? fromQ : (list[0]?.id ?? "");
      setAgentId(init);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selected = agents.find(a => a.id === agentId) ?? null;

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
          <div className="divide-y divide-zinc-100 dark:divide-[#2D2A45]">
            {items.map(item => {
              const from = item.payload?.from_agent_name ?? item.from_agent_id ?? "unknown";
              const to = item.to_agent_name ?? item.agent_id ?? "unknown";
              const body = String(item.payload?.text ?? "(no body)");
              const preview = body.replace(/\s+/g, " ");
              const subject = String(item.payload?.subject ?? item.type ?? "(no subject)");
              const isOpen = openId === item.id;

              return (
                <div key={item.id}>
                  <button
                    onClick={() => setOpenId(isOpen ? null : item.id)}
                    className="w-full px-4 py-3 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-zinc-500">From <span className="font-semibold text-zinc-700 dark:text-zinc-200">{from}</span></span>
                      <span className="text-zinc-400">→</span>
                      <span className="text-zinc-500">To <span className="font-semibold text-zinc-700 dark:text-zinc-200">{to}</span></span>
                      <span className="truncate text-zinc-700 dark:text-zinc-200">| {subject} — {preview}</span>
                      <span className="ml-auto text-zinc-400">{relativeTime(item.created_at)}</span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-3 text-sm">
                      <div className="rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                        <div className="mb-2 grid gap-1 text-xs text-zinc-500">
                          <div>From: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{from}</span></div>
                          <div>To: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{to}</span></div>
                          <div>Subject: <span className="font-semibold text-zinc-700 dark:text-zinc-200">{subject}</span></div>
                        </div>
                        <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">{body}</p>
                        <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-400">
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", statusBadge(item.status))}>{item.status}</span>
                          {item.corr_id && <span>Message ID: <span className="font-mono text-zinc-500">{item.corr_id}</span></span>}
                          {item.reply_to_corr_id && <span>Reply To: <span className="font-mono text-zinc-500">{item.reply_to_corr_id}</span></span>}
                          {item.thread_id && <span>Conversation: <span className="font-mono text-zinc-500">{item.thread_id}</span></span>}
                          <span className={cn("rounded-full px-2 py-0.5 font-semibold", typeBadge(item.type))}>{item.type}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
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
