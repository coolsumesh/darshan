"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchThreads,
  fetchThread,
  fetchThreadMessages,
  fetchProjects,
  fetchTeam,
  sendThreadMessage,
  setThreadStatus,
  createThread,
  type Thread,
  type ThreadMessage,
  type Project,
} from "@/lib/api";
import { ChevronDown, Inbox, Send, RefreshCw, CheckCircle, ArchiveIcon, Plus, X, Mic, Square } from "lucide-react";

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

function getMentionContext(text: string, cursor: number) {
  const uptoCursor = text.slice(0, cursor);
  const match = uptoCursor.match(/(?:^|\s)@([A-Za-z0-9_-]*)$/);
  if (!match) return null;
  const atIndex = uptoCursor.lastIndexOf("@");
  return { query: match[1] ?? "", start: atIndex, end: cursor };
}

function highlightMentions(text: string, knownSlugs: Set<string>): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /@([A-Za-z0-9_-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const slug = m[1];
    const known = knownSlugs.has(slug.toUpperCase());
    parts.push(
      <span
        key={`m${m.index}`}
        className={known
          ? "rounded bg-violet-100 px-1 py-0.5 font-semibold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
          : "rounded bg-slate-100 px-1 py-0.5 font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300"}
      >
        @{slug}
      </span>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 0 ? text : parts.length === 1 ? parts[0] : <>{parts}</>;
}

function processChildren(children: React.ReactNode, knownSlugs: Set<string>): React.ReactNode {
  return React.Children.map(children, child =>
    typeof child === "string" ? highlightMentions(child, knownSlugs) : child
  );
}

function MarkdownMessage({ body, knownSlugs, isMe }: { body: string; knownSlugs: Set<string>; isMe: boolean }) {
  const mc = (base: string) => `${base} ${isMe ? "[&_code]:bg-white/20 [&_pre]:bg-white/20" : ""}`;
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p:          ({ children }) => <p className="my-0.5 leading-relaxed">{processChildren(children, knownSlugs)}</p>,
        li:         ({ children }) => <li className="my-0.5">{processChildren(children, knownSlugs)}</li>,
        ul:         ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
        ol:         ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
        h1:         ({ children }) => <h1 className="mt-2 mb-1 text-base font-bold">{processChildren(children, knownSlugs)}</h1>,
        h2:         ({ children }) => <h2 className="mt-2 mb-1 text-sm font-bold">{processChildren(children, knownSlugs)}</h2>,
        h3:         ({ children }) => <h3 className="mt-1 mb-0.5 text-sm font-semibold">{processChildren(children, knownSlugs)}</h3>,
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
        input:      ({ checked }) => <input type="checkbox" checked={!!checked} readOnly className="mr-1.5 mt-0.5 align-middle accent-violet-500" />,
        a:          ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline opacity-80 hover:opacity-100">{children}</a>,
      }}
    >
      {body}
    </ReactMarkdown>
  );
}

