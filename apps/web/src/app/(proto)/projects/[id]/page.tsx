"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
const Markdown = dynamic(() => import("react-markdown"), { ssr: false });
import Link from "next/link";
import {
  ArrowLeft, BookOpen, Calendar, ChevronDown, ExternalLink,
  FileCode2, Filter, GripVertical, LayoutList, Zap,
  MoreHorizontal, Plus, Search, SortAsc, UserPlus, Users, X, Trash2, Check,
  Mail, Crown, UserCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { PROJECTS, type Task, type TaskStatus, type Priority } from "@/lib/projects";
import {
  fetchProject, fetchTasks, fetchTeam, fetchAgents,
  createTask, updateTask, deleteTask,
  addTeamMember, removeTeamMember,
  fetchArchitecture, fetchTechSpec,
  pingAgent,
  fetchUserMembers, addUserMember, removeUserMember,
  authMe,
  type TeamMemberWithAgent,
  type UserMember,
} from "@/lib/api";
import { type Agent } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "table" | "team" | "architecture" | "tech-spec";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  proposed:      { label: "Backlog",     bg: "bg-zinc-100",    text: "text-zinc-600",    dot: "bg-zinc-400"    },
  approved:      { label: "To Do",       bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400"   },
  "in-progress": { label: "In Progress", bg: "bg-brand-100",   text: "text-brand-700",   dot: "bg-brand-500"   },
  review:        { label: "Review",      bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-400"     },
  done:          { label: "Done",        bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const TYPE_META: Record<string, { bg: string; text: string; dot: string }> = {
  Task:           { bg: "bg-zinc-100",    text: "text-zinc-600",   dot: "bg-zinc-400"   },
  Feature:        { bg: "bg-green-100",   text: "text-green-700",  dot: "bg-green-500"  },
  Bug:            { bg: "bg-red-100",     text: "text-red-600",    dot: "bg-red-500"    },
  Quality:        { bg: "bg-purple-100",  text: "text-purple-700", dot: "bg-purple-500" },
  Infrastructure: { bg: "bg-blue-100",    text: "text-blue-700",   dot: "bg-blue-500"   },
};

const PRIORITY_META: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  urgent: { label: "Urgent", bg: "bg-red-100",    text: "text-red-700",    dot: "bg-red-500"    },
  high:   { label: "High",   bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  medium: { label: "Medium", bg: "bg-amber-100",  text: "text-amber-700",  dot: "bg-amber-400"  },
  low:    { label: "Low",    bg: "bg-zinc-100",   text: "text-zinc-500",   dot: "bg-zinc-400"   },
};

const TABLE_SECTIONS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "proposed",    label: "Backlog",     accent: "bg-zinc-400"    },
  { status: "approved",    label: "To Do",       accent: "bg-amber-400"   },
  { status: "in-progress", label: "In Progress", accent: "bg-brand-500"   },
  { status: "review",      label: "Review",      accent: "bg-sky-400"     },
  { status: "done",        label: "Done",        accent: "bg-emerald-500" },
];

// Kanban removed

const TASK_TYPES   = ["Task", "Feature", "Bug", "Quality", "Infrastructure"];
const PRIORITIES   = ["urgent", "high", "medium", "low"] as Priority[];

// ─── Utilities ────────────────────────────────────────────────────────────────
function taskId(t: Task): string { return t.id; }
function taskProjectId(t: Task): string {
  return t.projectId ?? (t as unknown as { project_id: string }).project_id ?? "";
}

function formatDueDate(due?: string): { text: string; cls: string } | null {
  if (!due) return null;
  const d    = new Date(due);
  const now  = new Date();
  const diff = Math.round((d.getTime() - now.getTime()) / 86400000);
  if (diff < 0)  return { text: `Overdue ${Math.abs(diff)}d`, cls: "bg-red-100 text-red-600" };
  if (diff === 0) return { text: "Due today",                  cls: "bg-amber-100 text-amber-700" };
  if (diff <= 2)  return { text: `Due in ${diff}d`,            cls: "bg-amber-100 text-amber-700" };
  return { text: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), cls: "bg-zinc-100 text-zinc-600" };
}

// ─── Click-outside hook ───────────────────────────────────────────────────────
function useClickOutside(ref: React.RefObject<HTMLDivElement | null>, fn: () => void) {
  React.useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) fn();
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [ref, fn]);
}

// ─── Pill components ──────────────────────────────────────────────────────────
function StatusPill({ status, onClick }: { status: TaskStatus; onClick?: (e: React.MouseEvent) => void }) {
  const m = STATUS_META[status] ?? STATUS_META.proposed;
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex cursor-default items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        m.bg, m.text,
        onClick && "cursor-pointer hover:opacity-80 transition-opacity"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function PriorityPill({ priority, onClick }: { priority?: string; onClick?: (e: React.MouseEvent) => void }) {
  const p = priority ?? "medium";
  const m = PRIORITY_META[p] ?? PRIORITY_META.medium;
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        m.bg, m.text,
        onClick && "cursor-pointer hover:opacity-80 transition-opacity"
      )}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", m.dot)} />
      {m.label}
    </span>
  );
}

function TypePill({ type, onClick }: { type?: string; onClick?: (e: React.MouseEvent<HTMLSpanElement>) => void }) {
  const t = type ?? "Task";
  const m = TYPE_META[t] ?? TYPE_META.Task;
  return (
    <span
      onClick={onClick}
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
        m.bg, m.text,
        onClick && "cursor-pointer hover:opacity-80 transition-opacity"
      )}>
      {t}
    </span>
  );
}

