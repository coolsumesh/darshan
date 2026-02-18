"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchProjectThreads,
  fetchThreads,
  fetchAgents,
  fetchMessages,
  postMessage,
  createThread,
  type ApiAgent,
  type ApiThread,
  type ApiMessage,
} from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { formatRelativeTime } from "@/lib/time";

function threadLabel(t: ApiThread) {
  return t.title ?? `Thread #${t.id.slice(0, 8)}`;
}

/** Resolve display name for a message sender */
function senderName(
  msg: ApiMessage,
  agentMap: Map<string, ApiAgent>,
): string {
  if (msg.author_type === "human") return msg.author_user_id ?? "Human";
  if (msg.author_type === "system") return "System";
  if (msg.author_agent_id) {
    const agent = agentMap.get(msg.author_agent_id);
    if (agent) return agent.name;
  }
  return "Agent";
}

export default function ThreadsPage() {
  const { selected: project } = useProject();

  const [threads, setThreads] = React.useState<ApiThread[]>([]);
  const [agents, setAgents] = React.useState<ApiAgent[]>([]);
  const [agentMap, setAgentMap] = React.useState<Map<string, ApiAgent>>(new Map());
  const [loading, setLoading] = React.useState(true);

  const [selected, setSelected] = React.useState<ApiThread | null>(null);
  const [messages, setMessages] = React.useState<ApiMessage[]>([]);
  const [msgLoading, setMsgLoading] = React.useState(false);

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>([]);

  const [newTitle, setNewTitle] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [showThreadList, setShowThreadList] = React.useState(true);

  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Load threads (project-scoped when available) + agents
  function loadThreads(projectId?: string) {
    setLoading(true);
    const threadsReq = projectId ? fetchProjectThreads(projectId) : fetchThreads();
    Promise.all([threadsReq, fetchAgents()])
      .then(([threadRes, agentRes]) => {
        setThreads(threadRes.threads);
        setAgents(agentRes.agents);

        // Build id → agent lookup map
        const map = new Map<string, ApiAgent>();
        for (const a of agentRes.agents) map.set(a.id, a);
        setAgentMap(map);

        // Auto-select first thread
        if (threadRes.threads.length > 0) {
          setSelected((prev) => prev ?? threadRes.threads[0]);
        }
      })
      .finally(() => setLoading(false));
  }

  React.useEffect(() => {
    loadThreads(project?.id);
  }, [project?.id]);

  // Load messages + start polling when thread changes
  React.useEffect(() => {
    if (!selected) return;
    setMsgLoading(true);
    fetchMessages(selected.id)
      .then((res) => setMessages(res.messages))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false));

    // Poll every 3s for new messages
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(() => {
      fetchMessages(selected.id)
        .then((res) => setMessages(res.messages))
        .catch(() => {});
    }, 3000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [selected?.id]);

  // Scroll to bottom on new messages
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      await postMessage(selected.id, draft.trim(), selectedAgentIds);
      setDraft("");
      // Immediately reload messages
      const res = await fetchMessages(selected.id);
      setMessages(res.messages);
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await createThread(newTitle.trim() || undefined, project?.id);
      setThreads((prev) => [res.thread, ...prev]);
      setSelected(res.thread);
      setMessages([]);
      setNewTitle("");
    } finally {
      setCreating(false);
    }
  }

  const onlineAgents = agents.filter((a) => a.status === "online");

  return (
    <div className="flex gap-4" style={{ height: "calc(100vh - 9rem)" }}>

      {/* Thread list — collapsible */}
      <div
        className={`flex-shrink-0 ${
          showThreadList ? "w-72" : "w-0 overflow-hidden"
        } flex flex-col gap-3 transition-all`}
      >
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-sm">Threads</CardTitle>
              {project && (
                <div className="mt-0.5 text-xs text-muted">{project.name}</div>
              )}
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "…" : "New"}
            </Button>
          </CardHeader>

          <CardContent className="flex flex-col gap-3 flex-1 overflow-auto pt-0">
            <Input
              placeholder="Thread title…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />

            {loading && (
              <div className="text-xs text-muted text-center py-4">Loading…</div>
            )}
            {!loading && threads.length === 0 && (
              <div className="text-xs text-muted text-center py-4">
                No threads yet.
              </div>
            )}

            <div className="space-y-1">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setSelected(t);
                    setShowThreadList(false);
                  }}
                  className={`w-full text-left rounded-xl p-3 ring-1 transition text-sm ${
                    selected?.id === t.id
                      ? "bg-brand-50 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30 font-semibold"
                      : "bg-white ring-line hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800"
                  }`}
                >
                  <div className="truncate font-medium">{threadLabel(t)}</div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                    <Badge tone="neutral">{t.visibility}</Badge>
                    <span>{formatRelativeTime(t.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Message pane */}
      <Card className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <CardHeader className="border-b border-line dark:border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowThreadList((v) => !v)}
              className="text-xs text-muted hover:text-slate-700 dark:hover:text-slate-200 rounded-lg px-2 py-1 ring-1 ring-line"
            >
              {showThreadList ? "← hide" : "☰ threads"}
            </button>
            <div>
              <CardTitle className="text-sm">
                {selected ? threadLabel(selected) : "Select a thread"}
              </CardTitle>
              {selected && (
                <div className="text-xs text-muted">{selected.id.slice(0, 8)}</div>
              )}
            </div>
          </div>

          {/* Agent selector — only show online agents */}
          {selected && onlineAgents.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="text-xs text-muted self-center">Reply from:</span>
              {onlineAgents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() =>
                    setSelectedAgentIds((prev) =>
                      prev.includes(a.id)
                        ? prev.filter((id) => id !== a.id)
                        : [...prev, a.id]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-xs ring-1 transition ${
                    selectedAgentIds.includes(a.id)
                      ? "bg-brand-600 text-white ring-brand-600"
                      : "bg-white ring-line text-slate-700 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700"
                  }`}
                >
                  {a.name}
                </button>
              ))}
              {selectedAgentIds.length > 0 && (
                <span className="text-xs text-muted self-center">will respond</span>
              )}
            </div>
          )}
        </CardHeader>

        {/* Messages */}
        <CardContent className="flex-1 overflow-auto py-4 min-h-0">
          {!selected && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Click a thread on the left to open it.
            </div>
          )}
          {selected && msgLoading && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              Loading…
            </div>
          )}
          {selected && !msgLoading && messages.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted">
              No messages yet — type below to start.
            </div>
          )}
          {selected && !msgLoading && messages.length > 0 && (
            <div className="space-y-3 px-1">
              {messages.map((m) => {
                const isHuman = m.author_type === "human";
                const name = senderName(m, agentMap);
                return (
                  <div
                    key={m.id}
                    className={`flex ${isHuman ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm ${
                        isHuman
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      }`}
                    >
                      {!isHuman && (
                        <div className="mb-1 text-xs font-semibold opacity-70">
                          {name}
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      <div className="mt-1 text-right text-[10px] opacity-60">
                        {formatRelativeTime(m.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          )}
        </CardContent>

        {/* Send bar */}
        {selected && (
          <div className="border-t border-line p-4 dark:border-slate-800">
            {selectedAgentIds.length === 0 && (
              <div className="mb-2 text-xs text-amber-600 dark:text-amber-400">
                💡 Select an agent above to get a reply (Mithran or Komal).
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Type a message… (Enter to send)"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={sending}
              />
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={sending || !draft.trim()}
              >
                {sending ? "…" : "Send"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
