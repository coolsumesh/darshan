"use client";

import * as React from "react";
import { fetchAgentChatMessages, fetchOnlineAgents, openAgentChat, sendAgentChatMessage, type ChatMessage, type OnlineAgent } from "@/lib/api";

export default function AgentChatPage() {
  const [agents, setAgents] = React.useState<OnlineAgent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const selectedAgent = React.useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId]
  );

  const loadAgents = React.useCallback(async () => {
    const list = await fetchOnlineAgents();
    setAgents(list);
    if (!selectedAgentId && list.length > 0) setSelectedAgentId(list[0]!.id);
    if (selectedAgentId && !list.some((a) => a.id === selectedAgentId)) {
      setSelectedAgentId(list[0]?.id ?? null);
    }
  }, [selectedAgentId]);

  const loadMessages = React.useCallback(async () => {
    if (!selectedAgentId) return;
    await openAgentChat(selectedAgentId);
    const data = await fetchAgentChatMessages(selectedAgentId, 100);
    setMessages(data.messages);
  }, [selectedAgentId]);

  React.useEffect(() => {
    loadAgents().catch(() => {});
    const iv = setInterval(() => {
      loadAgents().catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [loadAgents]);

  React.useEffect(() => {
    loadMessages().catch(() => {});
  }, [loadMessages]);

  React.useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/api/backend/ws`);
      ws.onmessage = (e) => {
        try {
          const evt = JSON.parse(String(e.data));
          if (evt?.type !== "message.created") return;
          const msg = evt?.data?.message as ChatMessage | undefined;
          if (!msg || msg.thread_id == null) return;
          if (!selectedAgentId) return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev;
            return [...prev, msg];
          });
        } catch {
          // ignore parse errors
        }
      };
      ws.onclose = () => {
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, [selectedAgentId]);

  async function onSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAgentId || !draft.trim() || loading) return;
    const text = draft.trim();
    setDraft("");
    setLoading(true);
    const ok = await sendAgentChatMessage(selectedAgentId, text);
    setLoading(false);
    if (!ok) {
      setDraft(text);
      return;
    }
    await loadMessages();
  }

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-3 rounded-2xl bg-white p-3 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
        <div className="mb-2 text-sm font-semibold">Agents</div>
        <div className="space-y-2">
          {agents.length === 0 && <div className="text-sm text-muted">No agents available</div>}
          {agents.map((a) => (
            <button
              key={a.id}
              onClick={() => setSelectedAgentId(a.id)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ring-1 ${selectedAgentId === a.id ? "bg-violet-50 ring-violet-300 dark:bg-violet-950/30" : "bg-white ring-line hover:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800"}`}
            >
              <div className="font-medium">{a.name}</div>
              <div className="text-xs text-muted">{a.model ?? a.agent_type ?? "agent"}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="col-span-12 lg:col-span-9 rounded-2xl bg-white p-3 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
        <div className="mb-3 border-b pb-2 text-sm font-semibold dark:border-slate-800">
          {selectedAgent ? `Chat with ${selectedAgent.name}` : "Select an online agent"}
        </div>

        <div className="mb-3 h-[60vh] space-y-2 overflow-y-auto rounded-lg bg-slate-50 p-3 dark:bg-slate-900/50">
          {messages.length === 0 && (
            <div className="text-sm text-muted">No messages yet.</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${m.author_type === "human" ? "ml-auto bg-violet-600 text-white" : "bg-white ring-1 ring-line dark:bg-slate-950 dark:ring-slate-700"}`}>
              <div className="whitespace-pre-wrap">{m.content}</div>
              <div className={`mt-1 text-[10px] ${m.author_type === "human" ? "text-violet-100" : "text-muted"}`}>
                {new Date(m.created_at).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={onSend} className="flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={selectedAgent ? `Message ${selectedAgent.name}` : "Select an agent first"}
            disabled={!selectedAgentId || loading}
            className="flex-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-line focus:ring-2 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-900"
          />
          <button
            type="submit"
            disabled={!selectedAgentId || !draft.trim() || loading}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
