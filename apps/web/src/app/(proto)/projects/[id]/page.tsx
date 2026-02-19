"use client";

import * as React from "react";
import dynamic from "next/dynamic";
const Markdown = dynamic(() => import("react-markdown"), { ssr: false });
import Link from "next/link";
import {
  ArrowLeft, BookOpen, Calendar, ChevronDown, ExternalLink,
  FileCode2, Filter, GripVertical, Kanban, LayoutList,
  MoreHorizontal, Plus, Search, SortAsc, UserPlus, Users, X,
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
  type TeamMemberWithAgent,
} from "@/lib/api";
import { type Agent } from "@/lib/agents";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "table" | "kanban" | "team" | "architecture" | "tech-spec";

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_META: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  proposed:      { label: "Backlog",     bg: "bg-zinc-100",    text: "text-zinc-600",    dot: "bg-zinc-400"    },
  approved:      { label: "To Do",       bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400"   },
  "in-progress": { label: "In Progress", bg: "bg-brand-100",   text: "text-brand-700",   dot: "bg-brand-500"   },
  review:        { label: "Review",      bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-400"     },
  done:          { label: "Done",        bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const TYPE_META: Record<string, { bg: string; text: string }> = {
  Task:           { bg: "bg-zinc-100",    text: "text-zinc-600"   },
  Feature:        { bg: "bg-green-100",   text: "text-green-700"  },
  Bug:            { bg: "bg-red-100",     text: "text-red-600"    },
  Quality:        { bg: "bg-purple-100",  text: "text-purple-700" },
  Infrastructure: { bg: "bg-blue-100",    text: "text-blue-700"   },
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

const TASK_COLUMNS = TABLE_SECTIONS.map((s) => ({
  id: s.status,
  label: s.label,
  color: `border-t-${s.accent.replace("bg-", "")}`,
  dot: s.accent,
}));

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

function TypePill({ type }: { type?: string }) {
  const t = type ?? "Task";
  const m = TYPE_META[t] ?? TYPE_META.Task;
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", m.bg, m.text)}>
      {t}
    </span>
  );
}

// ─── Inline popovers ──────────────────────────────────────────────────────────
function StatusPopover({ status, onSelect, onClose }: {
  status: TaskStatus; onSelect: (s: TaskStatus) => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
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
    </div>
  );
}

function OwnerPopover({ assignee, team, onSelect, onClose }: {
  assignee?: string; team: TeamMemberWithAgent[];
  onSelect: (name: string) => void; onClose: () => void;
}) {
  const ref   = React.useRef<HTMLDivElement>(null);
  const [q, setQ] = React.useState("");
  useClickOutside(ref, onClose);
  const members = team.filter((m) => !q || (m.agent?.name ?? m.agentId).toLowerCase().includes(q.toLowerCase()));
  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
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
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
              {name[0]?.toUpperCase()}
            </div>
            <span className="flex-1 truncate font-medium text-zinc-800 dark:text-white">{name}</span>
            {assignee === name && <span className="text-zinc-400">✓</span>}
          </button>
        );
      })}
    </div>
  );
}

