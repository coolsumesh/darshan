"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  fetchThreads,
  fetchMessages,
  postMessage,
  createThread,
  type ApiThread,
  type ApiMessage,
} from "@/lib/api";
import { formatRelativeTime } from "@/lib/time";

function threadLabel(t: ApiThread) {
  return t.title ?? `Thread #${t.id.slice(0, 8)}`;
}

export default function ThreadsPage() {
  const [threads, setThreads] = React.useState<ApiThread[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [selected, setSelected] = React.useState<ApiThread | null>(null);
  const [messages, setMessages] = React.useState<ApiMessage[]>([]);
  const [msgLoading, setMsgLoading] = React.useState(false);

  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);

  const [creating, setCreating] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");

  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  // Load thread list
  React.useEffect(() => {
    fetchThreads()
      .then((res) => setThreads(res.threads))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Load messages when thread is selected
  React.useEffect(() => {
    if (!selected) return;
    setMsgLoading(true);
    fetchMessages(selected.id)
      .then((res) => setMessages(res.messages))
      .catch(() => setMessages([]))
      .finally(() => setMsgLoading(false));
  }, [selected]);

  // Scroll to bottom when messages change
  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    if (!selected || !draft.trim()) return;
    setSending(true);
    try {
      const res = await postMessage(selected.id, draft.trim());
      setMessages((prev) => [...prev, res.message]);
      setDraft("");
    } catch {
      // TODO: show toast
    } finally {
      setSending(false);
    }
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const res = await createThread(newTitle.trim() || undefined);
      setThreads((prev) => [res.thread, ...prev]);
      setSelected(res.thread);
      setMessages([]);
      setNewTitle("");
    } catch {
      // TODO: show toast
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="grid grid-cols-12 gap-4 h-[calc(100vh-10rem)]">
      {/* Thread list */}
      <div className="col-span-12 lg:col-span-4 overflow-auto">
        <Card className="h-full">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Threads</CardTitle>
              <div className="mt-1 text-xs text-muted">Your conversations</div>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={handleCreate}
              disabled={creating}
            >
              {creating ? "Creating…" : "New"}
            </Button>
          </CardHeader>
          <CardContent>
            {/* New thread title input */}
            <div className="mb-3 flex gap-2">
              <Input
                placeholder="Thread title (optional)"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>

            {loading && (
              <div className="py-8 text-center text-sm text-muted">
                Loading…
              </div>
            )}
            {error && (
              <div className="py-8 text-center text-sm text-red-500">
                {error}
              </div>
            )}
            {!loading && !error && threads.length === 0 && (
              <div className="py-8 text-center text-sm text-muted">
                No threads yet. Create one above.
              </div>
            )}

            <div className="space-y-2">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelected(t)}
                  className={`w-full text-left rounded-2xl p-4 ring-1 transition ${
                    selected?.id === t.id
                      ? "bg-brand-50 ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30"
                      : "bg-white ring-line hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                  }`}
                >
                  <div className="text-sm font-semibold truncate">
                    {threadLabel(t)}
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted">
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
      <div className="col-span-12 lg:col-span-8 flex flex-col overflow-hidden">
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="border-b border-line dark:border-slate-800">
            <CardTitle>
              {selected ? threadLabel(selected) : "Select a thread"}
            </CardTitle>
            {selected && (
              <div className="mt-1 text-xs text-muted">
                ID: {selected.id} • {selected.visibility}
              </div>
            )}
          </CardHeader>

          {/* Messages scroll area */}
          <CardContent className="flex-1 overflow-auto py-4">
            {!selected && (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Choose a thread from the left.
              </div>
            )}
            {selected && msgLoading && (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                Loading messages…
              </div>
            )}
            {selected && !msgLoading && messages.length === 0 && (
              <div className="flex h-full items-center justify-center text-sm text-muted">
                No messages yet. Say something!
              </div>
            )}
            {selected && !msgLoading && messages.length > 0 && (
              <div className="space-y-3">
                {messages.map((m) => {
                  const isHuman = m.author_type === "human";
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
                            {m.author_user_id ?? "Agent"}
                          </div>
                        )}
                        <div>{m.content}</div>
                        <div
                          className={`mt-1 text-right text-[10px] opacity-60`}
                        >
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
              <div className="flex gap-2">
                <Input
                  placeholder="Type a message…"
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
    </div>
  );
}
