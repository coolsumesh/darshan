"use client";

import * as React from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  fetchThreads,
  fetchThread,
  fetchThreadParticipants,
  fetchThreadMessages,
  fetchThreadSla,
  fetchProjects,
  fetchTeam,
  fetchAgentsDirectory,
  sendThreadMessage,
  markThreadMessageDelivered,
  markThreadMessageRead,
  setThreadStatus,
  authMe,
  type AuthUser,
  addThreadParticipant,
  removeThreadParticipant,
  updateThread,
  updateThreadNextReply,
  clearThreadNextReply,
  createThread,
  uploadThreadAttachment,
  type Thread,
  type ThreadMessage,
  type ThreadAttachment,
  type Project,
  type ThreadParticipant,
  type ThreadAccessRole,
  type ThreadReplyPolicy,
  type ThreadSlaState,
  type ThreadFlow,
} from "@/lib/api";

type ResponderStatus = "queued" | "picked" | "thinking" | "responded" | "blocked" | "failed";
type ResponderState = {
  participant_id: string;
  participant_slug: string;
  display_name: string;
  status: ResponderStatus;
  source_message_id: string | null;
  occurred_at: string;
};
import { ThreadFlowPanel } from "@/components/proto/thread-flow-panel";
import { ChevronDown, Inbox, Send, RefreshCw, CheckCircle, ArchiveIcon, Plus, X, Paperclip, UserPlus, Mic, Square } from "lucide-react";

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

const THREAD_TYPE_OPTIONS = [
  { value: "conversation", label: "Conversation" },
  { value: "feature", label: "Feature" },
  { value: "level_test", label: "Level test" },
  { value: "task", label: "Task" },
] as const;

type ThreadTypeValue = (typeof THREAD_TYPE_OPTIONS)[number]["value"];