function PriorityPopover({ priority, onSelect, onClose }: {
  priority?: string; onSelect: (p: Priority) => void; onClose: () => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useClickOutside(ref, onClose);
  return (
    <div ref={ref} className="absolute left-0 top-full z-50 mt-1 w-40 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-zinc-200 dark:bg-[#1E1B35] dark:ring-[#2D2A45]">
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
    </div>
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
      className="flex flex-col border-l border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]"
      style={{ width: 400, minWidth: 400 }}
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
              <StatusPill status={task.status} onClick={() => setOpenPop(openPop === "status" ? null : "status")} />
              {openPop === "status" && (
                <StatusPopover status={task.status} onSelect={(s) => onUpdate(task.id, { status: s })} onClose={() => setOpenPop(null)} />
              )}
            </div>
          )}
          {propRow("Priority",
            <div className="relative">
              <PriorityPill priority={task.priority} onClick={() => setOpenPop(openPop === "priority" ? null : "priority")} />
              {openPop === "priority" && (
                <PriorityPopover priority={task.priority} onSelect={(p) => onUpdate(task.id, { priority: p })} onClose={() => setOpenPop(null)} />
              )}
            </div>
          )}
          {propRow("Owner",
            <div className="relative">
              <button onClick={() => setOpenPop(openPop === "owner" ? null : "owner")}
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
                <OwnerPopover assignee={task.assignee} team={team}
                  onSelect={(name) => onUpdate(task.id, { assignee: name })} onClose={() => setOpenPop(null)} />
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
            <input type="date" value={task.due_date ?? ""}
              onChange={(e) => onUpdate(task.id, { due_date: e.target.value || undefined })}
              className="rounded-lg bg-white px-2 py-0.5 text-xs ring-1 ring-zinc-200 focus:outline-none dark:bg-white/10 dark:ring-white/10 dark:text-zinc-300" />
          )}
          {propRow("Story Pts",
            <input type="number" min={0} max={100} value={task.estimated_sp ?? 0}
              onChange={(e) => onUpdate(task.id, { estimated_sp: Number(e.target.value) })}
              className="w-16 rounded-lg bg-white px-2 py-0.5 text-xs ring-1 ring-zinc-200 focus:outline-none dark:bg-white/10 dark:ring-white/10 dark:text-white" />
          )}
          {task.proposer && propRow("Created by", <span className="text-xs text-zinc-500">{task.proposer}</span>)}
        </div>

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
  const [editTitle, setEditTitle] = React.useState(false);
  const [titleVal,  setTitleVal]  = React.useState(task.title);
  const due = formatDueDate(task.due_date);

  function saveTitle() {
    setEditTitle(false);
    if (titleVal.trim() && titleVal !== task.title) onUpdate(task.id, { title: titleVal.trim() });
  }

  return (
    <div className={cn(
      "group flex items-center border-b border-zinc-100 dark:border-[#2D2A45] transition-colors min-h-[40px]",
      "hover:bg-zinc-50 dark:hover:bg-white/5",
      acting && "opacity-50 pointer-events-none"
    )}>
      {/* Checkbox */}
      <div className="flex w-8 shrink-0 items-center justify-center">
        <input type="checkbox"
          className="h-3.5 w-3.5 rounded border-zinc-300 text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()} />
      </div>
      {/* Drag */}
      <div className="w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-zinc-400" />
      </div>

      {/* Task name */}
      <div className="flex min-w-0 flex-1 items-center px-3 py-1">
        {editTitle ? (
          <input autoFocus value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") { setTitleVal(task.title); setEditTitle(false); } }}
            className="w-full rounded-lg bg-white px-2 py-0.5 text-sm ring-2 ring-brand-400 outline-none dark:bg-white/10 dark:text-white"
          />
        ) : (
          <span onClick={() => setEditTitle(true)}
            className="font-display cursor-text truncate text-sm font-medium text-zinc-900 dark:text-white hover:text-brand-600">
            {task.title}
          </span>
        )}
      </div>

      {/* Owner */}
      <div className="relative flex w-28 shrink-0 items-center px-3">
        <button onClick={() => setOpenPop(openPop === "owner" ? null : "owner")}
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
          <OwnerPopover assignee={task.assignee} team={team}
            onSelect={(name) => { onUpdate(task.id, { assignee: name }); setOpenPop(null); }}
            onClose={() => setOpenPop(null)} />
        )}
      </div>

      {/* Status */}
      <div className="relative flex w-36 shrink-0 items-center px-3">
        <StatusPill status={task.status} onClick={() => setOpenPop(openPop === "status" ? null : "status")} />
        {openPop === "status" && (
          <StatusPopover status={task.status}
            onSelect={(s) => { onUpdate(task.id, { status: s }); setOpenPop(null); }}
            onClose={() => setOpenPop(null)} />
        )}
      </div>

      {/* Priority */}
      <div className="relative flex w-28 shrink-0 items-center px-3">
        <PriorityPill priority={task.priority} onClick={() => setOpenPop(openPop === "priority" ? null : "priority")} />
        {openPop === "priority" && (
          <PriorityPopover priority={task.priority}
            onSelect={(p) => { onUpdate(task.id, { priority: p }); setOpenPop(null); }}
            onClose={() => setOpenPop(null)} />
        )}
      </div>

      {/* Type */}
      <div className="flex w-32 shrink-0 items-center px-3">
        <TypePill type={task.type} />
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

      {/* SP */}
      <div className="w-12 shrink-0 px-3 text-right">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{task.estimated_sp ?? 0}</span>
      </div>

      {/* Actions */}
      <div className="flex w-16 shrink-0 items-center justify-end gap-0.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onOpen}
          className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10">
          <ExternalLink className="h-3.5 w-3.5" />
        </button>
        <button onClick={onDelete}
          className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-red-100 hover:text-red-500 dark:hover:bg-red-500/10">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