// ── Thread list row ───────────────────────────────────────────────────────────

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
      className={`w-full px-4 py-3 text-left transition-colors hover:bg-slate-100 dark:hover:bg-slate-800 ${
        selected
          ? "border-l-2 border-violet-500 bg-violet-50 dark:bg-violet-950/30"
          : "border-l-2 border-transparent"
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar slug={thread.created_slug} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {thread.created_slug}
            </span>
            <span className="shrink-0 text-[11px] text-slate-400">{previewTime}</span>
          </div>
          <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
            {thread.subject}
          </div>
          <div className="truncate text-xs text-slate-400 dark:text-slate-500">
            {preview || "No messages yet"}
          </div>
        </div>
      </div>
    </button>
  );
}

function formatTaskStatus(status: Thread["task_status"]): string {
  if (!status) return "No task status";
  if (status === "in-progress") return "In Progress";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

// ── Message bubble ────────────────────────────────────────────────────────────

function MessageBubble({ msg, isMe, knownSlugs }: { msg: ThreadMessage; isMe: boolean; knownSlugs: Set<string> }) {
  return (
    <div className={`flex items-start gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
      <Avatar slug={msg.sender_slug} size="sm" />
      <div className={`max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col gap-1`}>
        <div className="flex items-baseline gap-2">
          {!isMe && (
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              {msg.sender_slug}
            </span>
          )}
          <span className="text-[10px] text-slate-400">{relativeTime(msg.sent_at)}</span>
        </div>
        <div
          className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            isMe
              ? "rounded-tr-sm bg-violet-600 text-white"
              : msg.type === "event"
              ? "bg-transparent text-xs italic text-slate-400"
              : "rounded-tl-sm bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700"
          }`}
        >
          {msg.type === "event"
            ? highlightMentions(msg.body, knownSlugs)
            : <MarkdownMessage body={msg.body} knownSlugs={knownSlugs} isMe={isMe} />}
        </div>
      </div>
    </div>
  );
}

// ── New Thread Modal ──────────────────────────────────────────────────────────

function NewThreadModal({
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
  const [projectId, setProjectId] = React.useState(defaultProjectId ?? projects[0]?.id ?? "");
  const [agents, setAgents] = React.useState<{ agentId: string; agentName: string }[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  // Load agents when project changes
  React.useEffect(() => {
    if (!projectId) return;
    fetchTeam(projectId).then((team) => {
      setAgents(team.map((m) => ({ agentId: m.agentId, agentName: m.agent?.name ?? m.agentId })));
    });
  }, [projectId]);

  const toggle = (id: string) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleCreate = async () => {
    if (!subject.trim()) { setError("Subject is required"); return; }
    if (!projectId)       { setError("Select a project");    return; }
    setSaving(true); setError("");
    const thread = await createThread(subject.trim(), projectId, Array.from(selected).map(String));
    setSaving(false);
    if (!thread) { setError("Failed to create thread"); return; }
    onCreate(thread);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">New Thread</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Subject */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Subject</label>
            <input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="What is this thread about?"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          {/* Project */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Project</label>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Participants */}
          {agents.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Participants <span className="text-slate-400">(optional)</span>
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {agents.map((a) => (
                  <label key={a.agentId} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input
                      type="checkbox"
                      checked={selected.has(a.agentId)}
                      onChange={() => toggle(a.agentId)}
                      className="accent-violet-600"
                    />
                    <Avatar slug={a.agentName.toUpperCase().slice(0, 8)} size="sm" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{a.agentName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving || !subject.trim()}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {saving ? "Creating…" : "Create Thread"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ThreadsPage() {
  const [deepLinkThreadId, setDeepLinkThreadId] = React.useState<string | null>(null);
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [selected, setSelected] = React.useState<Thread | null>(null);
  const [previews, setPreviews] = React.useState<Record<string, { text: string; time: string }>>({});
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [isListening, setIsListening] = React.useState(false);
  const [voiceSupported, setVoiceSupported] = React.useState(false);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [threadStatusFilter, setThreadStatusFilter] = React.useState<"open" | "closed">("open");
  const [threadSearch, setThreadSearch] = React.useState("");
  const [debouncedThreadSearch, setDebouncedThreadSearch] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [mentionSlugs, setMentionSlugs] = React.useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [mentionCtx, setMentionCtx] = React.useState<{ query: string; start: number; end: number } | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const recognitionRef = React.useRef<any>(null);
  const voiceBaseDraftRef = React.useRef("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("thread_id");
    setDeepLinkThreadId(tid && tid.trim() ? tid.trim() : null);
  }, []);

  // Load projects once
  React.useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedThreadSearch(threadSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [threadSearch]);

  // Load thread list
  const loadThreads = React.useCallback(async (
    pid?: string | null,
    statusFilter?: "open" | "closed",
    opts?: { silent?: boolean; search?: string }
  ) => {
    const silent = opts?.silent ?? false;
    if (!silent) setLoading(true);

    const s = statusFilter ?? threadStatusFilter;
    const data = await fetchThreads(pid ?? projectId, s, opts?.search ?? debouncedThreadSearch);
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
  }, []);

  React.useEffect(() => { loadThreads(projectId, threadStatusFilter, { search: debouncedThreadSearch }); }, [projectId, threadStatusFilter, debouncedThreadSearch]); // eslint-disable-line

  React.useEffect(() => {
    const threadId = deepLinkThreadId?.trim();
    if (!threadId) return;
    if (selected?.thread_id === threadId) return;

    const pickThread = async () => {
      const existing = threads.find((t) => t.thread_id === threadId);
      if (existing) {
        setSelected(existing);
        const msgs = await fetchThreadMessages(existing.thread_id, 200);
        setMessages(msgs);
        return;
      }

      const direct = await fetchThread(threadId);
      if (!direct) return;

      setProjectId(direct.project_id ?? null);
      setThreadStatusFilter(direct.status === "open" ? "open" : "closed");
      setThreads((prev) => (prev.some((t) => t.thread_id === direct.thread_id) ? prev : [direct, ...prev]));
      setSelected(direct);
      const msgs = await fetchThreadMessages(direct.thread_id, 200);
      setMessages(msgs);
    };

    pickThread().catch(() => {});
  }, [deepLinkThreadId, threads, selected?.thread_id]);

  const handleProjectChange = (pid: string | null) => {
    setProjectId(pid);
    setSelected(null);
    setMessages([]);
    setDropdownOpen(false);
  };

  // Load messages when thread selected
  React.useEffect(() => {
    if (!selected) return;
    fetchThreadMessages(selected.thread_id, 200).then(setMessages).catch(() => {});
  }, [selected?.thread_id]); // eslint-disable-line

  React.useEffect(() => {
    if (!selected) {
      setMentionSlugs([]);
      return;
    }

    const fromMessages = messages.map((m) => m.sender_slug.toUpperCase());
    const fallback = Array.from(new Set([selected.created_slug.toUpperCase(), ...fromMessages]));

    if (!selected.project_id) {
      setMentionSlugs(fallback);
      return;
    }

    fetchTeam(selected.project_id)
      .then((team) => {
        const fromTeam = team.map((m) => (m.agent?.name ?? "").toUpperCase()).filter(Boolean);
        const merged = Array.from(new Set([selected.created_slug.toUpperCase(), ...fromTeam, ...fromMessages]));
        setMentionSlugs(merged);
      })
      .catch(() => setMentionSlugs(fallback));
  }, [selected?.thread_id, selected?.project_id, messages]); // eslint-disable-line

  // Push-based realtime updates (no polling fallback in UI)
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
            }
            loadThreads(projectId, threadStatusFilter, { silent: true, search: debouncedThreadSearch });
            return;
          }

          if (type === "thread.created" || type === "thread.status_changed" || type === "thread.deleted") {
            loadThreads(projectId, threadStatusFilter, { silent: true, search: debouncedThreadSearch });
          }
        } catch {
          // Ignore malformed websocket events
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
  }, [selected?.thread_id, projectId, threadStatusFilter, loadThreads]);

  const selectThread = React.useCallback(async (thread: Thread) => {
    setSelected(thread);
    setMessages([]);
    const msgs = await fetchThreadMessages(thread.thread_id, 200);
    setMessages(msgs);
  }, []);

  // Scroll to bottom when messages load
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const mentionSuggestions = React.useMemo(() => {
    if (!mentionCtx) return [] as string[];
    const q = mentionCtx.query.toUpperCase();
    return mentionSlugs.filter((s) => s.startsWith(q)).slice(0, 8);
  }, [mentionSlugs, mentionCtx]);

  const applyMention = (slug: string) => {
    if (!mentionCtx) return;
    const before = draft.slice(0, mentionCtx.start + 1);
    const after = draft.slice(mentionCtx.end);
    const suffix = after.startsWith(" ") || after.length === 0 ? "" : " ";
    const next = `${before}${slug}${suffix}${after}`;
    setDraft(next);
    setMentionOpen(false);
    setMentionCtx(null);
    setMentionIndex(0);
    setTimeout(() => {
      const pos = (before + slug + suffix).length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  const handleSend = async () => {
    if (!selected || !draft.trim() || sending) return;
    setSending(true);
    const msg = await sendThreadMessage(selected.thread_id, draft.trim());
    if (msg) {
      // Do not append optimistically here.
      // WebSocket thread.message_created is the single source of truth and avoids duplicate flashes.
      setDraft("");
      setMentionOpen(false);
      setMentionCtx(null);
      setMentionIndex(0);
    }
    setSending(false);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => (i + 1) % mentionSuggestions.length); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); applyMention(mentionSuggestions[mentionIndex]); return; }
      if (e.key === "Escape") { e.preventDefault(); setMentionOpen(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  React.useEffect(() => {
    const supported = typeof window !== "undefined" && ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);
    setVoiceSupported(supported);

    return () => {
      try { recognitionRef.current?.stop?.(); } catch {}
    };
  }, []);

  const handleVoiceInput = () => {
    if (!voiceSupported || isListening) return;

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    const recognition = new SpeechRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    voiceBaseDraftRef.current = draft;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.onresult = (event: any) => {
      let finalText = "";
      let interimText = "";

      for (let i = 0; i < event.results.length; i++) {
        const chunk = String(event.results[i]?.[0]?.transcript ?? "").trim();
        if (!chunk) continue;
        if (event.results[i].isFinal) finalText += `${finalText ? " " : ""}${chunk}`;
        else interimText += `${interimText ? " " : ""}${chunk}`;
      }

      const spoken = `${finalText}${finalText && interimText ? " " : ""}${interimText}`.trim();
      const base = voiceBaseDraftRef.current.trim();
      setDraft(`${base}${base && spoken ? " " : ""}${spoken}`.trim());
    };

    recognition.start();
  };

  const stopVoiceInput = () => {
    try { recognitionRef.current?.stop?.(); } catch {}
    setIsListening(false);
  };

  const handleSetStatus = async (newStatus: "open" | "closed" | "archived") => {
    if (!selected) return;
    setClosing(true);
    await setThreadStatus(selected.thread_id, newStatus);
    setClosing(false);
    // Remove from current list and clear selection
    setThreads((prev) => prev.filter((t) => t.thread_id !== selected.thread_id));
    setSelected(null);
  };

  // Sort threads: most recent preview first
  const sortedThreads = [...threads].sort((a, b) => {
    const ta = previews[a.thread_id]?.time ?? a.created_at;
    const tb = previews[b.thread_id]?.time ?? b.created_at;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const handleThreadCreated = async (thread: Thread) => {
    setComposeOpen(false);
    // Reload list then open the new thread
    await loadThreads(thread.project_id, threadStatusFilter, { search: debouncedThreadSearch });
    setSelected(thread);
    const msgs = await fetchThreadMessages(thread.thread_id, 200);
    setMessages(msgs);
  };

  return (
    <>
    {composeOpen && (
      <NewThreadModal
        projects={projects}
        defaultProjectId={projectId}
        onClose={() => setComposeOpen(false)}
        onCreate={handleThreadCreated}
      />
    )}
    <div className="flex h-[calc(100vh-5rem)] overflow-hidden rounded-2xl ring-1 ring-line dark:ring-slate-800">

      {/* ── Left: thread list ─────────────────────────────────────────────── */}
      <div className="flex w-80 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-violet-500" />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Threads</span>
              {threads.length > 0 && (
                <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-bold text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
                  {threads.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setComposeOpen(true)}
                title="New thread"
                className="rounded-lg p-1 text-slate-400 hover:bg-violet-50 hover:text-violet-600 dark:hover:bg-violet-950/30"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => loadThreads(projectId, threadStatusFilter, { search: debouncedThreadSearch })}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Project filter */}
          {projects.length > 0 && (
            <div className="relative px-3 pb-2">
              <button
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 hover:border-violet-300 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                <span className="truncate">
                  {projectId
                    ? (projects.find((p) => p.id === projectId)?.name ?? "Project")
                    : "All threads"}
                </span>
                <ChevronDown className="ml-1 h-3 w-3 shrink-0 text-slate-400" />
              </button>
              {dropdownOpen && (
                <div className="absolute left-3 right-3 top-full z-20 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <button
                    onClick={() => handleProjectChange(null)}
                    className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 ${!projectId ? "font-semibold text-violet-600" : "text-slate-600 dark:text-slate-300"}`}
                  >
                    All threads
                  </button>
                  {projects.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleProjectChange(p.id)}
                      className={`w-full px-3 py-2 text-left text-xs hover:bg-slate-50 dark:hover:bg-slate-800 ${projectId === p.id ? "font-semibold text-violet-600" : "text-slate-600 dark:text-slate-300"}`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="px-3 pb-2">
          <input
            value={threadSearch}
            onChange={(e) => setThreadSearch(e.target.value)}
            placeholder="Search threads…"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          />
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
                    <div className="h-2 w-32 rounded bg-slate-100 dark:bg-slate-800" />
                  </div>
                </div>
              ))}
            </div>
          ) : threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
              <Inbox className="h-8 w-8 opacity-40" />
              <span className="text-sm">No threads yet</span>
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

        {/* Channel docs shortcut (below thread list) */}
        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <Link
            href="/threads/darshan-channel-enablement"
            className="block rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-700 hover:bg-violet-100 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300"
          >
            <div className="font-semibold">Darshan Channel Enablement Docs</div>
            <div className="mt-0.5 text-[11px] opacity-80">Files, source code, install paths, runtime + troubleshooting</div>
          </Link>
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
                    <span className="font-mono text-[10px] text-slate-400" title={selected.thread_id}>
                      {selected.thread_id}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-400">
                    Started by {selected.created_slug} · {relativeTime(selected.created_at)}
                  </div>
                  {selected.thread_type === "task" && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        Task
                      </span>
                      {selected.task_status && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {formatTaskStatus(selected.task_status)}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {selected.assignee_name ? `Assignee: ${selected.assignee_name}` : "Unassigned"}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {selected.status !== "closed" && (
                    <button
                      onClick={() => handleSetStatus("closed")}
                      disabled={closing}
                      title={selected.thread_type === "task" ? "Complete task" : "Close thread"}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-emerald-400 hover:text-emerald-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {selected.thread_type === "task" ? "Mark done" : "Close"}
                    </button>
                  )}
                  {selected.status === "closed" && (
                    <button
                      onClick={() => handleSetStatus("open")}
                      disabled={closing}
                      title={selected.thread_type === "task" ? "Reopen task" : "Reopen thread"}
                      className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-violet-400 hover:text-violet-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      {selected.thread_type === "task" ? "Reopen task" : "Reopen"}
                    </button>
                  )}
                  <button
                    onClick={() => handleSetStatus("archived")}
                    disabled={closing}
                    title="Archive thread"
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                  >
                    <ArchiveIcon className="h-3.5 w-3.5" />
                    Archive
                  </button>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-400">
                  Loading messages…
                </div>
              ) : (
                messages.map((msg) => (
                  <MessageBubble
                    key={msg.message_id}
                    msg={msg}
                    isMe={msg.sender_slug === "SANJAYA"}
                    knownSlugs={new Set(mentionSlugs)}
                  />
                ))
              )}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              <div className="relative flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  rows={2}
                  value={draft}
                  onChange={(e) => {
                    const text = e.target.value;
                    setDraft(text);
                    const ctx = getMentionContext(text, e.target.selectionStart ?? text.length);
                    setMentionCtx(ctx);
                    setMentionOpen(Boolean(ctx));
                    setMentionIndex(0);
                  }}
                  onClick={(e) => {
                    const t = e.currentTarget;
                    const ctx = getMentionContext(t.value, t.selectionStart ?? t.value.length);
                    setMentionCtx(ctx);
                    setMentionOpen(Boolean(ctx));
                  }}
                  onKeyUp={(e) => {
                    const t = e.currentTarget;
                    const ctx = getMentionContext(t.value, t.selectionStart ?? t.value.length);
                    setMentionCtx(ctx);
                    setMentionOpen(Boolean(ctx));
                  }}
                  onKeyDown={handleKey}
                  placeholder="Reply… (use @slug to mention, Enter to send)"
                  className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
                />
                {mentionOpen && mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-12 left-0 z-30 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    {mentionSuggestions.map((slug, idx) => (
                      <button
                        key={slug}
                        type="button"
                        onClick={() => applyMention(slug)}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${idx === mentionIndex ? "bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300" : "text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800"}`}
                      >
                        <span className={`h-2 w-2 rounded-full ${slugColor(slug)}`} />
                        <span className="font-medium">@{slug}</span>
                      </button>
                    ))}
                  </div>
                )}
                {voiceSupported && (
                  <button
                    type="button"
                    onClick={isListening ? stopVoiceInput : handleVoiceInput}
                    className={`flex h-10 w-10 items-center justify-center rounded-xl border transition ${isListening ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"}`}
                    title={isListening ? "Stop voice input" : "Start voice input"}
                  >
                    {isListening ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                )}
                <button
                  onClick={handleSend}
                  disabled={!draft.trim() || sending}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white transition hover:bg-violet-700 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
            <Inbox className="h-10 w-10 opacity-30" />
            <span className="text-sm">Select a thread to read</span>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