// ─── Inline popovers ──────────────────────────────────────────────────────────
function StatusPopover({ anchorEl, status, onSelect, onClose }: {
  anchorEl: HTMLElement | null; status: TaskStatus; onSelect: (s: TaskStatus) => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [anchorEl]);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-44 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
      {(Object.keys(STATUS_META) as TaskStatus[]).map((s) => {
        const m = STATUS_META[s];
        return (
          <button key={s} onClick={() => { onSelect(s); onClose(); }}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-white/5", s === status && "bg-zinc-50 dark:bg-white/5")}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", m.dot)} />
            <span className={cn("font-medium", m.text)}>{m.label}</span>
            {s === status && <span className="ml-auto text-zinc-400">✓</span>}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

function OwnerPopover({ anchorEl, assignee, team, onSelect, onClose }: {
  anchorEl: HTMLElement | null; assignee?: string; team: TeamMemberWithAgent[];
  onSelect: (name: string) => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [q, setQ] = React.useState("");
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [anchorEl]);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  const members = team.filter((m) => !q || (m.agent?.name ?? m.agentId).toLowerCase().includes(q.toLowerCase()));
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-52 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
      <div className="p-2">
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search member…"
          className="w-full rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs outline-none dark:bg-white/10 dark:text-white" />
      </div>
      <button onClick={() => { onSelect(""); onClose(); }}
        className="flex w-full items-center gap-2.5 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-white/5">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-200 text-[10px]">—</span>
        Unassigned
        {!assignee && <span className="ml-auto text-zinc-400">✓</span>}
      </button>
      {members.map((m) => {
        const name = m.agent?.name ?? m.agentId;
        return (
          <button key={m.agentId} onClick={() => { onSelect(name); onClose(); }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-xs transition-colors hover:bg-zinc-50 dark:hover:bg-white/5">
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
              {name[0]?.toUpperCase()}
            </div>
            <span className="flex-1 truncate font-medium text-zinc-800 dark:text-white">{name}</span>
            {assignee === name && <span className="text-zinc-400">✓</span>}
          </button>
        );
      })}
    </div>,
    document.body
  );
}

function PriorityPopover({ anchorEl, priority, onSelect, onClose }: {
  anchorEl: HTMLElement | null; priority?: string; onSelect: (p: Priority) => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [anchorEl]);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-40 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
      {PRIORITIES.map((p) => {
        const m = PRIORITY_META[p];
        return (
          <button key={p} onClick={() => { onSelect(p); onClose(); }}
            className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-white/5", p === priority && "bg-zinc-50 dark:bg-white/5")}>
            <span className={cn("h-2 w-2 shrink-0 rounded-full", m.dot)} />
            <span className={cn("font-medium", m.text)}>{m.label}</span>
            {p === priority && <span className="ml-auto text-zinc-400">✓</span>}
          </button>
        );
      })}
    </div>,
    document.body
  );
}


// ─── Type Popover ─────────────────────────────────────────────────────────────
function TypePopover({ anchorEl, type, onSelect, onClose }: {
  anchorEl: HTMLElement | null; type?: string; onSelect: (t: string) => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  React.useLayoutEffect(() => {
    if (!anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    setPos({ top: r.bottom + 4, left: r.left });
  }, [anchorEl]);
  React.useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  if (!pos || typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
      className="w-40 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
      {TASK_TYPES.map((t) => (
        <button key={t} onClick={() => { onSelect(t); onClose(); }}
          className={cn("flex w-full items-center gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-white/5", t === (type ?? "Task") && "bg-zinc-50 dark:bg-white/5")}>
          <span className={cn("h-2 w-2 shrink-0 rounded-full", TYPE_META[t]?.dot ?? "bg-zinc-300")} />
          <span className="font-medium text-zinc-700 dark:text-zinc-300">{t}</span>
          {t === (type ?? "Task") && <span className="ml-auto text-zinc-400">&#x2713;</span>}
        </button>
      ))}
    </div>,
    document.body
  );
}
// ─── Color bar ────────────────────────────────────────────────────────────────
function SectionColorBar({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  if (!total) return null;
  const counts: Record<TaskStatus, number> = { proposed: 0, approved: 0, "in-progress": 0, review: 0, done: 0 };
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full mt-1 mb-4">
      {(Object.entries(counts) as [TaskStatus, number][]).map(([s, n]) => n > 0 && (
        <div key={s} className={cn("transition-all", STATUS_META[s].dot)} style={{ width: `${(n / total) * 100}%` }} />
      ))}
    </div>
  );
}

// ─── Due Date Field ───────────────────────────────────────────────────────────
function DueDateField({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editing) inputRef.current?.showPicker?.();
  }, [editing]);

  const due = formatDueDate(value);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        autoFocus
        defaultValue={value ?? ""}
        onChange={(e) => { onChange(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="rounded-lg bg-white px-2 py-0.5 text-xs ring-1 ring-brand-400 focus:outline-none dark:bg-white/10 dark:text-zinc-300"
      />
    );
  }

  if (due) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-opacity hover:opacity-80",
          due.cls
        )}
      >
        <Calendar className="h-3 w-3 shrink-0" />
        {due.text}
      </button>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
    >
      <Calendar className="h-3.5 w-3.5" />
      Add due date
    </button>
  );
}

// ─── Task Detail Panel ────────────────────────────────────────────────────────
function TaskDetailPanel({
  task, team, taskNumber, onClose, onUpdate, onDelete,
}: {
  task: Task; team: TeamMemberWithAgent[]; taskNumber: number;
  onClose: () => void; onUpdate: (id: string, patch: Partial<Task>) => void; onDelete: (id: string) => void;
}) {
  const taskIdStr = `DSH-${String(taskNumber).padStart(3, "0")}`;
  const [editingTitle, setEditingTitle] = React.useState(false);
  const [title,        setTitle]        = React.useState(task.title);
  const [editingDesc,  setEditingDesc]  = React.useState(false);
  const [desc,         setDesc]         = React.useState(task.description ?? "");
  const [openPop,      setOpenPop]      = React.useState<string | null>(null);
  const [anchorEl,     setAnchorEl]     = React.useState<HTMLElement | null>(null);
  function openPopover(name: string, el: HTMLElement) { setOpenPop(name); setAnchorEl(el); }
  function closePopover() { setOpenPop(null); setAnchorEl(null); }

  function saveTitle() {
    setEditingTitle(false);
    if (title.trim() && title !== task.title) onUpdate(task.id, { title: title.trim() });
  }
  function saveDesc() {
    setEditingDesc(false);
    if (desc !== task.description) onUpdate(task.id, { description: desc });
  }

  const propRow = (label: string, value: React.ReactNode) => (
    <div className="flex min-h-[32px] items-center gap-3">
      <span className="w-24 shrink-0 text-xs font-medium text-zinc-400">{label}</span>
      <div className="relative flex-1">{value}</div>
    </div>
  );

  return (
    <div
      className="flex flex-col bg-white dark:bg-[#16132A] fixed inset-0 z-40 md:relative md:inset-auto md:border-l md:border-zinc-200 md:dark:border-[#2D2A45] md:w-[400px] md:min-w-[400px]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-[#2D2A45]">
        <span className="font-mono text-xs font-semibold text-zinc-400">{taskIdStr}</span>
        <button className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Title */}
        {editingTitle ? (
          <textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); saveTitle(); } if (e.key === "Escape") { setTitle(task.title); setEditingTitle(false); } }}
            className="mb-4 w-full resize-none rounded-lg bg-zinc-50 px-2 py-1 font-display text-xl font-bold text-zinc-900 outline-none ring-2 ring-brand-400 dark:bg-white/5 dark:text-white"
            rows={2}
          />
        ) : (
          <h2
            onClick={() => setEditingTitle(true)}
            className="mb-4 cursor-text font-display text-xl font-bold text-zinc-900 hover:bg-zinc-50 rounded-lg px-2 py-1 -mx-2 -my-1 dark:text-white dark:hover:bg-white/5 transition-colors"
          >
            {task.title}
          </h2>
        )}

        {/* Properties */}
        <div className="mb-5 flex flex-col gap-2 rounded-xl bg-zinc-50 p-3 dark:bg-[#0F0D1E]">
          {propRow("Status",
            <div className="relative">
              <StatusPill status={task.status} onClick={(e) => openPop === "status" ? closePopover() : openPopover("status", e.currentTarget as HTMLElement)} />
              {openPop === "status" && (
                <StatusPopover anchorEl={anchorEl} status={task.status} onSelect={(s) => { onUpdate(task.id, { status: s }); closePopover(); }} onClose={closePopover} />
              )}
            </div>
          )}
          {propRow("Priority",
            <div className="relative">
              <PriorityPill priority={task.priority} onClick={(e) => openPop === "priority" ? closePopover() : openPopover("priority", e.currentTarget as HTMLElement)} />
              {openPop === "priority" && (
                <PriorityPopover anchorEl={anchorEl} priority={task.priority} onSelect={(p) => { onUpdate(task.id, { priority: p }); closePopover(); }} onClose={closePopover} />
              )}
            </div>
          )}
          {propRow("Assigned to",
            <div className="relative">
              <button onClick={(e) => openPop === "owner" ? closePopover() : openPopover("owner", e.currentTarget as HTMLElement)}
                className="flex items-center gap-1.5 rounded-full hover:opacity-80 transition-opacity">
                {task.assignee ? (
                  <>
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                      {task.assignee[0]?.toUpperCase()}
                    </div>
                    <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{task.assignee}</span>
                  </>
                ) : (
                  <span className="text-xs text-zinc-400">Unassigned</span>
                )}
              </button>
              {openPop === "owner" && (
                <OwnerPopover anchorEl={anchorEl} assignee={task.assignee} team={team}
                  onSelect={(name) => { onUpdate(task.id, { assignee: name }); closePopover(); }} onClose={closePopover} />
              )}
            </div>
          )}
          {propRow("Type",
            <select value={task.type ?? "Task"} onChange={(e) => onUpdate(task.id, { type: e.target.value })}
              className="rounded-lg bg-white px-2 py-0.5 text-xs ring-1 ring-zinc-200 focus:outline-none dark:bg-white/10 dark:ring-white/10 dark:text-white">
              {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          )}
          {propRow("Due Date",
            <DueDateField
              value={task.due_date}
              onChange={(v) => onUpdate(task.id, { due_date: v || undefined })}
            />
          )}
          {task.proposer && propRow("Requestor", <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{task.proposer}</span>)}
          {(task as unknown as {requestor_org?: string}).requestor_org && propRow("Org", <span className="text-xs text-zinc-500">{(task as unknown as {requestor_org?: string}).requestor_org}</span>)}
          {(task as unknown as {in_progress_at?: string}).in_progress_at && propRow("Started", <span className="text-xs text-zinc-500">{new Date((task as unknown as {in_progress_at: string}).in_progress_at).toLocaleDateString()}</span>)}
          {(task as unknown as {review_at?: string}).review_at && propRow("Sent for Review", <span className="text-xs text-sky-600 dark:text-sky-400">{new Date((task as unknown as {review_at: string}).review_at).toLocaleDateString()}</span>)}
          {task.completed_at && propRow("Completed", <span className="text-xs text-emerald-600 dark:text-emerald-400">{new Date(task.completed_at).toLocaleDateString()}</span>)}
        </div>

        {/* Completion summary — shown when in review or done */}
        {(task.status === "review" || task.status === "done") && (
          <div className="mb-4">
            <div className="mb-2 flex items-center gap-2">
              <span className={cn("h-2 w-2 rounded-full", task.status === "done" ? "bg-emerald-400" : "bg-sky-400")} />
              <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                {task.status === "done" ? "Completion Summary" : "What was completed?"}
              </span>
            </div>
            <textarea
              value={task.completion_note ?? ""}
              onChange={(e) => onUpdate(task.id, { completion_note: e.target.value })}
              rows={4}
              placeholder="Describe what was completed — deliverables, decisions, outcomes…"
              className={cn(
                "w-full resize-none rounded-xl p-3 text-sm text-zinc-700 placeholder:text-zinc-400 ring-1 focus:outline-none dark:text-zinc-300",
                task.status === "done"
                  ? "bg-emerald-50 ring-emerald-200 focus:ring-emerald-400 dark:bg-emerald-500/5 dark:ring-emerald-500/20"
                  : "bg-sky-50 ring-sky-200 focus:ring-sky-400 dark:bg-sky-500/5 dark:ring-sky-500/20"
              )}
            />
          </div>
        )}

        {/* Description */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Description</span>
            <button onClick={() => setEditingDesc((v) => !v)}
              className="text-xs text-brand-600 hover:underline">{editingDesc ? "Preview" : "Edit"}</button>
          </div>
          {editingDesc ? (
            <textarea
              autoFocus value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={saveDesc} rows={6}
              placeholder="Add a description… (Markdown supported)"
              className="w-full resize-none rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-800 ring-1 ring-zinc-200 outline-none focus:ring-brand-400 dark:bg-white/5 dark:text-zinc-200 dark:ring-white/10"
            />
          ) : task.description ? (
            <div className="prose prose-sm max-w-none rounded-xl bg-zinc-50 px-3 py-2 text-sm text-zinc-700 dark:bg-white/5 dark:text-zinc-300 cursor-text" onClick={() => setEditingDesc(true)}>
              <Markdown>{task.description}</Markdown>
            </div>
          ) : (
            <button onClick={() => setEditingDesc(true)}
              className="w-full rounded-xl border-2 border-dashed border-zinc-200 py-4 text-sm text-zinc-400 hover:border-zinc-300 hover:text-zinc-500 dark:border-white/10">
              + Add description
            </button>
          )}
        </div>

        {/* Danger zone */}
        <button onClick={() => { onDelete(task.id); onClose(); }}
          className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
          <X className="h-3.5 w-3.5" /> Delete task
        </button>
      </div>
    </div>
  );
}