// Column headers
const COL_HEADERS = [
  { label: "Task",      cls: "flex-1 min-w-0"           },
  { label: "Owner",     cls: "w-28 shrink-0"            },
  { label: "Status",    cls: "w-36 shrink-0"            },
  { label: "Priority",  cls: "w-28 shrink-0"            },
  { label: "Type",      cls: "w-32 shrink-0"            },
  { label: "Due",       cls: "w-24 shrink-0"            },
  { label: "Task ID",   cls: "w-20 shrink-0"            },
  { label: "SP",        cls: "w-12 shrink-0 text-right" },
  { label: "",          cls: "w-16 shrink-0"            },
];

// ─── Table section ────────────────────────────────────────────────────────────
function TableSection({
  section, tasks, startIndex, acting, team, onUpdate, onDelete, onAddTask, onOpenTask,
}: {
  section: typeof TABLE_SECTIONS[number]; tasks: Task[]; startIndex: number;
  acting: string | null; team: TeamMemberWithAgent[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAddTask: () => void;
  onOpenTask: (task: Task, index: number) => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const spTotal = tasks.reduce((s, t) => s + (t.estimated_sp ?? 0), 0);

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
        {spTotal > 0 && <span className="ml-auto text-xs text-zinc-400">{spTotal} SP</span>}
      </button>

      {!collapsed && (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
          {/* Column headers */}
          <div className="flex items-center border-b border-zinc-100 bg-zinc-50 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
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

          {/* Add task row */}
          <button onClick={onAddTask}
            className="flex w-full items-center gap-2 border-t border-dashed border-zinc-200 px-8 py-2.5 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:border-[#2D2A45] dark:hover:bg-white/5 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>

          {/* Sum row */}
          {spTotal > 0 && (
            <div className="flex items-center border-t border-zinc-100 bg-zinc-50 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
              <div className="w-8 shrink-0" /><div className="w-5 shrink-0" />
              <div className="flex-1 px-3 py-2 text-xs text-zinc-400">Sum</div>
              {[28, 36, 28, 32, 24, 20].map((w, i) => (
                <div key={i} className={`w-${w} shrink-0`} />
              ))}
              <div className="w-12 shrink-0 px-3 py-2 text-right text-xs font-semibold text-zinc-600 dark:text-zinc-400">{spTotal} SP</div>
              <div className="w-16 shrink-0" />
            </div>
          )}
        </div>
      )}

      <SectionColorBar tasks={tasks} />
    </div>
  );
}

// ─── Main Table view ──────────────────────────────────────────────────────────
function MainTableView({
  tasks, acting, team, onUpdate, onDelete, onAddTask, onOpenTask,
}: {
  tasks: Task[]; acting: string | null; team: TeamMemberWithAgent[];
  onUpdate: (id: string, patch: Partial<Task>) => void;
  onDelete: (id: string) => void;
  onAddTask: (status: TaskStatus) => void;
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
            onOpenTask={onOpenTask} />
        );
      })}
    </div>
  );
}

