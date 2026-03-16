"use client";

import * as React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchThreads,
  fetchThread,
  fetchThreadParticipants,
  fetchThreadMessages,
  fetchProjects,
  fetchTeam,
  fetchAgentsDirectory,
  sendThreadMessage,
  markThreadMessageRead,
  setThreadStatus,
  authMe,
  createLevelTestThread,
  uploadThreadAttachment,
  type AuthUser,
  type Thread,
  type ThreadMessage,
  type ThreadAttachment,
  type Project,
  type ThreadParticipant,
  type ThreadAccessRole,
} from "@/lib/api";

import { ClipboardCheck, Inbox, Send, RefreshCw, CheckCircle, ArchiveIcon, Plus, X, Paperclip } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const SLUG_COLORS: Record<string, string> = {};
const PALETTE = [
  "bg-violet-500", "bg-sky-500", "bg-emerald-500",
  "bg-amber-500",  "bg-rose-500", "bg-indigo-500",
  "bg-teal-500",   "bg-fuchsia-500",
];
function slugColor(slug: string): string {
  if (!SLUG_COLORS[slug]) {
    SLUG_COLORS[slug] = PALETTE[Object.keys(SLUG_COLORS).length % PALETTE.length];
  }
  return SLUG_COLORS[slug];
}

function Avatar({ slug, size = "md" }: { slug: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : "h-9 w-9 text-xs";
  return (
    <div className={`${dim} ${slugColor(slug)} flex shrink-0 items-center justify-center rounded-full font-bold text-white`}>
      {slug.slice(0, 2).toUpperCase()}
    </div>
  );
}

function MarkdownMessage({ body, isMe }: { body: string; isMe: boolean }) {
  const mc = (base: string) => `${base} ${isMe ? "[&_code]:bg-white/20 [&_pre]:bg-white/20" : ""}`;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:          ({ children }) => <p className="my-0.5 leading-relaxed">{children}</p>,
        li:         ({ children }) => <li className="my-0.5">{children}</li>,
        ul:         ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
        ol:         ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
        strong:     ({ children }) => <strong className="font-semibold">{children}</strong>,
        em:         ({ children }) => <em className="italic">{children}</em>,
        blockquote: ({ children }) => <blockquote className="my-1 border-l-2 border-current pl-3 opacity-70 italic">{children}</blockquote>,
        code:       ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <code className={mc("block rounded px-2 py-1 font-mono text-xs bg-black/10 dark:bg-white/10 whitespace-pre-wrap")}>{children}</code>
            : <code className={mc("rounded px-1 py-0.5 font-mono text-xs bg-black/10 dark:bg-white/10")}>{children}</code>;
        },
        pre:        ({ children }) => <pre className={mc("my-1 overflow-x-auto rounded bg-black/10 dark:bg-white/10 p-2 text-xs")}>{children}</pre>,
        a:          ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{children}</a>,
      }}
    >
      {body}
    </ReactMarkdown>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ tone, message }: { tone: "success" | "error"; message: string }) {
  return (
    <div className={`fixed top-4 right-4 z-[100] rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
      tone === "success"
        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
        : "bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200"
    }`}>
      {message}
    </div>
  );
}

// ── Message Bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe }: { msg: ThreadMessage; isMe: boolean }) {
  if (msg.type === "system") {
    return (
      <div className="flex justify-center">
        <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {msg.body}
        </span>
      </div>
    );
  }

  return (
    <div className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
      <Avatar slug={msg.sender_slug} />
      <div className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isMe
          ? "rounded-tr-sm bg-violet-600 text-white"
          : "rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
      }`}>
        <div className="mb-1 flex items-center gap-2">
          <span className={`text-[11px] font-semibold ${isMe ? "text-white/80" : "text-slate-500 dark:text-slate-400"}`}>
            {msg.sender_slug}
          </span>
          <span className={`text-[10px] ${isMe ? "text-white/50" : "text-slate-400 dark:text-slate-500"}`}>
            {relativeTime(msg.sent_at)}
          </span>
        </div>
        <MarkdownMessage body={msg.body} isMe={isMe} />
        {msg.attachments && msg.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {msg.attachments.map((att: ThreadAttachment, i: number) => (
              <a
                key={i}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs ${
                  isMe ? "bg-white/10 text-white/80 hover:bg-white/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300"
                }`}
              >
                <Paperclip className="h-3 w-3" />
                <span className="max-w-[120px] truncate">{att.filename}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Thread row in sidebar list ────────────────────────────────────────────────