// ─── Table row ────────────────────────────────────────────────────────────────
function TableRow({
  task, taskNumber, acting, team, onUpdate, onDelete, onOpen,
}: {
  task: Task; taskNumber: number; acting: boolean; team: TeamMemberWithAgent[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: () => void; onOpen: () => void;
}) {
  const taskIdStr = `DSH-${String(taskNumber).padStart(3, "0")}`;
  const [openPop, setOpenPop] = React.useState<string | null>(null);
  const [anchorEl, setAnchorEl] = React.useState<HTMLElement | null>(null);
  function openPopover(name: string, el: HTMLElement) { setOpenPop(name); setAnchorEl(el); }
  function closePopover() { setOpenPop(null); setAnchorEl(null); }
  const [editTitle, setEditTitle] = React.useState(false);
  const [titleVal,  setTitleVal]  = React.useState(task.title);
  const due = formatDueDate(task.due_date);

  function saveTitle() {
    setEditTitle(false);
    if (titleVal.trim() && titleVal !== task.title) onUpdate(task.id, { title: titleVal.trim() });
  }

  return (
    <div className={cn(
      "group transition-colors",
      acting && "opacity-50 pointer-events-none"
    )}>
      {/* ── Mobile card layout (< md) ── */}
      <div
        className="md:hidden flex flex-col gap-1 border-b border-zinc-100 px-3 py-2.5 hover:bg-zinc-50 dark:border-[#2D2A45] dark:hover:bg-white/5 cursor-pointer"
        onClick={onOpen}
      >
        <div className="text-sm font-medium text-zinc-900 dark:text-white truncate">{task.title}</div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <StatusPill status={task.status} />
          <PriorityPill priority={task.priority} />
          {task.assignee && (
            <div className="flex items-center gap-1">
              <div className="grid h-5 w-5 place-items-center rounded-full bg-brand-600 text-[9px] font-bold text-white">
                {task.assignee[0]?.toUpperCase()}
              </div>
              <span className="text-xs text-zinc-500">{task.assignee}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Desktop full row layout (≥ md) ── */}
      <div
        onClick={onOpen}
        className={cn(
          "hidden md:flex items-center border-b border-zinc-100 dark:border-[#2D2A45] transition-colors min-h-[40px] cursor-pointer",
          "hover:bg-zinc-50 dark:hover:bg-white/5"
        )}>
      {/* Checkbox */}
      <div className="flex w-8 shrink-0 items-center justify-center">
        <input type="checkbox"
          className="h-3.5 w-3.5 rounded border-zinc-300 text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()} />
      </div>
      {/* Drag */}
      <div className="w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
        <GripVertical className="h-4 w-4 text-zinc-400" />
      </div>

      {/* Task name */}
      <div className="flex min-w-0 flex-1 items-center px-3 py-1">
        {editTitle ? (
          <input autoFocus value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={saveTitle}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleVal(task.title); setEditTitle(false); } }}
            className="w-full rounded-lg bg-white px-2 py-0.5 text-sm ring-2 ring-brand-400 outline-none dark:bg-white/10 dark:text-white"
          />
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); setEditTitle(true); }}
            className="font-display truncate text-sm font-medium text-zinc-900 dark:text-white">
            {task.title}
          </span>
        )}
      </div>

      {/* Assigned to */}
      <div className="flex w-28 shrink-0 items-center px-3">
        <button onClick={(e) => { e.stopPropagation(); openPop === "owner" ? closePopover() : openPopover("owner", e.currentTarget as HTMLElement); }}
          className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
          {task.assignee ? (
            <>
              <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
                {task.assignee[0]?.toUpperCase()}
              </div>
              <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">{task.assignee}</span>
            </>
          ) : (
            <span className="text-xs text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-400">+ Assign</span>
          )}
        </button>
        {openPop === "owner" && (
          <OwnerPopover anchorEl={anchorEl} assignee={task.assignee} team={team}
            onSelect={(name) => { onUpdate(task.id, { assignee: name }); closePopover(); }}
            onClose={closePopover} />
        )}
      </div>

      {/* Status */}
      <div className="flex w-36 shrink-0 items-center px-3">
        <StatusPill status={task.status} onClick={(e) => { e.stopPropagation(); openPop === "status" ? closePopover() : openPopover("status", e.currentTarget as HTMLElement); }} />
        {openPop === "status" && (
          <StatusPopover anchorEl={anchorEl} status={task.status}
            onSelect={(s) => { onUpdate(task.id, { status: s }); closePopover(); }}
            onClose={closePopover} />
        )}
      </div>

      {/* Priority */}
      <div className="flex w-28 shrink-0 items-center px-3">
        <PriorityPill priority={task.priority} onClick={(e) => { e.stopPropagation(); openPop === "priority" ? closePopover() : openPopover("priority", e.currentTarget as HTMLElement); }} />
        {openPop === "priority" && (
          <PriorityPopover anchorEl={anchorEl} priority={task.priority}
            onSelect={(p) => { onUpdate(task.id, { priority: p }); closePopover(); }}
            onClose={closePopover} />
        )}
      </div>

      {/* Type */}
      <div className="flex w-32 shrink-0 items-center px-3">
        <TypePill type={task.type} onClick={(e) => { e.stopPropagation(); openPop === "type" ? closePopover() : openPopover("type", e.currentTarget as HTMLElement); }} />
        {openPop === "type" && (
          <TypePopover anchorEl={anchorEl} type={task.type}
            onSelect={(t) => { onUpdate(task.id, { type: t }); closePopover(); }}
            onClose={closePopover} />
        )}
      </div>

      {/* Due date */}
      <div className="flex w-24 shrink-0 items-center px-3">
        {due ? (
          <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", due.cls)}>{due.text}</span>
        ) : (
          <span className="text-xs text-zinc-300 dark:text-zinc-700 opacity-0 group-hover:opacity-100">+ Date</span>
        )}
      </div>

      {/* Task ID */}
      <div className="w-20 shrink-0 px-3">
        <span className="font-mono text-xs text-zinc-400">{taskIdStr}</span>
      </div>

      {/* Actions */}
      <div className="flex w-16 shrink-0 items-center justify-end gap-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={(e) => { e.stopPropagation(); onOpen(); }}
          className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-500/10">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      </div>{/* end desktop row */}
    </div>
  );
}