function formatThreadType(type: Thread["thread_type"]): string {
  return THREAD_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "Conversation";
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

// ── Completion note inline editor ────────────────────────────────────────────

function CompletionNote({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(value);

  React.useEffect(() => { if (!editing) setDraft(value); }, [value, editing]);

  if (!editing) {
    return (
      <button
        onClick={() => { setDraft(value); setEditing(true); }}
        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
      >
        <svg className="h-3 w-3 shrink-0" viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064z"/></svg>
        {value ? <span className="truncate max-w-xs italic">{value}</span> : <span>Add completion note…</span>}
      </button>
    );
  }

  return (
    <div className="flex items-start gap-1.5">
      <textarea
        autoFocus
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setEditing(false);
          if (e.key === "Enter" && e.metaKey) { onSave(draft); setEditing(false); }
        }}
        placeholder="Completion note (Cmd+Enter to save)…"
        className="flex-1 resize-none rounded-lg border border-violet-400 bg-white px-2 py-1 text-xs text-slate-800 outline-none focus:ring-1 focus:ring-violet-400 dark:bg-slate-900 dark:text-slate-100"
      />
      <div className="flex flex-col gap-1">
        <button
          onClick={() => { onSave(draft); setEditing(false); }}
          disabled={disabled}
          className="rounded px-2 py-0.5 text-[11px] font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40"
        >Save</button>
        <button onClick={() => setEditing(false)} className="rounded px-2 py-0.5 text-[11px] text-slate-400 hover:text-slate-600">Cancel</button>
      </div>
    </div>
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

function formatCountdown(targetIso: string | null, nowMs: number): string {
  if (!targetIso) return "--:--";
  const diff = Math.max(0, new Date(targetIso).getTime() - nowMs);
  const totalSeconds = Math.floor(diff / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

// ── Message bubble ────────────────────────────────────────────────────────────

function attachmentUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  return `${base}${url}`;
}

function receiptTick(summary?: ThreadMessage["receipt_summary"]): { icon: string; color: string; title: string } {
  if (!summary || summary.total_recipients === 0) {
    return { icon: "✓", color: "text-slate-400", title: "Sent" };
  }

  // All read → blue double tick
  if (summary.all_read) {
    return {
      icon: "✓✓",
      color: "text-blue-500",
      title: `Read by ${summary.read_count}/${summary.total_recipients}`,
    };
  }

  // Some read → purple double tick
  if (summary.read_count > 0) {
    return {
      icon: "✓✓",
      color: "text-purple-400",
      title: `Read by ${summary.read_count}/${summary.total_recipients}`,
    };
  }

  // All delivered (but not read) → gray double tick
  if (summary.all_delivered) {
    return {
      icon: "✓✓",
      color: "text-slate-400",
      title: `Delivered to ${summary.delivered_count}/${summary.total_recipients}`,
    };
  }

  // Only some delivered → gray double tick
  if (summary.delivered_count > 0) {
    return {
      icon: "✓✓",
      color: "text-slate-400",
      title: `Delivered to ${summary.delivered_count}/${summary.total_recipients}`,
    };
  }

  // Only sent → single gray tick
  return {
    icon: "✓",
    color: "text-slate-400",
    title: "Sent",
  };
}

function MessageBubble({ msg, isMe, knownSlugs }: { msg: ThreadMessage; isMe: boolean; knownSlugs: Set<string> }) {
  const atts = Array.isArray(msg.attachments) ? msg.attachments : [];
  const tick = receiptTick(msg.receipt_summary);
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
          {/* Always show tick if receipt_summary exists */}
          {msg.receipt_summary && (
            <span className={`text-[10px] ${tick.color}`} title={tick.title}>
              {tick.icon}
            </span>
          )}
          <span className="text-[10px] font-mono text-slate-300 dark:text-slate-600 select-all" title={msg.message_id}>
            {msg.message_id.slice(0, 8)}
          </span>
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
          {msg.body && (
            <div>
              <MarkdownMessage body={msg.body} knownSlugs={knownSlugs} isMe={isMe} />
            </div>
          )}
          {atts.length > 0 && (
            <div className="mt-2 space-y-2">
              {atts.map((a, idx) => (
                <a
                  key={`${a.url}-${idx}`}
                  href={attachmentUrl(a.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-slate-300/50 bg-slate-50/70 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-700/40 dark:hover:bg-slate-700"
                >
                  {a.type === "image" ? "🖼️" : a.type === "audio" ? "🎤" : a.type === "video" ? "🎬" : "📎"} {a.filename}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Thread Modal ──────────────────────────────────────────────────────────

type ParticipantOption = {
  id: string;
  name: string;
  slug: string;
};

function Toast({
  tone,
  message,
}: {
  tone: "success" | "error";
  message: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-6 top-20 z-20 rounded-xl border px-4 py-3 text-sm shadow-2xl ${
        tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
      }`}
    >
      {message}
    </div>
  );
}

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
  const [selectedParticipants, setSelectedParticipants] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!projectId) return;
    fetchTeam(projectId).then((team) => {
      setAgents(team.map((m) => ({ agentId: m.agentId, agentName: m.agent?.name ?? m.agentId })));
    });
  }, [projectId]);

  const toggle = (id: string) =>
    setSelectedParticipants((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const handleCreateThread = async () => {
    if (!subject.trim()) { setError("Subject is required"); return; }
    if (!projectId)      { setError("Select a project"); return; }
    setSaving(true); setError("");
    const thread = await createThread(subject.trim(), projectId, Array.from(selectedParticipants));
    setSaving(false);
    if (!thread) { setError("Failed to create thread"); return; }
    onCreate(thread);
  };

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl dark:bg-slate-900 ring-1 ring-slate-200 dark:ring-slate-700">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">New Thread</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Subject</label>
            <input
              autoFocus
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateThread()}
              placeholder="What is this thread about?"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

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

          {agents.length > 0 && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500 dark:text-slate-400">
                Participants <span className="text-slate-400">(optional)</span>
              </label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {agents.map((a) => (
                  <label key={a.agentId} className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800">
                    <input type="checkbox" checked={selectedParticipants.has(a.agentId)} onChange={() => toggle(a.agentId)} className="accent-violet-600" />
                    <Avatar slug={a.agentName.toUpperCase().slice(0, 8)} size="sm" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{a.agentName}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-500">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
          <button
            onClick={handleCreateThread}
            disabled={saving || !subject.trim()}
            className="rounded-lg bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-40"
          >
            {saving ? "Creating�" : "Create Thread"}
          </button>
        </div>
      </div>
    </div>
  );
}
export default function ThreadsPage() {
  const [deepLinkThreadId, setDeepLinkThreadId] = React.useState<string | null>(null);
  const [threads, setThreads] = React.useState<Thread[]>([]);
  const [messages, setMessages] = React.useState<ThreadMessage[]>([]);
  const [selected, setSelected] = React.useState<Thread | null>(null);
  // responderStatuses: slug → latest ResponderState for the currently selected thread
  const [responderStatuses, setResponderStatuses] = React.useState<Record<string, ResponderState>>({});
  const [me, setMe] = React.useState<AuthUser | null>(null);
  const [previews, setPreviews] = React.useState<Record<string, { text: string; time: string }>>({});
  const [loading, setLoading] = React.useState(true);
  const [sending, setSending] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [draftAttachments, setDraftAttachments] = React.useState<ThreadAttachment[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [projectId, setProjectId] = React.useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [threadStatusFilter, setThreadStatusFilter] = React.useState<"open" | "closed">("open");
  const [threadSearch, setThreadSearch] = React.useState("");
  const [debouncedThreadSearch, setDebouncedThreadSearch] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [composeOpen, setComposeOpen] = React.useState(false);
  const [threadParticipants, setThreadParticipants] = React.useState<ThreadParticipant[]>([]);
  const [threadRole, setThreadRole] = React.useState<ThreadAccessRole | null>(null);
  const [participantOptions, setParticipantOptions] = React.useState<ParticipantOption[]>([]);
  const [participantQuery, setParticipantQuery] = React.useState("");
  const [selectedParticipantId, setSelectedParticipantId] = React.useState("");
  const [participantOptionsLoading, setParticipantOptionsLoading] = React.useState(false);
  const [addingParticipant, setAddingParticipant] = React.useState(false);
  const [participantFeedback, setParticipantFeedback] = React.useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [addParticipantOpen, setAddParticipantOpen] = React.useState(false);
  const addParticipantRef = React.useRef<HTMLDivElement>(null);
  const [editingSubject, setEditingSubject] = React.useState(false);
  const [subjectDraft, setSubjectDraft] = React.useState("");
  const [updatingThread, setUpdatingThread] = React.useState(false);
  const [toast, setToast] = React.useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [mentionSlugs, setMentionSlugs] = React.useState<string[]>([]);
  const [mentionOpen, setMentionOpen] = React.useState(false);
  const [mentionIndex, setMentionIndex] = React.useState(0);
  const [mentionCtx, setMentionCtx] = React.useState<{ query: string; start: number; end: number } | null>(null);
  const [threadReplyPolicy, setThreadReplyPolicy] = React.useState<ThreadReplyPolicy | null>(null);
  const [threadSlaState, setThreadSlaState] = React.useState<ThreadSlaState | null>(null);
  const [savingNextReply, setSavingNextReply] = React.useState(false);
  const [threadFlowOpen, setThreadFlowOpen] = React.useState(false);
  const [threadFlow, setThreadFlow] = React.useState<ThreadFlow>({ path: [], awaiting_on: null, next_expected_from: null });
  const [countdownNow, setCountdownNow] = React.useState(() => Date.now());
  const [voiceSupported, setVoiceSupported] = React.useState(false);
  const [isListening, setIsListening] = React.useState(false);
  const bottomRef = React.useRef<HTMLDivElement>(null);
  const isLoadingPhase2Ref = React.useRef(false);
  const recognitionRef = React.useRef<any>(null);
  const voiceBaseDraftRef = React.useRef("");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const reconcileThread = React.useCallback((thread: Thread) => {
    setThreads((prev) => prev.map((item) => (item.thread_id === thread.thread_id ? { ...item, ...thread } : item)));
    setSelected((prev) => (prev?.thread_id === thread.thread_id ? { ...prev, ...thread } : prev));
  }, []);

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("thread_id");
    setDeepLinkThreadId(tid && tid.trim() ? tid.trim() : null);
  }, []);

  // Load current user once (for isMe tick comparison)
  React.useEffect(() => {
    authMe().then((u) => { if (u) setMe(u); });
  }, []);

  // Load projects once
  React.useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedThreadSearch(threadSearch.trim()), 250);
    return () => clearTimeout(t);
  }, [threadSearch]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

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
        const detail = await fetchThread(existing.thread_id);
        if (!detail) return;
        setSelected(detail.thread);
        setThreadParticipants(detail.participants);
        setThreadRole(detail.role);
        setThreadFlow({ path: [], awaiting_on: null, next_expected_from: null });
        // Phase 1: Instant render with last 5 messages
        const recent = await fetchThreadMessages(existing.thread_id, 5);
        setMessages(recent);
        // Phase 2: Load remaining in background
        setTimeout(async () => {
          const full = await fetchThreadMessages(existing.thread_id, 50);
          setMessages(full);
        }, 0);
        return;
      }

      const direct = await fetchThread(threadId);
      if (!direct) return;

      setProjectId(direct.thread.project_id ?? null);
      setThreadStatusFilter(direct.thread.status === "open" ? "open" : "closed");
      setThreads((prev) => (prev.some((t) => t.thread_id === direct.thread.thread_id) ? prev : [direct.thread, ...prev]));
      setSelected(direct.thread);
      setThreadParticipants(direct.participants);
      setThreadRole(direct.role);
      setThreadFlow({ path: [], awaiting_on: null, next_expected_from: null });
      // Phase 1: Instant render with last 5 messages
      const recent = await fetchThreadMessages(direct.thread.thread_id, 5);
      setMessages(recent);
      // Phase 2: Load remaining in background (prepend older messages above)
      isLoadingPhase2Ref.current = true;
      setTimeout(async () => {
        const full = await fetchThreadMessages(direct.thread.thread_id, 50);
        setMessages(full);
        isLoadingPhase2Ref.current = false;
      }, 0);
    };

    pickThread().catch(() => {});
  }, [deepLinkThreadId, threads, selected?.thread_id]);

  const handleProjectChange = (pid: string | null) => {
    setProjectId(pid);
    setSelected(null);
    setMessages([]);
    setThreadParticipants([]);
    setThreadRole(null);
    setThreadFlow({ path: [], awaiting_on: null, next_expected_from: null });
    setDropdownOpen(false);
  };

  // Load messages when thread selected
  // Phase 1: Load & render last 5 messages immediately
  // Phase 2: Load remaining older messages in background
  React.useEffect(() => {
    if (!selected) return;
    
    const loadMessages = async () => {
      try {
        // Phase 1: Get last 5 messages for instant render
        const recent = await fetchThreadMessages(selected.thread_id, 5);
        setMessages(recent);
        
        // Phase 2: Load remaining messages in background (don't block)
        // Mark that we're entering phase 2 to prevent scroll animation
        isLoadingPhase2Ref.current = true;
        setTimeout(async () => {
          const full = await fetchThreadMessages(selected.thread_id, 50);
          // Prepend older messages (indices 0 to 44) above recent (indices 45 to 49)
          // Newest message stays in same visual position without scrolling
          setMessages(full);
          isLoadingPhase2Ref.current = false;
        }, 0);
      } catch (err) {
        console.error("Error loading messages:", err);
      }
    };
    
    loadMessages();
  }, [selected?.thread_id]); // eslint-disable-line

  React.useEffect(() => {
    if (!selected) return;
    const timer = window.setInterval(() => {
      fetchThread(selected.thread_id)
        .then((detail) => {
          if (!detail) return;
          setSelected(detail.thread);
          setThreadParticipants(detail.participants);
          setThreadRole(detail.role);
          setThreadFlow(detail.flow);
        })
        .catch(() => {});
    }, 15000);
    return () => window.clearInterval(timer);
  }, [selected?.thread_id]);

  React.useEffect(() => {
    if (!selected) {
      setThreadReplyPolicy(null);
      setThreadSlaState(null);
      return;
    }
    fetchThreadSla(selected.thread_id)
      .then((state) => {
        setThreadReplyPolicy(state?.reply_policy ?? null);
        setThreadSlaState(state?.sla_state ?? null);
      })
      .catch(() => {
        setThreadReplyPolicy(null);
        setThreadSlaState(null);
      });
  }, [selected?.thread_id]);

  React.useEffect(() => {
    if (!threadSlaState?.pickup_due_at && !threadSlaState?.progress_due_at) return;
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [threadSlaState?.pickup_due_at, threadSlaState?.progress_due_at]);

  React.useEffect(() => {
    if (!selected) {
      setThreadParticipants([]);
      setThreadRole(null);
      setParticipantOptions([]);
      setParticipantQuery("");
      setSelectedParticipantId("");
      setParticipantFeedback(null);
      setMentionSlugs([]);
      return;
    }

    const activeParticipantSlugs = threadParticipants
      .filter((participant) => !participant.removed_at)
      .map((participant) => participant.participant_slug.toUpperCase());
    const fromMessages = messages.map((m) => m.sender_slug.toUpperCase());
    const fallback = Array.from(new Set([selected.created_slug.toUpperCase(), ...activeParticipantSlugs, ...fromMessages]));

    if (!selected.project_id) {
      setMentionSlugs(fallback);
      return;
    }

    fetchTeam(selected.project_id)
      .then((team) => {
        const fromTeam = team.map((m) => (m.agent?.name ?? "").toUpperCase()).filter(Boolean);
        const merged = Array.from(new Set([selected.created_slug.toUpperCase(), ...fromTeam, ...activeParticipantSlugs, ...fromMessages]));
        setMentionSlugs(merged);
      })
      .catch(() => setMentionSlugs(fallback));
  }, [selected?.thread_id, selected?.project_id, messages, threadParticipants]); // eslint-disable-line

  React.useEffect(() => {
    if (!selected) return;
    const thread = selected;

    let cancelled = false;
    async function loadParticipantOptions() {
      setParticipantOptionsLoading(true);
      const options = thread.project_id
        ? (await fetchTeam(thread.project_id)).map((member) => ({
            id: member.agentId,
            name: member.agent?.name ?? member.agentId,
            slug: (member.agent?.name ?? member.agentId).toUpperCase().replace(/[^A-Z0-9]/g, "_"),
          }))
        : (await fetchAgentsDirectory()).map((agent) => ({
            id: agent.id,
            name: agent.name,
            slug: agent.name.toUpperCase().replace(/[^A-Z0-9]/g, "_"),
          }));

      if (cancelled) return;
      setParticipantOptions(Array.from(new Map(options.map((option) => [option.id, option])).values()));
      setParticipantOptionsLoading(false);
    }

    loadParticipantOptions().catch(() => {
      if (cancelled) return;
      setParticipantOptions([]);
      setParticipantOptionsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [selected?.thread_id, selected?.project_id]);

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
              if (me && msg.sender_id !== me.id) {
                markThreadMessageDelivered(threadId, msg.message_id).catch(() => {});
                markThreadMessageRead(threadId, msg.message_id).catch(() => {});
              }
              fetchThreadSla(threadId)
                .then((state) => {
                  setThreadReplyPolicy(state?.reply_policy ?? null);
                  setThreadSlaState(state?.sla_state ?? null);
                })
                .catch(() => {});
            }
            loadThreads(projectId, threadStatusFilter, { silent: true, search: debouncedThreadSearch });
            return;
          }

          if (type === "thread.updated") {
            const thread = data?.thread as Thread | undefined;
            if (!thread?.thread_id) return;
            reconcileThread(thread);
            if (selected?.thread_id === thread.thread_id) {
              fetchThreadSla(thread.thread_id)
                .then((state) => {
                  setThreadReplyPolicy(state?.reply_policy ?? null);
                  setThreadSlaState(state?.sla_state ?? null);
                })
                .catch(() => {});
            }
            return;
          }

          if (type === "thread.message_receipt_updated") {
            const threadId = data?.thread_id as string | undefined;
            const messageId = data?.message_id as string | undefined;
            const receiptSummary = data?.receipt_summary as ThreadMessage["receipt_summary"] | undefined;
            if (!threadId || !messageId || !receiptSummary) return;
            if (selected?.thread_id !== threadId) return;
            setMessages((prev) => prev.map((m) => (
              m.message_id === messageId ? { ...m, receipt_summary: receiptSummary } : m
            )));
            return;
          }

          if (type === "thread.reply_status_updated") {
            const threadId = data?.thread_id as string | undefined;
            if (!threadId || selected?.thread_id !== threadId) return;
            const responder = data?.responder as { participant_id: string; participant_slug: string; display_name: string } | undefined;
            if (!responder?.participant_slug) return;
            const status = data?.status as ResponderStatus | undefined;
            if (!status) return;
            const slug = responder.participant_slug.toUpperCase();
            setResponderStatuses((prev) => {
              // Clear terminal states after a short delay by using responded/blocked/failed as final
              const terminal: ResponderStatus[] = ["responded", "blocked", "failed"];
              if (terminal.includes(status)) {
                // Keep it briefly so UI can show the last state, then caller can clean up
                return { ...prev, [slug]: { ...responder, participant_slug: slug, status, source_message_id: data?.source_message_id ?? null, occurred_at: data?.occurred_at ?? new Date().toISOString() } };
              }
              return { ...prev, [slug]: { ...responder, participant_slug: slug, status, source_message_id: data?.source_message_id ?? null, occurred_at: data?.occurred_at ?? new Date().toISOString() } };
            });
            // Auto-clear terminal statuses after 4 seconds
            if (["responded", "blocked", "failed"].includes(status)) {
              setTimeout(() => {
                setResponderStatuses((prev) => {
                  const next = { ...prev };
                  if (next[slug]?.status === status) delete next[slug];
                  return next;
                });
              }, 4000);
            }
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
  }, [selected?.thread_id, projectId, threadStatusFilter, loadThreads, debouncedThreadSearch, reconcileThread]);

  const selectThread = React.useCallback(async (thread: Thread) => {
    const detail = await fetchThread(thread.thread_id);
    setSelected(detail?.thread ?? thread);
    setThreadParticipants(detail?.participants ?? []);
    setThreadRole(detail?.role ?? null);
    setThreadFlow(detail?.flow ?? { path: [], awaiting_on: null, next_expected_from: null });
    setMessages([]);
    setResponderStatuses({});
    // Phase 1: Instant render with last 5 messages
    const recent = await fetchThreadMessages(thread.thread_id, 5);
    setMessages(recent);
    // Phase 2: Load remaining in background (prepend older messages above)
    isLoadingPhase2Ref.current = true;
    setTimeout(async () => {
      const full = await fetchThreadMessages(thread.thread_id, 50);
      setMessages(full);
      isLoadingPhase2Ref.current = false;
    }, 0);

    // Mark incoming messages as delivered/read when the thread is opened.
    const currentMe = await authMe();
    if (currentMe) setMe(currentMe);
    const incoming = recent.filter((m) => m.sender_id !== currentMe?.id);
    incoming.forEach((m) => {
      markThreadMessageDelivered(thread.thread_id, m.message_id).catch(() => {});
      markThreadMessageRead(thread.thread_id, m.message_id).catch(() => {});
    });
  }, []);

  // Scroll to bottom when messages load (Phase 1 only, not Phase 2)
  // During Phase 2, older messages prepend above recent ones, so we don't scroll
  React.useEffect(() => {
    if (!isLoadingPhase2Ref.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
    if (!selected || sending || (!draft.trim() && draftAttachments.length === 0)) return;
    setSending(true);
    try {
      const result = await sendThreadMessage(selected.thread_id, draft.trim(), draftAttachments);
      if (result.ok) {
        // Do not append optimistically here.
        // WebSocket thread.message_created is the single source of truth and avoids duplicate flashes.
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
    const composing = (e.nativeEvent as any)?.isComposing;
    if (composing) return;

    // Enter sends by default; Shift+Enter inserts newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Explicit fallback shortcuts
    if ((e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      handleSend();
    }
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

  // Sort threads: most recent activity first (last_activity = COALESCE(last_message.sent_at, created_at))
  const sortedThreads = [...threads].sort((a, b) => {
    const ta = a.last_activity ?? a.created_at;
    const tb = b.last_activity ?? b.created_at;
    return new Date(tb).getTime() - new Date(ta).getTime();
  });

  const handleThreadCreated = async (thread: Thread) => {
    setComposeOpen(false);
    // Reload list then open the new thread
    await loadThreads(thread.project_id, threadStatusFilter, { search: debouncedThreadSearch });
    const detail = await fetchThread(thread.thread_id);
    setSelected(detail?.thread ?? thread);
    setThreadParticipants(detail?.participants ?? []);
    setThreadRole(detail?.role ?? null);
    setThreadFlow(detail?.flow ?? { path: [], awaiting_on: null, next_expected_from: null });
    // Phase 1: Instant render with last 5 messages
    const recent = await fetchThreadMessages(thread.thread_id, 5);
    setMessages(recent);
    // Phase 2: Load remaining in background (prepend older messages above)
    isLoadingPhase2Ref.current = true;
    setTimeout(async () => {
      const full = await fetchThreadMessages(thread.thread_id, 50);
      setMessages(full);
      isLoadingPhase2Ref.current = false;
    }, 0);
  };

  const activeParticipants = React.useMemo(
    () => threadParticipants.filter((participant) => !participant.removed_at),
    [threadParticipants]
  );
  const canManageParticipants = threadRole === "creator" || threadRole === "owner";
  const nextReply = selected?.next_reply ?? null;
  const replyPolicySummary = React.useMemo(() => {
    if (!threadReplyPolicy || threadReplyPolicy.mode !== "restricted") return null;
    const names = threadReplyPolicy.allowed_participants.map((participant) => participant.participant_slug).join(", ");
    const remaining = threadReplyPolicy.next_message_limit !== null ? ` · next ${threadReplyPolicy.next_message_limit}` : "";
    return names ? `${names}${remaining}` : `Restricted${remaining}`;
  }, [threadReplyPolicy]);
  const slaSummary = React.useMemo(() => {
    if (selected?.thread_type !== "task" || !threadSlaState) return null;
    if (threadSlaState.stale_reason) {
      return { label: "SLA missed", value: threadSlaState.stale_reason.replace("-", " ") };
    }
    if (threadSlaState.pickup_due_at) {
      return { label: "Waiting pickup", value: formatCountdown(threadSlaState.pickup_due_at, countdownNow) };
    }
    if (threadSlaState.progress_due_at) {
      return { label: "Next update due", value: formatCountdown(threadSlaState.progress_due_at, countdownNow) };
    }
    return null;
  }, [selected?.thread_type, threadSlaState, countdownNow]);
  const availableParticipantOptions = React.useMemo(() => {
    const activeIds = new Set(activeParticipants.map((participant) => participant.participant_id));
    const query = participantQuery.trim().toLowerCase();
    return participantOptions.filter((option) => {
      if (activeIds.has(option.id)) return false;
      if (!query) return true;
      return option.name.toLowerCase().includes(query) || option.slug.toLowerCase().includes(query);
    });
  }, [activeParticipants, participantOptions, participantQuery]);

  React.useEffect(() => {
    if (!availableParticipantOptions.some((option) => option.id === selectedParticipantId)) {
      setSelectedParticipantId(availableParticipantOptions[0]?.id ?? "");
    }
  }, [availableParticipantOptions, selectedParticipantId]);

  const handleAddParticipant = async (directId?: string) => {
    const pid = directId ?? selectedParticipantId;
    if (!selected || !pid || addingParticipant) return;
    setAddingParticipant(true);
    setParticipantFeedback(null);
    const result = await addThreadParticipant(selected.thread_id, pid);
    setAddParticipantOpen(false);
    setParticipantQuery("");
    setSelectedParticipantId("");
    if (!result.ok) {
      const message = result.status === 403
        ? (result.error ?? "You do not have permission to add participants to this thread.")
        : (result.error ?? "Failed to add participant.");
      setParticipantFeedback({ tone: "error", message });
      setToast({ tone: "error", message });
      setAddingParticipant(false);
      return;
    }

    const refreshedParticipants = await fetchThreadParticipants(selected.thread_id);
    setThreadParticipants(refreshedParticipants);
    setToast({ tone: "success", message: `${result.participant_slug ?? "Participant"} added.` });
    setAddingParticipant(false);
  };

  // Close add-participant popover on outside click
  React.useEffect(() => {
    if (!addParticipantOpen) return;
    const handler = (e: MouseEvent) => {
      if (addParticipantRef.current && !addParticipantRef.current.contains(e.target as Node)) {
        setAddParticipantOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addParticipantOpen]);

  const handleRemoveParticipant = async (participantId: string, slug: string) => {
    if (!selected) return;
    const result = await removeThreadParticipant(selected.thread_id, participantId);
    if (!result.ok) {
      setToast({ tone: "error", message: result.error ?? "Failed to remove participant" });
      return;
    }
    const refreshed = await fetchThreadParticipants(selected.thread_id);
    setThreadParticipants(refreshed);
    setToast({ tone: "success", message: `${slug} removed.` });
  };

  const handleSaveSubject = async () => {
    if (!selected || !subjectDraft.trim() || updatingThread) return;
    setUpdatingThread(true);
    const updated = await updateThread(selected.thread_id, { subject: subjectDraft.trim() });
    setUpdatingThread(false);
    if (updated) {
      reconcileThread(updated);
      setEditingSubject(false);
      setToast({ tone: "success", message: "Subject updated." });
    } else {
      setToast({ tone: "error", message: "Failed to update subject." });
    }
  };

  const handleUpdateTaskField = async (patch: Parameters<typeof updateThread>[1]) => {
    if (!selected || updatingThread) return;
    setUpdatingThread(true);
    const updated = await updateThread(selected.thread_id, patch);
    setUpdatingThread(false);
    if (updated) {
      reconcileThread(updated);
    } else {
      setToast({ tone: "error", message: "Failed to update thread." });
    }
  };

  const handleApplyNextReply = async (payload: { mode: "any" | "all"; pending_participant_ids: string[]; reason: string | null }) => {
    if (!selected || savingNextReply) return;
    setSavingNextReply(true);
    const updated = await updateThreadNextReply(selected.thread_id, payload);
    setSavingNextReply(false);
    if (!updated) {
      setToast({ tone: "error", message: "Failed to update next reply." });
      return;
    }
    reconcileThread(updated);
    setToast({ tone: "success", message: "Next reply updated." });
  };

  const handleClearNextReply = async () => {
    if (!selected || savingNextReply) return;
    setSavingNextReply(true);
    const updated = await clearThreadNextReply(selected.thread_id);
    setSavingNextReply(false);
    if (!updated) {
      setToast({ tone: "error", message: "Failed to clear next reply." });
      return;
    }
    reconcileThread(updated);
    setToast({ tone: "success", message: "Next reply cleared." });
  };

  const handleThreadTypeChange = async (nextType: ThreadTypeValue) => {
    if (!selected || updatingThread) return;
    const currentType = selected.thread_type ?? "conversation";
    if (currentType === nextType) return;

    if (
      nextType === "task" &&
      currentType !== "task" &&
      !window.confirm("Switch this thread to a task? Missing task fields will default to Proposed status and Normal priority.")
    ) {
      return;
    }

    const previousSelected = selected;
    const previousThreads = threads;
    const optimisticThread: Thread = {
      ...selected,
      thread_type: nextType,
      task_status: nextType === "task" ? (selected.task_status ?? "proposed") : selected.task_status,
      priority: nextType === "task" ? (selected.priority ?? "normal") : selected.priority,
    };

    reconcileThread(optimisticThread);
    setUpdatingThread(true);
    const updated = await updateThread(selected.thread_id, { thread_type: nextType });
    setUpdatingThread(false);

    if (updated) {
      reconcileThread(updated);
      setToast({ tone: "success", message: "Thread type updated." });
      return;
    }

    setThreads(previousThreads);
    setSelected(previousSelected);
    setToast({ tone: "error", message: "Failed to update thread type." });
  };

  return (
    <>
    {toast && <Toast tone={toast.tone} message={toast.message} />}
    {composeOpen && (
      <NewThreadModal
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
                    {editingSubject ? (
                      <div className="flex items-center gap-1.5 flex-1">
                        <input
                          autoFocus
                          value={subjectDraft}
                          onChange={(e) => setSubjectDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveSubject();
                            if (e.key === "Escape") setEditingSubject(false);
                          }}
                          className="flex-1 rounded-lg border border-violet-400 bg-white px-2 py-0.5 text-sm font-semibold text-slate-900 outline-none focus:ring-1 focus:ring-violet-400 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <button onClick={handleSaveSubject} disabled={updatingThread} className="rounded px-2 py-0.5 text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40">Save</button>
                        <button onClick={() => setEditingSubject(false)} className="rounded px-2 py-0.5 text-xs text-slate-400 hover:text-slate-600">Cancel</button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {selected.subject}
                        </div>
                        {(threadRole === "creator" || threadRole === "owner") && (
                          <button
                            onClick={() => { setSubjectDraft(selected.subject); setEditingSubject(true); }}
                            title="Edit subject"
                            className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400"
                          >
                            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor"><path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61zm1.414 1.06a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354l-1.086-1.086zM11.189 6.25 9.75 4.81l-6.286 6.287a.25.25 0 0 0-.064.108l-.558 1.953 1.953-.558a.25.25 0 0 0 .108-.064z"/></svg>
                          </button>
                        )}
                        <span className="font-mono text-[10px] text-slate-400" title={selected.thread_id}>
                          {selected.thread_id.slice(0, 8)}
                        </span>
                        <button
                          onClick={() => setThreadFlowOpen(true)}
                          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 hover:border-violet-400 hover:text-violet-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          Thread Flow
                        </button>
                      </>
                    )}
                  </div>
                  <div className="mt-0.5 space-y-0.5 text-xs text-slate-400">
                    <div>
                      Started by {selected.created_slug} · {relativeTime(selected.created_at)}
                    </div>
                    {selected.last_activity && selected.last_activity !== selected.created_at && (
                      <div>
                        Last updated · {relativeTime(selected.last_activity)}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {nextReply && (
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${nextReply.is_expired ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"}`}>
                        Reply pending · {nextReply.mode === "any" && nextReply.pending_participant_slugs.length > 2
                          ? `Any of ${nextReply.pending_participant_slugs.length}`
                          : nextReply.pending_participant_slugs.join(", ")}
                      </span>
                    )}
                    {replyPolicySummary && (
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                        Active Responders · {replyPolicySummary}
                      </span>
                    )}
                    {slaSummary && (
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                          threadSlaState?.stale_reason
                            ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                        }`}
                      >
                        {slaSummary.label} · {slaSummary.value}
                      </span>
                    )}
                    {activeParticipants.map((participant) => (
                      <span
                        key={participant.participant_id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 pl-2.5 pr-1.5 py-1 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      >
                        <span className={`h-2 w-2 rounded-full ${slugColor(participant.participant_slug)}`} />
                        {participant.participant_slug}
                        {canManageParticipants && (
                          <button
                            onClick={() => handleRemoveParticipant(participant.participant_id, participant.participant_slug)}
                            title={`Remove ${participant.participant_slug}`}
                            className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-rose-500 dark:hover:bg-slate-700"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </span>
                    ))}

                    {/* Inline add-participant button + popover */}
                    {canManageParticipants && (
                      <div ref={addParticipantRef} className="relative">
                        <button
                          onClick={() => setAddParticipantOpen(v => !v)}
                          title="Add participant"
                          className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:border-violet-400 hover:text-violet-600 dark:border-slate-600 dark:text-slate-500 dark:hover:border-violet-500 dark:hover:text-violet-400"
                        >
                          <UserPlus className="h-3 w-3" />
                          {activeParticipants.length === 0 ? "Add participant" : "Add"}
                        </button>

                        {addParticipantOpen && (
                          <div className="absolute left-0 top-full z-40 mt-1.5 w-60 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                            <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                              <input
                                autoFocus
                                value={participantQuery}
                                onChange={(e) => setParticipantQuery(e.target.value)}
                                placeholder="Search agents…"
                                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 outline-none focus:border-violet-400 focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </div>
                            <div className="max-h-52 overflow-y-auto py-1">
                              {participantOptionsLoading ? (
                                <div className="px-3 py-3 text-xs text-slate-400">Loading…</div>
                              ) : availableParticipantOptions.length === 0 ? (
                                <div className="px-3 py-3 text-xs text-slate-400">No agents to add</div>
                              ) : (
                                availableParticipantOptions.map((option) => (
                                  <button
                                    key={option.id}
                                    type="button"
                                    disabled={addingParticipant}
                                    onClick={() => handleAddParticipant(option.id)}
                                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-violet-50 dark:hover:bg-violet-950/30 disabled:opacity-50"
                                  >
                                    <Avatar slug={option.slug} size="sm" />
                                    <span className="text-sm text-slate-700 dark:text-slate-200">{option.name}</span>
                                  </button>
                                ))
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {participantFeedback?.tone === "error" && (
                      <span className="text-xs text-rose-500">{participantFeedback.message}</span>
                    )}
                  </div>
                  {selected.thread_type === "task" && (
                    <div className="mt-2.5 space-y-1.5">
                      {/* Status + Priority row */}
                      <div className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">Task</span>
                        <select
                          value={selected.task_status ?? "proposed"}
                          disabled={updatingThread}
                          onChange={(e) => handleUpdateTaskField({ task_status: e.target.value as "proposed" | "approved" | "in-progress" | "review" | "blocked" })}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-50"
                        >
                          <option value="proposed">Proposed</option>
                          <option value="approved">Approved</option>
                          <option value="in-progress">In Progress</option>
                          <option value="review">Review</option>
                          <option value="blocked">Blocked</option>
                        </select>
                        <select
                          value={selected.priority ?? "normal"}
                          disabled={updatingThread}
                          onChange={(e) => handleUpdateTaskField({ priority: e.target.value as "high" | "medium" | "normal" | "low" })}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 disabled:opacity-50"
                        >
                          <option value="high">⬆ High</option>
                          <option value="medium">● Medium</option>
                          <option value="normal">○ Normal</option>
                          <option value="low">⬇ Low</option>
                        </select>
                        <span className="text-slate-400">
                          {selected.assignee_name ? `→ ${selected.assignee_name}` : "Unassigned"}
                        </span>
                      </div>
                      {/* Completion note */}
                      <CompletionNote
                        value={selected.completion_note ?? ""}
                        onSave={(note) => handleUpdateTaskField({ completion_note: note })}
                        disabled={updatingThread}
                      />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {threadRole === "creator" || threadRole === "owner" ? (
                    <select
                      value={selected.thread_type ?? "conversation"}
                      disabled={updatingThread}
                      onChange={(e) => handleThreadTypeChange(e.target.value as ThreadTypeValue)}
                      title="Thread type"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-500 outline-none hover:border-violet-400 hover:text-violet-600 focus:border-violet-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 disabled:opacity-40"
                    >
                      {THREAD_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span
                      title="Thread type"
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                    >
                      {formatThreadType(selected.thread_type)}
                    </span>
                  )}
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


            {threadFlowOpen && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setThreadFlowOpen(false)}>
                <div className="max-h-[88vh] w-[min(1100px,95vw)] overflow-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-800 dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
                  <div className="mb-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Thread Flow</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{selected.subject}</div>
                    </div>
                    <button onClick={() => setThreadFlowOpen(false)} className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:text-slate-700 dark:border-slate-700 dark:text-slate-300">Close</button>
                  </div>
                  <ThreadFlowPanel
                    thread={selected}
                    participants={threadParticipants}
                    messages={messages}
                    flow={threadFlow}
                    nextReply={nextReply}
                    canManage={canManageParticipants}
                    saving={savingNextReply}
                    onApply={handleApplyNextReply}
                    onClear={handleClearNextReply}
                  />
                </div>
              </div>
            )}

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
                    isMe={!!me && msg.sender_id === me.id}
                    knownSlugs={new Set(mentionSlugs)}
                  />
                ))
              )}
              {/* Responder thinking indicators */}
              {Object.values(responderStatuses).map((rs) => {
                if (rs.status === "responded" || rs.status === "blocked") return null;
                const isThinking = rs.status === "thinking";
                const isPicked = rs.status === "picked" || rs.status === "queued";
                const isFailed = rs.status === "failed";
                return (
                  <div key={rs.participant_slug} className="flex items-center gap-3 px-1 py-1">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${slugColor(rs.participant_slug)}`}>
                      {rs.participant_slug.slice(0, 2)}
                    </div>
                    <div className={`flex items-center gap-1.5 rounded-2xl rounded-tl-sm px-3 py-2 text-xs ${
                      isFailed
                        ? "bg-red-50 text-red-500 ring-1 ring-red-200 dark:bg-red-950/20 dark:ring-red-900/50"
                        : "bg-white text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
                    }`}>
                      {isThinking && (
                        <span className="flex gap-0.5">
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                        </span>
                      )}
                      <span>
                        {isFailed
                          ? `${rs.display_name} failed to respond. Retry needed.`
                          : isPicked
                          ? `Waiting for ${rs.display_name}…`
                          : `${rs.display_name} is thinking…`}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply input */}
            <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
              {draftAttachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {draftAttachments.map((a, idx) => (
                    <button
                      key={`${a.url}-${idx}`}
                      onClick={() => setDraftAttachments((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-full border border-slate-300 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300"
                      title="Remove attachment"
                    >
                      {a.filename} ×
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleAttach} />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:border-violet-300 hover:text-violet-600 dark:border-slate-700 dark:text-slate-400"
                  title="Attach file"
                >
                  <Paperclip className="h-4 w-4" />
                </button>
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
                  disabled={(!draft.trim() && draftAttachments.length === 0) || sending}
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