// ─── Kanban card ──────────────────────────────────────────────────────────────
function TaskCard({
  task, acting, onMove, onDelete, onDragStart, onOpen,
}: {
  task: Task; acting: boolean;
  onMove: (s: TaskStatus) => void; onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void; onOpen: () => void;
}) {
  const nextActions: { label: string; status: TaskStatus; style: string }[] = [];
  if (task.status === "proposed") {
    nextActions.push(
      { label: "→ To Do",   status: "approved",    style: "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30" },
      { label: "✓ Done",    status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
    );
  } else if (task.status === "approved") {
    nextActions.push(
      { label: "▶ Start",   status: "in-progress", style: "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/30" },
      { label: "✓ Done",    status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
    );
  } else if (task.status === "in-progress") {
    nextActions.push(
      { label: "⬆ Review",  status: "review",      style: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/30" },
      { label: "✓ Done",    status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
    );
  } else if (task.status === "review") {
    nextActions.push(
      { label: "✓ Approve", status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
      { label: "↩ Rework",  status: "in-progress", style: "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/30" },
    );
  } else {
    nextActions.push(
      { label: "↩ Reopen",  status: "proposed",    style: "bg-zinc-50 text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700" },
    );
  }

  const due = formatDueDate(task.due_date);

  return (
    <div draggable onDragStart={onDragStart}
      className={cn(
        "group rounded-xl bg-white p-3 ring-1 ring-zinc-200 shadow-softSm",
        "dark:bg-[#16132A] dark:ring-[#2D2A45]",
        "cursor-grab active:cursor-grabbing active:scale-[0.98] transition-all",
        acting && "opacity-60 pointer-events-none"
      )}>
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-400" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-semibold text-zinc-900 dark:text-white">{task.title}</div>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">{task.description}</p>
          )}
        </div>
        <button onClick={onOpen} className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
        </button>
      </div>

      {/* Pills row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {task.priority && task.priority !== "medium" && <PriorityPill priority={task.priority} />}
        {task.type && task.type !== "Task" && <TypePill type={task.type} />}
        {due && <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", due.cls)}>{due.text}</span>}
      </div>

      {/* Meta */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {task.assignee && (
          <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
            {task.assignee}
          </span>
        )}
        {(task.estimated_sp ?? 0) > 0 && (
          <span className="ml-auto rounded-full bg-zinc-100 px-2 py-0.5 font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
            {task.estimated_sp} SP
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {nextActions.map((a) => (
          <button key={a.status} disabled={acting} onClick={() => onMove(a.status)}
            className={cn("flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 transition disabled:opacity-50", a.style)}>
            {a.label}
          </button>
        ))}
        <button disabled={acting} onClick={onDelete}
          className="flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 transition bg-red-50 text-red-600 ring-red-200 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30 disabled:opacity-50">
          {task.status === "proposed" ? "✕ Reject" : "✕ Remove"}
        </button>
      </div>
    </div>
  );
}

// ─── Create Task Modal ────────────────────────────────────────────────────────
function CreateTaskModal({
  defaultStatus, team, onSave, onClose,
}: {
  defaultStatus: TaskStatus; team: TeamMemberWithAgent[];
  onSave: (p: { title: string; description: string; assignee: string; status: TaskStatus; type: string; estimated_sp: number; priority: Priority }) => Promise<void>;
  onClose: () => void;
}) {
  const [title,       setTitle]       = React.useState("");
  const [description, setDescription] = React.useState("");
  const [assignee,    setAssignee]    = React.useState("");
  const [status,      setStatus]      = React.useState<TaskStatus>(defaultStatus);
  const [type,        setType]        = React.useState("Task");
  const [estimatedSp, setEstimatedSp] = React.useState(0);
  const [priority,    setPriority]    = React.useState<Priority>("medium");
  const [saving,      setSaving]      = React.useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description: description.trim(), assignee, status, type, estimated_sp: estimatedSp, priority });
    setSaving(false);
  }

  const sel = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-soft ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <div className="font-display text-sm font-semibold text-zinc-900 dark:text-white">New task</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Title <span className="text-red-500">*</span></label>
            <Input autoFocus placeholder="What needs to be done?" value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSave(); if (e.key === "Escape") onClose(); }} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <textarea placeholder="Optional details…" value={description}
              onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full resize-none rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700" />
          </div>

          <div className="grid grid-cols-2 gap-3">
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
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Story Points</label>
              <Input type="number" min={0} max={100} value={estimatedSp} onChange={(e) => setEstimatedSp(Number(e.target.value))} placeholder="0" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? "Creating…" : "Create task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Sprint Board ─────────────────────────────────────────────────────────────
function TaskBoardContent({
  view, projectId, tasks, setTasks, team,
}: {
  view: "table" | "kanban"; projectId: string;
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

  async function handleCreate(payload: { title: string; description: string; assignee: string; status: TaskStatus; type: string; estimated_sp: number; priority: Priority }) {
    const created = await createTask(projectId, { ...payload, proposer: "Mithran ⚡" });
    if (created) setTasks((prev) => [...prev, created]);
    setCreateIn(null);
  }

  function onDragStart(e: React.DragEvent, id: string) { e.dataTransfer.setData("taskId", id); e.dataTransfer.effectAllowed = "move"; }
  function onDragOver(e: React.DragEvent, status: TaskStatus) { e.preventDefault(); setDragOver(status); }
  async function onDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault(); setDragOver(null);
    const id = e.dataTransfer.getData("taskId");
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    await moveTask(id, status);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Main content */}
      <div className={cn("flex min-w-0 flex-1 flex-col overflow-y-auto transition-all duration-250", detailTask ? "pr-0" : "")}>
        {view === "table" && (
          <MainTableView
            tasks={visibleTasks} acting={acting} team={team}
            onUpdate={patchTask} onDelete={removeTask}
            onAddTask={(status) => setCreateIn(status)}
            onOpenTask={(task, index) => setDetailTask({ task, index })}
          />
        )}

        {view === "kanban" && (
          <div className="overflow-x-auto pb-2">
            <div className="flex gap-3" style={{ minWidth: `${TASK_COLUMNS.length * 256}px` }}>
              {TASK_COLUMNS.map((col) => {
                const colTasks = visibleTasks.filter((t) => t.status === col.id);
                const isOver   = dragOver === col.id;
                return (
                  <div key={col.id}
                    className={cn(
                      "flex flex-1 flex-col gap-3 rounded-2xl p-4 transition-colors ring-1",
                      "bg-zinc-50 ring-zinc-200 dark:bg-[#0F0D1E] dark:ring-[#2D2A45]",
                      isOver && "bg-brand-50 ring-brand-300 dark:bg-brand-950/40 dark:ring-brand-500/30"
                    )}
                    style={{ minWidth: 232 }}
                    onDragOver={(e) => onDragOver(e, col.id)}
                    onDragLeave={() => setDragOver(null)}
                    onDrop={(e) => onDrop(e, col.id)}
                  >
                    <div className={cn("flex items-center gap-2 border-t-[3px] pt-3", col.color)}>
                      <div className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                      <span className="font-display flex-1 text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">{col.label}</span>
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">{colTasks.length}</span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {colTasks.map((task) => (
                        <TaskCard key={task.id} task={task} acting={acting === task.id}
                          onMove={(s) => moveTask(task.id, s)}
                          onDelete={() => removeTask(task.id)}
                          onDragStart={(e) => onDragStart(e, task.id)}
                          onOpen={() => setDetailTask({ task, index: tasks.indexOf(task) })}
                        />
                      ))}
                    </div>
                    <button onClick={() => setCreateIn(col.id)}
                      className="mt-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition hover:bg-white hover:text-zinc-700 dark:hover:bg-white/5 dark:hover:text-zinc-200">
                      <Plus className="h-3.5 w-3.5" /> Add task
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Task Detail Panel */}
      {detailTask && (
        <div className="animate-slide-in-right flex h-full shrink-0" style={{ width: 400 }}>
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
function SprintBoardTab({ view, projectId }: { view: "table" | "kanban"; projectId: string }) {
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

// ─── Team Tab ──────────────────────────────────────────────────────────────────
function AgentRegistryPanel({ agents, onAdd, onClose, alreadyAdded }: {
  agents: TeamMemberWithAgent["agent"][]; onAdd: (id: string) => void; onClose: () => void; alreadyAdded: Set<string>;
}) {
  const [q, setQ] = React.useState("");
  const filtered = (agents ?? []).filter((a): a is NonNullable<typeof a> => !!a && (!q || a.name.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4">
      <button className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex w-80 flex-col gap-4 rounded-2xl bg-white p-5 shadow-soft ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45]">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">Agent Registry</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <Input placeholder="Search agents…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-col gap-2 overflow-y-auto max-h-80">
          {filtered.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 p-3 dark:bg-white/5">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-900 text-xs font-semibold text-white dark:bg-zinc-700">
                {a.name[0]?.toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{a.name}</p>
                <p className="text-xs text-zinc-500 truncate">{a.desc}</p>
              </div>
              <Button size="sm" variant={alreadyAdded.has(a.id) ? "secondary" : "primary"} disabled={alreadyAdded.has(a.id)} onClick={() => onAdd(a.id)}>
                {alreadyAdded.has(a.id) ? "Added" : "Add"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamTab({ projectId }: { projectId: string }) {
  const [team,         setTeam]         = React.useState<TeamMemberWithAgent[]>([]);
  const [allAgents,    setAllAgents]    = React.useState<NonNullable<TeamMemberWithAgent["agent"]>[]>([]);
  const [showRegistry, setShowRegistry] = React.useState(false);
  const [pingingIds,   setPingingIds]   = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    fetchTeam(projectId).then(setTeam);
    fetchAgents().then((ag) => setAllAgents(ag));
  }, [projectId]);

  const addedIds = new Set(team.map((m) => m.agentId));

  async function handleAdd(agentId: string) {
    await addTeamMember(projectId, agentId, "member");
    fetchTeam(projectId).then(setTeam);
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team</CardTitle>
            <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              {team.length} agent{team.length !== 1 ? "s" : ""} · {team.filter(m => m.agent?.status === "online").length} online
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowRegistry(true)}>
            <UserPlus className="h-4 w-4" /> Add Agent
          </Button>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">No agents yet</p>
              <Button variant="secondary" size="sm" onClick={() => setShowRegistry(true)}>Add from registry</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {team.map((m) => {
                const name       = m.agent?.name ?? m.agentId;
                const ext        = m.agent as unknown as Record<string, unknown>;
                const pingStatus = pingingIds.has(m.agentId) ? "pending" : (ext?.ping_status as string ?? "unknown");
                const orgName    = ext?.org_name as string | undefined;
                const caps       = (ext?.capabilities as string[]) ?? [];
                const model      = ext?.model as string | undefined;
                const lastSeen   = ext?.last_seen_at as string | undefined;
                const ps         = PING_STATUS_META[pingStatus] ?? PING_STATUS_META.unknown;

                return (
                  <div key={m.agentId} className="flex items-center gap-4 rounded-2xl bg-zinc-50 p-4 ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-[#2D2A45]">
                    {/* Avatar with online dot */}
                    <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-zinc-700">
                      <span className="text-xs font-semibold">{name[0]?.toUpperCase()}</span>
                      <span className={cn(
                        "absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-[#0F0D1E]",
                        m.agent?.status === "online" ? "bg-emerald-400" : "bg-zinc-400"
                      )} />
                    </div>
                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-display text-sm font-bold text-zinc-900 dark:text-white">{name}</span>
                        {orgName && (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">{orgName}</span>
                        )}
                        {model && (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-white/10">{model}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="flex items-center gap-1 text-[11px] text-zinc-500">
                          <span className={cn("h-1.5 w-1.5 rounded-full", ps.dot)} />
                          {ps.label}
                          {lastSeen && <span className="text-zinc-400">· seen {new Date(lastSeen).toLocaleTimeString()}</span>}
                        </span>
                        {caps.slice(0, 5).map((c) => (
                          <span key={c} className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10">{c}</span>
                        ))}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400">{m.role}{m.agent?.desc && ` · ${m.agent.desc}`}</div>
                    </div>
                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-2">
                      <Button size="sm" variant="secondary">Inspect</Button>
                      <Button size="sm" variant="secondary"
                        disabled={pingingIds.has(m.agentId)}
                        onClick={() => handlePing(m.agentId)}>
                        {pingingIds.has(m.agentId) ? "Pinging…" : "Ping"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleRemove(m.agentId)}>Remove</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
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

// ─── Project Header ───────────────────────────────────────────────────────────
function ProjectHeader({ project }: { project: { id: string; name: string; description?: string; status?: string; slug?: string } }) {
  const status = project.status ?? "active";
  const statusCls =
    status === "active"  ? "bg-emerald-100 text-emerald-700" :
    status === "review"  ? "bg-amber-100 text-amber-700"     :
    status === "planned" ? "bg-zinc-100 text-zinc-600"       : "bg-zinc-100 text-zinc-500";

  return (
    <div className="flex h-[72px] shrink-0 items-center gap-4 border-b border-zinc-200 bg-white px-1 dark:border-[#2D2A45] dark:bg-transparent">
      <Link href="/projects"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:text-zinc-400 transition-colors">
        <ArrowLeft className="h-4 w-4" />
      </Link>

      {/* Project avatar */}
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl font-display text-lg font-bold text-white"
        style={{ background: "linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%)" }}>
        {project.name[0]?.toUpperCase()}
      </div>

      {/* Name + description */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-xl font-extrabold text-zinc-900 dark:text-white">{project.name}</h1>
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize", statusCls)}>{status}</span>
        </div>
        {project.description && (
          <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400 truncate">{project.description}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-2">
        <button className="grid h-8 w-8 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
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
  { id: "table",        label: "Main table",   icon: LayoutList },
  { id: "kanban",       label: "Kanban",       icon: Kanban     },
  { id: "team",         label: "Team",         icon: Users      },
  { id: "architecture", label: "Architecture", icon: BookOpen   },
  { id: "tech-spec",    label: "Tech Spec",    icon: FileCode2  },
];

// ─── Toolbar ──────────────────────────────────────────────────────────────────
function Toolbar({ onNewTask }: { onNewTask: () => void }) {
  return (
    <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-100 bg-white px-1 dark:border-[#2D2A45] dark:bg-transparent">
      <Button variant="primary" size="sm" onClick={onNewTask}>
        <Plus className="mr-1.5 h-3.5 w-3.5" /> New task
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
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-300">
          <Icon className="h-3.5 w-3.5" />
          {label}
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

  const isBoardTab = activeTab === "table" || activeTab === "kanban";

  return (
    <div className="flex h-full flex-col">
      {/* Project header */}
      <ProjectHeader project={project} />

      {/* Tab bar */}
      <div className="flex shrink-0 items-center gap-0 border-b border-zinc-200 bg-white px-1 dark:border-[#2D2A45] dark:bg-transparent">
        {TABS.map((tab) => {
          const Icon   = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors -mb-px",
                active
                  ? "border-brand-600 text-zinc-900 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              )}>
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
        <button className="ml-1 px-2 py-2.5 text-zinc-400 hover:text-zinc-600 border-b-2 border-transparent -mb-px">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Toolbar (board tabs only) */}
      {isBoardTab && <Toolbar onNewTask={() => setNewTaskSignal((n) => n + 1)} />}

      {/* Tab content */}
      <div className={cn("flex min-h-0 flex-1 flex-col overflow-hidden", isBoardTab ? "pt-4 px-0" : "overflow-y-auto px-1 py-4")}>
        {isBoardTab && (
          <SprintBoardTabWithSignal
            view={activeTab as "table" | "kanban"}
            projectId={project.id}
            newTaskSignal={newTaskSignal}
          />
        )}
        {activeTab === "team"          && <TeamTab         projectId={project.id} />}
        {activeTab === "architecture"  && <ArchitectureTab projectId={project.slug ?? project.id} />}
        {activeTab === "tech-spec"     && <TechSpecTab     projectId={project.slug ?? project.id} />}
      </div>
    </div>
  );
}

// Thin wrapper so Toolbar's "New task" can trigger the modal
function SprintBoardTabWithSignal({ view, projectId, newTaskSignal }: { view: "table" | "kanban"; projectId: string; newTaskSignal: number }) {
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

  async function handleCreate(payload: { title: string; description: string; assignee: string; status: TaskStatus; type: string; estimated_sp: number; priority: Priority }) {
    const created = await createTask(projectId, { ...payload, proposer: "Mithran ⚡" });
    if (created) setTasks((prev) => [...prev, created]);
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