// Column headers
const COL_HEADERS = [
  { label: "Task",        cls: "flex-1 min-w-0"           },
  { label: "Assigned to", cls: "w-28 shrink-0"            },
  { label: "Status",      cls: "w-36 shrink-0"            },
  { label: "Priority",    cls: "w-28 shrink-0"            },
  { label: "Type",        cls: "w-32 shrink-0"            },
  { label: "Due",         cls: "w-24 shrink-0"            },
  { label: "Task ID",     cls: "w-20 shrink-0"            },
  { label: "",            cls: "w-16 shrink-0"            },
];

// ─── Table section ────────────────────────────────────────────────────────────
function TableSection({
  section, tasks, startIndex, acting, team, onUpdate, onDelete, onAddTask, onQuickAdd, onOpenTask,
}: {
  section: typeof TABLE_SECTIONS[number]; tasks: Task[]; startIndex: number;
  acting: string | null; team: TeamMemberWithAgent[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAddTask: () => void;
  onQuickAdd: (title: string) => Promise<void>;
  onOpenTask: (task: Task, index: number) => void;
}) {
  const [collapsed,     setCollapsed]     = React.useState(false);
  const [quickAdding,   setQuickAdding]   = React.useState(false);
  const [quickTitle,    setQuickTitle]    = React.useState("");
  const [quickSaving,   setQuickSaving]   = React.useState(false);
  const quickInputRef = React.useRef<HTMLInputElement>(null);


  async function submitQuickAdd() {
    const title = quickTitle.trim();
    if (!title) { setQuickAdding(false); return; }
    setQuickSaving(true);
    await onQuickAdd(title);
    setQuickTitle("");
    setQuickSaving(false);
    // keep input open for rapid entry
    quickInputRef.current?.focus();
  }

  return (
    <div className="mb-2">
      {/* Section header */}
      <button onClick={() => setCollapsed((c) => !c)}
        className="group/sh flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
        <div className={cn("h-4 w-1 shrink-0 rounded-full", section.accent)} />
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150", collapsed && "-rotate-90")} />
        <span className="font-display font-bold text-zinc-900 dark:text-white text-sm">{section.label}</span>
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {tasks.length}
        </span>
        <button onClick={(e) => { e.stopPropagation(); onAddTask(); }}
          className="ml-2 flex items-center gap-1 text-xs text-zinc-400 opacity-0 group-hover/sh:opacity-100 transition-opacity hover:text-zinc-600">
          <Plus className="h-3 w-3" /> Add task
        </button>

      </button>

      {!collapsed && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
          {/* Column headers — desktop only */}
          <div className="hidden md:flex items-center border-b border-zinc-100 bg-zinc-50 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
            <div className="w-8 shrink-0" />
            <div className="w-5 shrink-0" />
            {COL_HEADERS.map((h) => (
              <div key={h.label} className={cn("px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400", h.cls)}>
                {h.label}
              </div>
            ))}
          </div>

          {/* Rows */}
          {tasks.length === 0 ? (
            <div className="px-8 py-5 text-center text-sm text-zinc-400">No tasks here.</div>
          ) : tasks.map((task, i) => (
            <TableRow
              key={task.id} task={task} taskNumber={startIndex + i + 1}
              acting={acting === task.id} team={team}
              onUpdate={onUpdate}
              onDelete={() => onDelete(task.id)}
              onOpen={() => onOpenTask(task, startIndex + i)}
            />
          ))}

          {/* Quick-add / Add task row */}
          {quickAdding ? (
            <div className="flex items-center gap-2 border-t border-dashed border-zinc-200 px-3 py-1.5 dark:border-[#2D2A45] bg-zinc-50 dark:bg-[#0F0D1E]">
              <Plus className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
              <input
                ref={quickInputRef}
                autoFocus
                value={quickTitle}
                onChange={(e) => setQuickTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); submitQuickAdd(); }
                  if (e.key === "Escape") { setQuickAdding(false); setQuickTitle(""); }
                }}
                placeholder="Type a task name… (Enter to save, Esc to cancel)"
                disabled={quickSaving}
                className="flex-1 bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-white disabled:opacity-50"
              />
              <button
                onClick={() => { setQuickAdding(false); setQuickTitle(""); }}
                className="grid h-5 w-5 shrink-0 place-items-center rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onAddTask}
                title="Open full form"
                className="text-[11px] text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 whitespace-nowrap"
              >
                Full form
              </button>
            </div>
          ) : (
            <button
              onClick={() => setQuickAdding(true)}
              className="flex w-full items-center gap-2 border-t border-dashed border-zinc-200 px-8 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:border-[#2D2A45] dark:hover:bg-white/5 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add task
            </button>
          )}


        </div>
      )}

      <SectionColorBar tasks={tasks} />
    </div>
  );
}

// ─── Main Table view ──────────────────────────────────────────────────────────
function MainTableView({
  tasks, acting, team, onUpdate, onDelete, onAddTask, onQuickAdd, onOpenTask,
}: {
  tasks: Task[]; acting: string | null; team: TeamMemberWithAgent[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAddTask: (status: TaskStatus) => void;
  onQuickAdd: (title: string, status: TaskStatus) => Promise<void>;
  onOpenTask: (task: Task, index: number) => void;
}) {
  let counter = 0;
  return (
    <div className="flex flex-col">
      {TABLE_SECTIONS.map((section) => {
        const st = tasks.filter((t) => t.status === section.status);
        const si = counter;
        counter += st.length;
        return (
          <TableSection key={section.status} section={section} tasks={st} startIndex={si}
            acting={acting} team={team} onUpdate={onUpdate} onDelete={onDelete}
            onAddTask={() => onAddTask(section.status)}
            onQuickAdd={(title) => onQuickAdd(title, section.status)}
            onOpenTask={onOpenTask} />
        );
      })}
    </div>
  );
}

// ─── Create Task Modal ────────────────────────────────────────────────────────
function CreateTaskModal({
  defaultStatus, team, onSave, onClose,
}: {
  defaultStatus: TaskStatus; team: TeamMemberWithAgent[];
  onSave: (p: { title: string; description: string; assignee: string; status: TaskStatus; type: string; priority: Priority }) => Promise<void>;
  onClose: () => void;
}) {
  const [title,       setTitle]       = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignee,    setAssignee]    = React.useState("");
  const [status,      setStatus]      = React.useState<TaskStatus>(defaultStatus);
  const [type,        setType]        = React.useState("Task");
  const [priority,    setPriority]    = React.useState<Priority>("medium");
  const [saving,      setSaving]      = React.useState(false);
  const [titleError,  setTitleError]  = React.useState(false);

  async function handleSave() {
    if (!title.trim()) { setTitleError(true); return; }
    setTitleError(false);
    setSaving(true);
    await onSave({ title: title.trim(), description: description.trim(), assignee, status, type, priority });
    setSaving(false);
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-soft ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div className="font-display text-sm font-semibold text-zinc-900 dark:text-white">New task</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Title <span className="text-red-500">*</span></label>
            <Input autoFocus placeholder="What needs to be done?" value={title}
              onChange={(e) => { setTitle(e.target.value); if (e.target.value.trim()) setTitleError(false); }}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSave(); if (e.key === "Escape") onClose(); }}
              className={titleError ? "ring-red-400 focus:ring-red-400" : ""} />
            {titleError && <p className="text-xs text-red-500">Title is required</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <textarea placeholder="Optional details…" value={description}
              onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full resize-none rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700" />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Assignee</label>
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={sel}>
                <option value="">Unassigned</option>
                {team.map((m) => <option key={m.agentId} value={m.agent?.name ?? m.agentId}>{m.agent?.name ?? m.agentId}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)} className={sel}>
                {TABLE_SECTIONS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)} className={sel}>
                {TASK_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={sel}>
                {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: "#7C3AED" }}
            className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sprint Board ─────────────────────────────────────────────────────────────