function ThreadRow({
  thread,
  preview,
  previewTime,
  selected,
  onClick,
}: {
  thread: Thread;
  preview: string;
  previewTime: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
        selected
          ? "bg-violet-50 dark:bg-violet-950/30"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
      }`}
    >
      <Avatar slug={thread.created_slug} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className={`truncate text-sm font-medium ${selected ? "text-violet-700 dark:text-violet-300" : "text-slate-700 dark:text-slate-200"}`}>
            {thread.subject}
          </span>
          <span className="shrink-0 text-[10px] text-slate-400">{previewTime}</span>
        </div>
        {preview && (
          <p className="mt-0.5 truncate text-xs text-slate-400">{preview}</p>
        )}
      </div>
    </button>
  );
}

// ── New Level Test Modal ──────────────────────────────────────────────────────

function NewLevelTestModal({
  projects,
  defaultProjectId,
  onClose,
  onCreate,
}: {
  projects: Project[];
  defaultProjectId: string | null;
  onClose: () => void;
  onCreate: (thread: Thread) => void;
}) {
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [pid, setPid] = React.useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [creating, setCreating] = React.useState(false);

  const handleCreate = async () => {
    if (!subject.trim() || !pid || creating) return;
    setCreating(true);
    const thread = await createLevelTestThread(pid, subject.trim(), body.trim() || undefined);
    setCreating(false);
    if (thread) onCreate(thread);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">New Level Test</h2>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-slate-500">Project</label>
            <select
              value={pid}
              onChange={(e) => setPid(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Subject</label>
            <input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              placeholder="e.g. Level 3 assessment — context handling"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Body <span className="text-slate-400">(optional)</span></label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              placeholder="Describe the test..."
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder-slate-400 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!subject.trim() || !pid || creating}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function LevelTestsPage() {
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [selected, setSelected] = React.useState<Thread | null>(null);
  const [me, setMe] = React.useState<AuthUser | null>(null);
  const [previews, setPreviews] = React.useState<Record<string, { text: string; time: string }>>({});
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [draftAttachments, setDraftAttachments] = React.useState<ThreadAttachment[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [threadStatusFilter, setThreadStatusFilter] = React.useState<"open" | "closed">("open");
  const [closing, setClosing] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [threadParticipants, setThreadParticipants] = React.useState<ThreadParticipant[]>([]);
  const [threadRole, setThreadRole] = React.useState<ThreadAccessRole | null>(null);
  const [toast, setToast] = React.useState<{ tone: "success" | "error"; message: string } | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  // Load current user
  React.useEffect(() => {
    authMe().then((u) => { if (u) setMe(u); });
  }, []);

  // Load projects
  React.useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // Load thread list (level_test type only)
  const loadThreads = React.useCallback(async (
    pid?: string | null,
    statusFilter?: "open" | "closed",
    opts?: { silent?: boolean }
  ) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);

    const s = statusFilter ?? threadStatusFilter;
    const data = await fetchThreads(pid ?? projectId, s, undefined, { type: "level_test" });
    setThreads(data);

    // Load last message preview for each thread
    const previewMap: Record<string, { text: string; time: string }> = {};
    await Promise.all(
      data.map(async (t) => {
        const msgs = await fetchThreadMessages(t.thread_id, 20);
        const last = msgs.filter((m) => m.type === "message").at(-1);
        previewMap[t.thread_id] = {
          text: last ? last.body.slice(0, 80) : "",
          time: last ? relativeTime(last.sent_at) : relativeTime(t.created_at),
        };
      })
    );
    setPreviews(previewMap);

    if (!silent) setLoading(false);
  }, [projectId, threadStatusFilter]);

  React.useEffect(() => { loadThreads(projectId, threadStatusFilter); }, [projectId, threadStatusFilter]); // eslint-disable-line

  const selectThread = async (thread: Thread) => {
    setSelected(thread);
    setDraft("");
    setDraftAttachments([]);
    const detail = await fetchThread(thread.thread_id);
    if (detail) {
      setSelected(detail.thread);
      setThreadParticipants(detail.participants);
      setThreadRole(detail.role);
    }
    const recent = await fetchThreadMessages(thread.thread_id, 5);
    setMessages(recent);
    // Load remaining in background
    setTimeout(async () => {
      const full = await fetchThreadMessages(thread.thread_id, 50);
      setMessages(full);
    }, 0);
  };

  // Load messages when thread selected
  React.useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Mark incoming messages as read
  React.useEffect(() => {
    if (!selected || !me || messages.length === 0) return;
    const unread = messages.filter((m) => m.sender_id !== me.id);
    for (const m of unread) {
      markThreadMessageRead(selected.thread_id, m.message_id).catch(() => {});
    }
  }, [messages, selected?.thread_id, me?.id]); // eslint-disable-line

  // WebSocket for real-time updates
  React.useEffect(() => {
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/api/backend/ws`);

      ws.onmessage = (e) => {
        try {
          const evt = JSON.parse(String(e.data));
          const type = evt?.type as string | undefined;
          const data = evt?.data as any;

          if (type === "thread.message_created") {
            const threadId = data?.thread_id as string | undefined;
            const msg = data?.message as ThreadMessage | undefined;
            if (!threadId || !msg) return;

            if (selected && selected.thread_id === threadId) {
              setMessages((prev) => prev.some((m) => m.message_id === msg.message_id) ? prev : [...prev, msg]);
              if (me && msg.sender_id !== me.id) {
                markThreadMessageRead(threadId, msg.message_id).catch(() => {});
              }
            }
            loadThreads(projectId, threadStatusFilter, { silent: true });
          }

          if (type === "thread.updated") {
            const thread = data?.thread as Thread | undefined;
            if (!thread?.thread_id) return;
            setThreads((prev) => prev.map((item) => (item.thread_id === thread.thread_id ? { ...item, ...thread } : item)));
            if (selected?.thread_id === thread.thread_id) {
              setSelected((prev) => (prev ? { ...prev, ...thread } : prev));
            }
          }
        } catch {}
      };

      ws.onclose = () => {
        retryTimeout = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      ws?.close();
      clearTimeout(retryTimeout);
    };
  }, [selected?.thread_id, me?.id, projectId, threadStatusFilter]); // eslint-disable-line

  const handleSend = async () => {
    if (!selected || sending || (!draft.trim() && draftAttachments.length === 0)) return;
    setSending(true);
    try {
      const result = await sendThreadMessage(selected.thread_id, draft.trim(), draftAttachments);
      if (result.ok) {
        setDraft("");
        setDraftAttachments([]);
      } else {
        setToast({ tone: "error", message: `Failed to send: ${result.error ?? "unknown error"}` });
      }
    } finally {
      setSending(false);
    }
  };

  const handleAttach = async (ev: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected) return;
    const file = ev.target.files?.[0];
    if (!file) return;
    const uploaded = await uploadThreadAttachment(selected.thread_id, file);
    if (uploaded) setDraftAttachments((prev) => [...prev, uploaded]);
    ev.target.value = "";
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if ((e.nativeEvent as any)?.isComposing) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSetStatus = async (newStatus: "open" | "closed" | "archived") => {
    if (!selected) return;
    setClosing(true);
    await setThreadStatus(selected.thread_id, newStatus);
    setClosing(false);
    setThreads((prev) => prev.filter((t) => t.thread_id !== selected.thread_id));
    setSelected(null);
  };

  const sortedThreads = [...threads].sort((a, b) => {
    const ta = a.last_activity ?? a.created_at;
    const tb = b.last_activity ?? b.created_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  const handleThreadCreated = async (thread: Thread) => {
    setComposeOpen(false);
    await loadThreads(thread.project_id, threadStatusFilter);
    await selectThread(thread);
  };

  const activeParticipants = React.useMemo(
    () => threadParticipants.filter((p) => !p.removed_at),
    [threadParticipants]
  );

  return (
    <>
    {toast && <Toast tone={toast.tone} message={toast.message} />}
    {composeOpen && (
      <NewLevelTestModal
        projects={projects}
        defaultProjectId={projectId}
        onClose={() => setComposeOpen(false)}
        onCreate={handleThreadCreated}
      />
    )}
    <div className="flex h-full overflow-hidden">

      {/* ── Left: thread list ─────────────────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Level Tests</span>
              {threads.length > 0 && (
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                  {threads.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setComposeOpen(true)}
                title="New Level Test"
                className="rounded-lg p-1 text-slate-400 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => loadThreads(projectId, threadStatusFilter)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Project filter */}
          {projects.length > 0 && (
            <div className="px-3 pb-2">
              <select
                value={projectId ?? ""}
                onChange={(e) => { setProjectId(e.target.value || null); setSelected(null); setMessages([]); }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 outline-none hover:border-violet-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <option value="">All projects</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          {(["open", "closed"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setThreadStatusFilter(s)}
              className={`flex-1 py-1.5 text-xs font-medium capitalize transition ${
                threadStatusFilter === s
                  ? "border-b-2 border-violet-500 text-violet-600 dark:text-violet-400"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {loading ? (
            <div className="flex flex-col gap-3 p-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-24 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-2.5 w-40 rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
              <ClipboardCheck className="h-8 w-8 opacity-40" />
              <span className="text-sm">No level tests yet</span>
            </div>
          ) : (
            sortedThreads.map((t) => (
              <ThreadRow
                key={t.thread_id}
                thread={t}
                preview={previews[t.thread_id]?.text ?? ""}
                previewTime={previews[t.thread_id]?.time ?? relativeTime(t.created_at)}
                selected={selected?.thread_id === t.thread_id}
                onClick={() => selectThread(t)}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Right: conversation ───────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col bg-slate-50 dark:bg-slate-900">
        {selected ? (
          <>
            {/* Thread header */}
            <div className="border-b border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {selected.subject}
                    </div>
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                      Level Test
                    </span>
                    <span className="font-mono text-[10px] text-slate-400" title={selected.thread_id}>
                      {selected.thread_id.slice(0, 8)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Started by {selected.created_slug} · {relativeTime(selected.created_at)}
                  </div>
                  {activeParticipants.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {activeParticipants.map((p) => (
                        <span
                          key={p.participant_id}
                          className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        >
                          <span className={`h-2 w-2 rounded-full ${slugColor(p.participant_slug)}`} />
                          {p.participant_slug}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {selected.status !== "closed" && (
                    <button
                      onClick={() => handleSetStatus("closed")}
                      disabled={closing}
                      title="Close"
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      Close
                    </button>
                  )}
                  {selected.status === "closed" && (
                    <button
                      onClick={() => handleSetStatus("open")}
                      disabled={closing}
                      title="Reopen"
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-violet-400 hover:text-violet-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Reopen
                    </button>
                  )}
                  <button
                    onClick={() => handleSetStatus("archived")}
                    disabled={closing}
                    title="Archive"
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                  >
                    <ArchiveIcon className="h-3.5 w-3.5" />
                    Archive
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 bg-white dark:bg-slate-900">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Loading messages...
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg.message_id}
                    msg={msg}
                    isMe={!!me && msg.sender_id === me.id}
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Compose */}
            <div className="border-t border-slate-200 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-950">
              {draftAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {draftAttachments.map((att, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <Paperclip className="h-3 w-3" />
                      <span className="max-w-[100px] truncate">{att.filename}</span>
                      <button onClick={() => setDraftAttachments((prev) => prev.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-500">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  onChange={handleAttach}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Type a message..."
                  rows={1}
                  className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <button
                  onClick={handleSend}
                  disabled={sending || (!draft.trim() && draftAttachments.length === 0)}
                  className="rounded-lg bg-violet-600 p-2.5 text-white transition hover:bg-violet-700 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <ClipboardCheck className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
              <p className="mt-3 text-sm text-slate-400">Select a level test or create a new one</p>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}