function TaskBoardContent({
  view, projectId, tasks, setTasks, team,
}: {
  view: "table"; projectId: string;
  tasks: Task[]; setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  team: TeamMemberWithAgent[];
}) {
  const [acting,        setActing]        = React.useState<string | null>(null);
  const [dragOver,      setDragOver]      = React.useState<TaskStatus | null>(null);
  const [createIn,      setCreateIn]      = React.useState<TaskStatus | null>(null);
  const [detailTask,    setDetailTask]    = React.useState<{ task: Task; index: number } | null>(null);
  const recentlyDeleted = React.useRef(new Set<string>());

  const visibleTasks = tasks.filter((t) => !recentlyDeleted.current.has(t.id));

  async function moveTask(id: string, status: TaskStatus) {
    setActing(id);
    const updated = await updateTask(projectId, id, { status });
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: updated?.status ?? status } : t));
    if (detailTask?.task.id === id) setDetailTask((d) => d ? { ...d, task: { ...d.task, status } } : null);
    setActing(null);
  }

  async function patchTask(id: string, patch: Partial<Task>) {
    const updated = await updateTask(projectId, id, patch as Record<string, unknown>);
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch, ...(updated ?? {}) } : t));
    if (detailTask?.task.id === id) setDetailTask((d) => d ? { ...d, task: { ...d.task, ...patch } } : null);
  }

  async function removeTask(id: string) {
    setActing(id);
    recentlyDeleted.current.add(id);
    const ok = await deleteTask(projectId, id);
    if (ok) setTasks((prev) => prev.filter((t) => t.id !== id));
    else recentlyDeleted.current.delete(id);
    setActing(null);
  }

  async function handleCreate(payload: { title: string; description: string; assignee: string; status: TaskStatus; type: string; priority: Priority }) {
    await createTask(projectId, { ...payload });
    // Do NOT optimistically add here — the WebSocket `task:created` event is the single source of truth.
    setCreateIn(null);
  }

  async function handleQuickAdd(title: string, status: TaskStatus) {
    await createTask(projectId, { title, status, type: "Task", priority: "medium" });
    // WebSocket task:created event is the single source of truth.
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Main content — hidden on mobile when detail panel is open */}
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-y-auto transition-all duration-250", detailTask ? "hidden md:flex" : "flex")}>
        <MainTableView
          tasks={visibleTasks} acting={acting} team={team}
          onUpdate={patchTask} onDelete={removeTask}
          onAddTask={(status) => setCreateIn(status)}
          onQuickAdd={handleQuickAdd}
          onOpenTask={(task, index) => setDetailTask({ task, index })}
        />
      </div>

      {/* Task Detail Panel */}
      {detailTask && (
        <div className="animate-slide-in-right md:w-[400px] md:shrink-0 md:h-full">
          <TaskDetailPanel
            task={detailTask.task}
            team={team}
            taskNumber={detailTask.index + 1}
            onClose={() => setDetailTask(null)}
            onUpdate={patchTask}
            onDelete={removeTask}
          />
        </div>
      )}

      {createIn && (
        <CreateTaskModal defaultStatus={createIn} team={team} onSave={handleCreate} onClose={() => setCreateIn(null)} />
      )}
    </div>
  );
}

// ─── Sprint Board Tab wrapper (state + WS) ────────────────────────────────────
function SprintBoardTab({ view, projectId }: { view: "table"; projectId: string }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [team,  setTeam]  = React.useState<TeamMemberWithAgent[]>([]);

  React.useEffect(() => {
    fetchTasks(projectId).then(setTasks);
    fetchTeam(projectId).then(setTeam);
  }, [projectId]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/api/backend/ws`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; data: unknown };
          if (msg.type === "task:created") {
            const task = (msg.data as { task: Task }).task;
            setTasks((prev) => prev.some((t) => t.id === task.id) ? prev : [...prev, task]);
          } else if (msg.type === "task:updated") {
            const task = (msg.data as { task: Task }).task;
            setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, ...task } : t));
          } else if (msg.type === "task:deleted") {
            const tid = (msg.data as { taskId: string }).taskId;
            setTasks((prev) => prev.filter((t) => t.id !== tid));
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { retryTimeout = setTimeout(connect, 3000); };
    }

    connect();
    return () => { clearTimeout(retryTimeout); ws?.close(); };
  }, [projectId]);

  return <TaskBoardContent view={view} projectId={projectId} tasks={tasks} setTasks={setTasks} team={team} />;
}

// ─── Markdown ─────────────────────────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose prose-zinc dark:prose-invert max-w-none text-sm
      prose-headings:font-display prose-headings:font-bold prose-headings:text-zinc-900 dark:prose-headings:text-white
      prose-a:text-brand-600 prose-code:rounded prose-code:bg-zinc-100 prose-code:px-1
      prose-pre:bg-zinc-50 prose-pre:ring-1 prose-pre:ring-zinc-200
      dark:prose-code:bg-white/10 dark:prose-pre:bg-white/5 dark:prose-pre:ring-white/10">
      <Markdown>{content}</Markdown>
    </div>
  );
}

function ArchitectureTab({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { fetchArchitecture(projectId).then((c) => { setContent(c); setLoading(false); }); }, [projectId]);
  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading…</div>;
  if (!content) return <Card><CardContent className="py-10 text-center text-sm text-zinc-500">No architecture doc yet.</CardContent></Card>;
  return <Card><CardHeader><CardTitle>Architecture</CardTitle></CardHeader><CardContent><MarkdownContent content={content} /></CardContent></Card>;
}

function TechSpecTab({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  React.useEffect(() => { fetchTechSpec(projectId).then((c) => { setContent(c); setLoading(false); }); }, [projectId]);
  if (loading) return <div className="py-10 text-center text-sm text-zinc-500">Loading…</div>;
  if (!content) return <Card><CardContent className="py-10 text-center text-sm text-zinc-500">No tech spec yet.</CardContent></Card>;
  return <Card><CardHeader><CardTitle>Technical Specification</CardTitle></CardHeader><CardContent><MarkdownContent content={content} /></CardContent></Card>;
}

// ─── User Members Section (human collaborators) ───────────────────────────────
const USER_ROLES = ["member", "admin"] as const;

function UserMembersSection({ projectId, canAdmin }: { projectId: string; canAdmin: boolean }) {
  const [members,  setMembers]  = React.useState<UserMember[]>([]);
  const [me,       setMe]       = React.useState<{ id: string } | null>(null);
  const [showAdd,  setShowAdd]  = React.useState(false);
  const [email,    setEmail]    = React.useState("");
  const [role,     setRole]     = React.useState<"member" | "admin">("member");
  const [adding,   setAdding]   = React.useState(false);
  const [addError, setAddError] = React.useState<string | null>(null);
  const [removing, setRemoving] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchUserMembers(projectId).then(setMembers);
    authMe().then((u) => setMe(u ? { id: u.id } : null));
  }, [projectId]);

  async function handleAdd() {
    if (!email.trim()) return;
    setAdding(true); setAddError(null);
    const result = await addUserMember(projectId, email.trim(), role);
    if (result) {
      setMembers((prev) => [...prev.filter((m) => m.user_id !== result.user_id), result]);
      setEmail(""); setShowAdd(false);
    } else {
      setAddError("No account found with that email, or they're already a member.");
    }
    setAdding(false);
  }

  async function handleRemove(userId: string) {
    setRemoving(userId);
    await removeUserMember(projectId, userId);
    setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    setRemoving(null);
  }

  const ROLE_META: Record<string, { label: string; bg: string; text: string }> = {
    owner:  { label: "Owner",  bg: "bg-amber-100",  text: "text-amber-700"  },
    admin:  { label: "Admin",  bg: "bg-violet-100", text: "text-violet-700" },
    member: { label: "Member", bg: "bg-zinc-100",   text: "text-zinc-600"   },
  };

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Collaborators</h3>
          <p className="text-xs text-zinc-400">{members.length} user{members.length !== 1 ? "s" : ""} with access</p>
        </div>
        {canAdmin && (
          <button
            onClick={() => { setShowAdd((v) => !v); setAddError(null); }}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-500/10 transition-colors"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>

      {showAdd && canAdmin && (
        <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
          <p className="mb-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">Add collaborator by email</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <input
                autoFocus
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); if (e.key === "Escape") setShowAdd(false); }}
                className="w-full rounded-lg border-0 bg-white py-2 pl-8 pr-3 text-sm ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:ring-zinc-700 dark:text-zinc-100"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "admin")}
              className="rounded-lg border-0 bg-white px-2 py-2 text-sm ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:ring-zinc-700 dark:text-zinc-100"
            >
              {USER_ROLES.map((r) => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
            <button
              onClick={handleAdd}
              disabled={adding || !email.trim()}
              className="rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {adding ? "Adding…" : "Add"}
            </button>
          </div>
          {addError && <p className="mt-2 text-xs text-red-500">{addError}</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
        {members.length === 0 ? (
          <div className="py-6 text-center text-sm text-zinc-400">
            {canAdmin ? "Only you have access. Add collaborators above." : "No other collaborators on this project."}
          </div>
        ) : (
          members.map((m, i) => {
            const meta  = ROLE_META[m.role] ?? ROLE_META.member;
            const isMe  = me?.id === m.user_id;
            return (
              <div key={m.user_id} className={cn(
                "flex items-center gap-3 px-4 py-3",
                i !== 0 && "border-t border-zinc-100 dark:border-[#2D2A45]"
              )}>
                {m.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.avatar_url}
                    alt={m.name}
                    referrerPolicy="no-referrer"
                    className="h-8 w-8 shrink-0 rounded-full object-cover ring-1 ring-zinc-200 dark:ring-white/10"
                  />
                ) : (
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-400 uppercase">
                    {m.name.charAt(0)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{m.name}</span>
                    {isMe && <span className="rounded-full bg-zinc-100 px-1.5 py-px text-[10px] font-semibold text-zinc-500 dark:bg-white/10">you</span>}
                  </div>
                  <span className="text-xs text-zinc-400 truncate">{m.email}</span>
                </div>
                <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0", meta.bg, meta.text)}>
                  {meta.label}
                </span>
                {canAdmin && m.role !== "owner" && !isMe && (
                  <button
                    onClick={() => handleRemove(m.user_id)}
                    disabled={removing === m.user_id}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors disabled:opacity-40"
                    title="Remove access"
                  >
                    {removing === m.user_id
                      ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-transparent inline-block" />
                      : <X className="h-3.5 w-3.5" />}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Team Tab ──────────────────────────────────────────────────────────────────
const TEAM_ROLES = ["Member", "Coordinator", "Developer", "Reviewer", "Observer"];

function AgentRegistryPanel({ agents, onAdd, onClose, alreadyAdded }: {
  agents: TeamMemberWithAgent["agent"][]; onAdd: (id: string, role: string) => Promise<boolean>; onClose: () => void; alreadyAdded: Set<string>;
}) {
  const [q,           setQ]           = React.useState("");
  const [role,        setRole]        = React.useState("Member");
  const [justAdded,   setJustAdded]   = React.useState<string | null>(null);
  const [failedId,    setFailedId]    = React.useState<string | null>(null);
  const [adding,      setAdding]      = React.useState<string | null>(null);

  const filtered = (agents ?? []).filter((a): a is NonNullable<typeof a> =>
    !!a && (!q || a.name.toLowerCase().includes(q.toLowerCase()))
  );

  async function handleAdd(agentId: string) {
    setAdding(agentId);
    setFailedId(null);
    const ok = await onAdd(agentId, role);
    setAdding(null);
    if (ok) {
      setJustAdded(agentId);
      setTimeout(() => onClose(), 800);
    } else {
      setFailedId(agentId);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:p-4">
      <button className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex w-full flex-col gap-3 rounded-t-2xl bg-white p-5 shadow-soft ring-1 ring-zinc-200 sm:w-80 sm:rounded-2xl dark:bg-[#16132A] dark:ring-[#2D2A45]">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">Add Agent to Team</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>

        {/* Role selector */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Role</label>
          <select
            value={role} onChange={e => setRole(e.target.value)}
            className="w-full rounded-xl border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700">
            {TEAM_ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>

        <Input placeholder="Search agents…" value={q} onChange={(e) => setQ(e.target.value)} />

        <div className="flex flex-col gap-2 overflow-y-auto max-h-72">
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-zinc-400">No agents found</p>
          )}
          {filtered.map((a) => {
            const isAdded   = alreadyAdded.has(a.id);
            const isSuccess = justAdded === a.id;
            const ext = a as unknown as Record<string, unknown>;
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
                <div className={cn(
                  "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-semibold text-white",
                  ext.agent_type === "human" ? "bg-sky-700" : "bg-zinc-800 dark:bg-zinc-700"
                )}>
                  {a.name[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{a.name}</p>
                  <p className="truncate text-xs text-zinc-500">
                    {(ext.org_name as string) ?? (ext.model as string) ?? a.desc ?? ""}
                  </p>
                </div>
                <button
                  disabled={isAdded || adding === a.id}
                  onClick={() => !isAdded && handleAdd(a.id)}
                  className={cn(
                    "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    isSuccess
                      ? "bg-emerald-500 text-white"
                      : failedId === a.id
                      ? "bg-red-500 text-white"
                      : isAdded
                      ? "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-white/10"
                      : adding === a.id
                      ? "bg-zinc-300 text-zinc-500 cursor-wait"
                      : "text-white"
                  )}
                  style={!isAdded && !isSuccess && failedId !== a.id && adding !== a.id ? { backgroundColor: "#7C3AED" } : undefined}>
                  {isSuccess ? "✓ Added" : failedId === a.id ? "✗ Failed" : isAdded ? "In team" : adding === a.id ? "Adding…" : "Add"}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TeamMemberRow({ m, projectId, pinging, pingMeta, onPing, onRemove, onRoleChange, canAdmin }: {
  m: TeamMemberWithAgent; projectId: string; pinging: boolean; canAdmin: boolean;
  pingMeta: Record<string, { dot: string; label: string }>;
  onPing: () => void; onRemove: () => void; onRoleChange: (role: string) => void;
}) {
  const [editingRole, setEditingRole] = React.useState(false);
  const name      = m.agent?.name ?? m.agentId;
  const ext       = m.agent as unknown as Record<string, unknown>;
  const pingKey   = pinging ? "pending" : (ext?.ping_status as string ?? "unknown");
  const ps        = pingMeta[pingKey] ?? pingMeta.unknown;
  const model     = ext?.model as string | undefined;
  const orgName   = ext?.org_name as string | undefined;
  const agentType = ext?.agent_type as string | undefined;
  const isOnline  = m.agent?.status === "online";
  void projectId;

  return (
    <div className="group border-b border-zinc-100 last:border-0 dark:border-[#2D2A45] transition-colors hover:bg-zinc-50 dark:hover:bg-white/5">
      {/* ── Mobile row (< md) ── */}
      <div className="flex md:hidden items-center gap-3 px-4 py-2.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", isOnline ? "bg-emerald-400" : "bg-zinc-300")} />
        <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
          agentType === "human" ? "bg-sky-700" : "bg-zinc-800 dark:bg-zinc-700")}>
          {name[0]?.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{name}</div>
        </div>
        {editingRole ? (
          <select autoFocus defaultValue={m.role}
            onBlur={() => setEditingRole(false)}
            onChange={(e) => { onRoleChange(e.target.value); setEditingRole(false); }}
            className="rounded-lg border-0 bg-white px-2 py-1 text-xs font-semibold ring-1 ring-violet-400 focus:outline-none dark:bg-zinc-900">
            {TEAM_ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        ) : (
          <button onClick={() => setEditingRole(true)}
            className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 hover:bg-violet-100 hover:text-violet-700 transition-colors dark:bg-white/10 dark:text-zinc-400 capitalize">
            {m.role}
          </button>
        )}
        <button onClick={onRemove} title="Remove"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Desktop row (≥ md) ── */}
      <div className="hidden md:flex items-center gap-3 px-4 py-2.5">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", isOnline ? "bg-emerald-400" : "bg-zinc-300")} />
        <div className="flex-1 min-w-0 flex items-center gap-2.5">
          <div className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold text-white",
            agentType === "human" ? "bg-sky-700" : "bg-zinc-800 dark:bg-zinc-700")}>
            {name[0]?.toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{name}</div>
            {m.agent?.desc && <div className="truncate text-[11px] text-zinc-400">{m.agent.desc}</div>}
          </div>
        </div>
        {/* Role */}
        <div className="w-28 shrink-0">
          {canAdmin && editingRole ? (
            <select autoFocus defaultValue={m.role}
              onBlur={() => setEditingRole(false)}
              onChange={(e) => { onRoleChange(e.target.value); setEditingRole(false); }}
              className="w-full rounded-lg border-0 bg-white px-2 py-1 text-xs font-semibold ring-1 ring-violet-400 focus:outline-none dark:bg-zinc-900">
              {TEAM_ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          ) : (
            <button onClick={() => canAdmin && setEditingRole(true)}
              className={cn("rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400 capitalize",
                canAdmin && "hover:bg-violet-100 hover:text-violet-700 transition-colors")}>
              {m.role}
            </button>
          )}
        </div>
        {/* Type */}
        <div className="w-20 shrink-0">
          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
            agentType === "human" ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                                  : "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300")}>
            {agentType === "human" ? "Human" : "AI"}
          </span>
        </div>
        {/* Model */}
        <div className="w-32 shrink-0">
          {model ? <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-500 dark:bg-white/10">{model}</span>
                 : <span className="text-xs text-zinc-300 dark:text-zinc-600">—</span>}
        </div>
        {/* Org */}
        <div className="w-28 shrink-0 truncate text-[11px] text-zinc-500">{orgName ?? "—"}</div>
        {/* Ping */}
        <div className="w-24 shrink-0 flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", ps.dot)} />
          <span className="text-[11px] text-zinc-400">{ps.label}</span>
        </div>
        {/* Actions */}
        <div className="w-20 shrink-0 flex items-center justify-end gap-1">
          <button onClick={onPing} disabled={pinging} title="Ping"
            className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-white/10 transition-colors disabled:opacity-40">
            <Zap className="h-3.5 w-3.5" />
          </button>
          {canAdmin && (
            <button onClick={onRemove} title="Remove"
              className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function TeamTab({ projectId, canAdmin }: { projectId: string; canAdmin: boolean }) {
  const [team,         setTeam]         = React.useState<TeamMemberWithAgent[]>([]);
  const [allAgents,    setAllAgents]    = React.useState<NonNullable<TeamMemberWithAgent["agent"]>[]>([]);
  const [showRegistry, setShowRegistry] = React.useState(false);
  const [pingingIds,   setPingingIds]   = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    fetchTeam(projectId).then(setTeam);
    fetchAgents().then((ag) => setAllAgents(ag));
  }, [projectId]);

  const addedIds = new Set(team.map((m) => m.agentId));

  async function handleAdd(agentId: string, role = "Member"): Promise<boolean> {
    const ok = await addTeamMember(projectId, agentId, role);
    if (ok) fetchTeam(projectId).then(setTeam);
    return ok;
  }
  async function handleRemove(agentId: string) {
    await removeTeamMember(projectId, agentId);
    setTeam((prev) => prev.filter((m) => m.agentId !== agentId));
  }
  async function handlePing(agentId: string) {
    setPingingIds((s) => new Set(s).add(agentId));
    await pingAgent(agentId);
    // Poll for ack after a delay
    setTimeout(() => {
      fetchTeam(projectId).then(setTeam);
      setPingingIds((s) => { const n = new Set(s); n.delete(agentId); return n; });
    }, 8000);
  }

  const PING_STATUS_META: Record<string, { dot: string; label: string }> = {
    ok:      { dot: "bg-emerald-400",              label: "Reachable"  },
    pending: { dot: "bg-amber-400 animate-pulse",  label: "Pinging…"   },
    timeout: { dot: "bg-red-400",                  label: "Timeout"    },
    unknown: { dot: "bg-zinc-400",                 label: "Unknown"    },
  };

  return (
    <>
      {/* Human collaborators */}
      <UserMembersSection projectId={projectId} canAdmin={canAdmin} />

      {/* Divider */}
      <div className="mb-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-zinc-100 dark:bg-[#2D2A45]" />
        <span className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Agents</span>
        <div className="h-px flex-1 bg-zinc-100 dark:bg-[#2D2A45]" />
      </div>

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-zinc-900 dark:text-white">Agent Team</h2>
          <p className="text-xs text-zinc-500">
            {team.length} agent{team.length !== 1 ? "s" : ""} · {team.filter(m => m.agent?.status === "online").length} online
          </p>
        </div>
        {canAdmin && (
          <button
            onClick={() => setShowRegistry(true)}
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-colors"
            style={{ backgroundColor: "#7C3AED" }}>
            <UserPlus className="h-4 w-4" /> Add Agent
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
        {/* Column headers — desktop only */}
        <div className="hidden md:flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
          <div className="w-4 shrink-0 mr-3" />
          <div className="flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Name</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Role</div>
          <div className="w-20 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Type</div>
          <div className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Model</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Org</div>
          <div className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Ping</div>
          <div className="w-20 shrink-0" />
        </div>

        {team.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">No agents yet</p>
            {canAdmin && (
              <button onClick={() => setShowRegistry(true)}
                className="text-sm font-semibold text-violet-600 hover:underline">Add from registry</button>
            )}
          </div>
        ) : (
          team.map((m) => (
            <TeamMemberRow
              key={m.agentId}
              m={m}
              projectId={projectId}
              pinging={pingingIds.has(m.agentId)}
              pingMeta={PING_STATUS_META}
              canAdmin={canAdmin}
              onPing={() => handlePing(m.agentId)}
              onRemove={() => handleRemove(m.agentId)}
              onRoleChange={async (role) => {
                await addTeamMember(projectId, m.agentId, role);
                fetchTeam(projectId).then(setTeam);
              }}
            />
          ))
        )}

        {/* Add row — admin only */}
        {canAdmin && (
          <button onClick={() => setShowRegistry(true)}
            className="flex w-full items-center gap-2 border-t border-dashed border-zinc-200 px-6 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:border-[#2D2A45] dark:hover:bg-white/5 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add agent
          </button>
        )}
      </div>

      {showRegistry && (
        <AgentRegistryPanel
          agents={allAgents}
          onAdd={handleAdd}
          onClose={() => setShowRegistry(false)}
          alreadyAdded={addedIds}
        />
      )}
    </>
  );
}

// ─── Project Stats Bar ────────────────────────────────────────────────────────
function ProjectStatsBar({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [team,  setTeam]  = React.useState<TeamMemberWithAgent[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    Promise.all([fetchTasks(projectId), fetchTeam(projectId)]).then(([t, m]) => {
      setTasks(t);
      setTeam(m);
      setReady(true);
    });
  }, [projectId]);

  const total    = tasks.length;
  const done     = tasks.filter((t) => t.status === "done").length;
  const inReview = tasks.filter((t) => t.status === "review").length;
  const inProg   = tasks.filter((t) => t.status === "in-progress").length;
  const members  = team.length;
  const pct      = total > 0 ? Math.round((done / total) * 100) : 0;

  const stats: { label: string; value: React.ReactNode; accent?: string }[] = [
    { label: "Tasks",       value: total,    accent: "text-zinc-900 dark:text-white"      },
    { label: "Done",        value: done,     accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "In Progress", value: inProg,   accent: "text-brand-600 dark:text-brand-400" },
    { label: "Review",      value: inReview, accent: "text-sky-600 dark:text-sky-400"     },
    { label: "Members",     value: members,  accent: "text-zinc-700 dark:text-zinc-300"   },
    { label: "Progress",    value: `${pct}%`, accent: "text-violet-600 dark:text-violet-400" },
  ];

  if (!ready) {
    return (
      <div className="flex h-9 shrink-0 items-center gap-6 border-b border-zinc-100 bg-zinc-50 px-4 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-3 w-12 animate-pulse rounded bg-zinc-200 dark:bg-white/10" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-9 shrink-0 items-center gap-0 overflow-x-auto border-b border-zinc-100 bg-zinc-50 dark:border-[#2D2A45] dark:bg-[#0F0D1E]" style={{ scrollbarWidth: "none" }}>
      {stats.map((s, i) => (
        <div key={s.label} className={cn("flex items-center gap-2 px-4", i > 0 && "border-l border-zinc-200 dark:border-[#2D2A45]")}>
          <span className={cn("text-sm font-bold tabular-nums", s.accent)}>{s.value}</span>
          <span className="text-[11px] text-zinc-400 whitespace-nowrap">{s.label}</span>
        </div>
      ))}
      {/* Mini progress bar fills remaining space */}
      <div className="ml-auto flex items-center gap-2 px-4 shrink-0">
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-200 dark:bg-white/10">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

// ─── Project Header ───────────────────────────────────────────────────────────
function ProjectHeader({ project }: { project: { id: string; name: string; description?: string; status?: string; slug?: string } }) {
  const status = project.status ?? "active";
  const statusCls =
    status === "active"  ? "bg-emerald-100 text-emerald-700" :
    status === "review"  ? "bg-amber-100 text-amber-700"     :
    status === "planned" ? "bg-zinc-100 text-zinc-600"       : "bg-zinc-100 text-zinc-500";

  return (
    <div className="flex min-h-[56px] shrink-0 items-center gap-3 border-b border-zinc-200 bg-white px-1 py-2 sm:h-[72px] sm:gap-4 dark:border-[#2D2A45] dark:bg-transparent">
      <Link href="/projects"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:text-zinc-400 transition-colors">
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {/* Project avatar */}
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg font-display text-base font-bold text-white sm:h-10 sm:w-10 sm:rounded-xl sm:text-lg"
        style={{ background: "linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%)" }}>
        {project.name[0]?.toUpperCase()}
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-lg font-extrabold text-zinc-900 dark:text-white sm:text-xl">{project.name}</h1>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", statusCls)}>{status}</span>
        </div>
        {project.description && (
          <p className="mt-0.5 hidden text-sm text-zinc-500 dark:text-zinc-400 sm:block truncate">{project.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button className="hidden sm:grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
          <Search className="h-4 w-4" />
        </button>
        <button className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "table",        label: "Task List",    icon: LayoutList },
  { id: "team",         label: "Team",         icon: Users      },
  { id: "architecture", label: "Architecture", icon: BookOpen   },
  { id: "tech-spec",    label: "Tech Spec",    icon: FileCode2  },
];

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-zinc-100 bg-white px-1 dark:border-[#2D2A45] dark:bg-transparent sm:gap-2">
      <Button variant="primary" size="sm" onClick={onNewTask}>
        <Plus className="h-3.5 w-3.5 sm:mr-1.5" />
        <span className="hidden sm:inline">New task</span>
      </Button>
      <div className="mx-1 h-4 w-px bg-zinc-200 dark:bg-white/10" />
      {[
        { icon: Users,          label: "Person"  },
        { icon: Filter,         label: "Filter"  },
        { icon: SortAsc,        label: "Sort"    },
        { icon: Search,         label: "Hide"    },
        { icon: MoreHorizontal, label: "···"     },
      ].map(({ icon: Icon, label }) => (
        <button key={label}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-300 sm:px-2.5">
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params    = React.use(props.params);
  const [project, setProject]   = React.useState(PROJECTS.find((p) => p.id === params.id));
  const [loading, setLoading]   = React.useState(!project);
  const [activeTab, setActiveTab] = React.useState<Tab>("table");
  // Lifted "new task" trigger so Toolbar can open the modal in SprintBoardTab
  const [newTaskSignal, setNewTaskSignal] = React.useState(0);

  React.useEffect(() => {
    setLoading(true);
    fetchProject(params.id).then((p) => { if (p) setProject(p); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="flex items-center justify-center py-20 text-sm text-zinc-500">Loading project…</div>;

  if (!project) return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Project not found</p>
      <Link href="/projects"><Button variant="secondary">Back to Projects</Button></Link>
    </div>
  );

  const isBoardTab = activeTab === "table";

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      <ProjectHeader project={project} />

      {/* Stats bar */}
      <ProjectStatsBar projectId={project.id} />

      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0 overflow-x-auto border-b border-zinc-200 bg-white px-1 dark:border-[#2D2A45] dark:bg-transparent" style={{ scrollbarWidth: "none" }}>
        {TABS.map((tab) => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors -mb-px sm:px-4",
                active
                  ? "border-brand-600 text-zinc-900 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}>
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
        <button className="ml-1 shrink-0 whitespace-nowrap px-2 py-2.5 text-zinc-400 hover:text-zinc-600 border-b-2 border-transparent -mb-px">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Toolbar (board tabs only) */}
      {isBoardTab && <Toolbar onNewTask={() => setNewTaskSignal((n) => n + 1)} />}

      {/* Tab content */}
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", isBoardTab ? "pt-4 px-0" : "overflow-y-auto px-1 py-4")}>
        {isBoardTab && (
          <SprintBoardTabWithSignal
            view={activeTab as "table"}
            projectId={project.id}
            newTaskSignal={newTaskSignal}
          />
        )}
        {activeTab === "team"          && <TeamTab         projectId={project.id} canAdmin={(project as unknown as { my_role?: string }).my_role !== "member"} />}
        {activeTab === "architecture"  && <ArchitectureTab projectId={project.slug ?? project.id} />}
        {activeTab === "tech-spec"     && <TechSpecTab     projectId={project.slug ?? project.id} />}
      </div>
    </div>
  );
}

// Thin wrapper so Toolbar's "New task" can trigger the modal
function SprintBoardTabWithSignal({ view, projectId, newTaskSignal }: { view: "table"; projectId: string; newTaskSignal: number }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [team,  setTeam]  = React.useState<TeamMemberWithAgent[]>([]);
  const [createIn, setCreateIn] = React.useState<TaskStatus | null>(null);

  React.useEffect(() => {
    fetchTasks(projectId).then(setTasks);
    fetchTeam(projectId).then(setTeam);
  }, [projectId]);

  // Open "new task" modal when toolbar button is clicked
  React.useEffect(() => {
    if (newTaskSignal > 0) setCreateIn("proposed");
  }, [newTaskSignal]);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let retryTimeout: ReturnType<typeof setTimeout>;
    function connect() {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/api/backend/ws`);
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; data: unknown };
          if (msg.type === "task:created") {
            const task = (msg.data as { task: Task }).task;
            setTasks((prev) => prev.some((t) => t.id === task.id) ? prev : [...prev, task]);
          } else if (msg.type === "task:updated") {
            const task = (msg.data as { task: Task }).task;
            setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, ...task } : t));
          } else if (msg.type === "task:deleted") {
            const tid = (msg.data as { taskId: string }).taskId;
            setTasks((prev) => prev.filter((t) => t.id !== tid));
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { retryTimeout = setTimeout(connect, 3000); };
    }
    connect();
    return () => { clearTimeout(retryTimeout); ws?.close(); };
  }, [projectId]);

  async function handleCreate(payload: { title: string; description: string; assignee: string; status: TaskStatus; type: string; priority: Priority }) {
    await createTask(projectId, { ...payload });
    // WebSocket task:created is the single source of truth — no optimistic add here.
    setCreateIn(null);
  }

  return (
    <>
      <TaskBoardContent view={view} projectId={projectId} tasks={tasks} setTasks={setTasks} team={team} />
      {createIn && (
        <CreateTaskModal defaultStatus={createIn} team={team} onSave={handleCreate} onClose={() => setCreateIn(null)} />
      )}
    </>
  );
}
