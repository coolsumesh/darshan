"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const Markdown = dynamic(() => import("react-markdown"), { ssr: false });
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  ChevronDown,
  FileCode2,
  GripVertical,
  Kanban,
  LayoutList,
  MoreHorizontal,
  Plus,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { PROJECTS, type Task, type TaskStatus } from "@/lib/projects";
import { type Agent } from "@/lib/agents";
import {
  fetchProject,
  fetchTasks,
  fetchTeam,
  fetchAgents,
  createTask,
  updateTask,
  deleteTask,
  addTeamMember,
  removeTeamMember,
  fetchArchitecture,
  fetchTechSpec,
  type TeamMemberWithAgent,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "architecture" | "tech-spec" | "sprint-board" | "team";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusTone(status: string): "brand" | "warning" | "success" | "neutral" {
  if (status === "active") return "brand";
  if (status === "review") return "warning";
  if (status === "online") return "success";
  if (status === "away") return "warning";
  return "neutral";
}

const TASK_COLUMNS: { id: TaskStatus; label: string; color: string; dot: string }[] = [
  { id: "proposed",    label: "Backlog",     color: "border-t-zinc-400",    dot: "bg-zinc-400"    },
  { id: "approved",    label: "To Do",       color: "border-t-amber-400",   dot: "bg-amber-400"   },
  { id: "in-progress", label: "In Progress", color: "border-t-brand-500",   dot: "bg-brand-500"   },
  { id: "review",      label: "Review",      color: "border-t-sky-400",     dot: "bg-sky-400"     },
  { id: "done",        label: "Done",        color: "border-t-emerald-500", dot: "bg-emerald-500" },
];


// Normalise DB snake_case rows and frontend camelCase Task objects
function taskId(t: Task): string { return t.id; }
function taskProjectId(t: Task): string {
  return t.projectId ?? (t as unknown as { project_id: string }).project_id ?? "";
}

// ─── Monday-style status & type badges ───────────────────────────────────────

const STATUS_META: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  proposed:    { label: "Backlog",      bg: "bg-zinc-100",    text: "text-zinc-600",    dot: "bg-zinc-400"    },
  approved:    { label: "To Do",        bg: "bg-amber-100",   text: "text-amber-700",   dot: "bg-amber-400"   },
  "in-progress":{ label: "In Progress", bg: "bg-brand-100",   text: "text-brand-700",   dot: "bg-brand-500"   },
  review:      { label: "Review",       bg: "bg-sky-100",     text: "text-sky-700",     dot: "bg-sky-400"     },
  done:        { label: "Done",         bg: "bg-emerald-100", text: "text-emerald-700", dot: "bg-emerald-500" },
};

const TYPE_META: Record<string, { bg: string; text: string }> = {
  Task:           { bg: "bg-zinc-100",    text: "text-zinc-600"    },
  Feature:        { bg: "bg-green-100",   text: "text-green-700"   },
  Bug:            { bg: "bg-red-100",     text: "text-red-600"     },
  Quality:        { bg: "bg-purple-100",  text: "text-purple-700"  },
  Infrastructure: { bg: "bg-blue-100",    text: "text-blue-700"    },
};

function StatusPill({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.proposed;
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", m.bg, m.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", m.dot)} />
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

// ─── Table section color bar ──────────────────────────────────────────────────

function SectionColorBar({ tasks }: { tasks: Task[] }) {
  const total = tasks.length;
  if (!total) return null;
  const counts: Record<TaskStatus, number> = { proposed: 0, approved: 0, "in-progress": 0, review: 0, done: 0 };
  for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
  return (
    <div className="flex h-1 w-full overflow-hidden rounded-full mt-2">
      {(Object.entries(counts) as [TaskStatus, number][]).map(([s, n]) => n > 0 && (
        <div key={s} className={cn("transition-all", STATUS_META[s].dot)} style={{ width: `${(n / total) * 100}%` }} />
      ))}
    </div>
  );
}

// ─── Main Table view ──────────────────────────────────────────────────────────

const TABLE_SECTIONS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "proposed",     label: "Backlog",      accent: "bg-zinc-400"    },
  { status: "approved",     label: "To Do",        accent: "bg-amber-400"   },
  { status: "in-progress",  label: "In Progress",  accent: "bg-brand-500"   },
  { status: "review",       label: "Review",       accent: "bg-sky-400"     },
  { status: "done",         label: "Done",         accent: "bg-emerald-500" },
];

const COL_HEADERS = [
  { label: "Task",         cls: "flex-1 min-w-0"  },
  { label: "Owner",        cls: "w-28 shrink-0"   },
  { label: "Status",       cls: "w-36 shrink-0"   },
  { label: "Type",         cls: "w-32 shrink-0"   },
  { label: "Task ID",      cls: "w-24 shrink-0"   },
  { label: "SP",           cls: "w-12 shrink-0 text-right" },
  { label: "",             cls: "w-8  shrink-0"   },
];

function TableRow({
  task,
  taskNumber,
  acting,
  onMove,
  onDelete,
}: {
  task: Task;
  taskNumber: number;
  acting: boolean;
  onMove: (s: TaskStatus) => void;
  onDelete: () => void;
}) {
  const taskIdStr = `DSH-${String(taskNumber).padStart(3, "0")}`;

  return (
    <div
      className={cn(
        "group flex items-center gap-0 border-b border-zinc-100 dark:border-[#2D2A45] transition-colors",
        "hover:bg-zinc-50 dark:hover:bg-white/5 min-h-[40px]",
        acting && "opacity-50 pointer-events-none"
      )}
    >
      {/* Checkbox */}
      <div className="flex w-8 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-zinc-300 text-brand-600 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        />
      </div>

      {/* Drag indicator */}
      <div className="w-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical className="h-4 w-4 text-zinc-400" />
      </div>

      {/* Task name */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2">
        <span className="font-display truncate text-sm font-medium text-zinc-900 dark:text-white">
          {task.title}
        </span>
      </div>

      {/* Owner */}
      <div className="flex w-28 shrink-0 items-center px-3">
        {task.assignee ? (
          <div className="flex items-center gap-1.5">
            <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-600 text-[10px] font-bold text-white">
              {task.assignee[0]?.toUpperCase()}
            </div>
            <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">{task.assignee}</span>
          </div>
        ) : (
          <span className="text-xs text-zinc-300 dark:text-zinc-700">—</span>
        )}
      </div>

      {/* Status */}
      <div className="flex w-36 shrink-0 items-center px-3">
        <StatusPill status={task.status} />
      </div>

      {/* Type */}
      <div className="flex w-32 shrink-0 items-center px-3">
        <TypePill type={task.type} />
      </div>

      {/* Task ID */}
      <div className="w-24 shrink-0 px-3">
        <span className="font-mono text-xs text-zinc-400">{taskIdStr}</span>
      </div>

      {/* SP */}
      <div className="w-12 shrink-0 px-3 text-right">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {task.estimated_sp ?? 0}
        </span>
      </div>

      {/* Row actions (hover) */}
      <div className="flex w-8 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={onDelete}
          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 dark:hover:bg-white/10"
          title="Remove"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function TableSection({
  section,
  tasks,
  startIndex,
  acting,
  onMove,
  onDelete,
  onAddTask,
}: {
  section: typeof TABLE_SECTIONS[number];
  tasks: Task[];
  startIndex: number;
  acting: string | null;
  onMove: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
  onAddTask: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const spTotal = tasks.reduce((s, t) => s + (t.estimated_sp ?? 0), 0);

  return (
    <div className="mb-4">
      {/* Section header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="group/sh flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-zinc-50 dark:hover:bg-white/5 rounded-lg transition-colors"
      >
        <div className={cn("h-4 w-1 shrink-0 rounded-full", section.accent)} />
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-150", collapsed && "-rotate-90")} />
        <span className="font-display font-bold text-zinc-900 dark:text-white text-sm">{section.label}</span>
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-semibold text-zinc-500 dark:bg-white/10 dark:text-zinc-400">
          {tasks.length}
        </span>
        <button
          className="ml-2 flex items-center gap-1 text-xs text-zinc-400 opacity-0 group-hover/sh:opacity-100 transition-opacity hover:text-zinc-600"
          onClick={(e) => { e.stopPropagation(); onAddTask(); }}
        >
          <Plus className="h-3 w-3" /> Add task
        </button>
        {spTotal > 0 && (
          <span className="ml-auto text-xs text-zinc-400">{spTotal} SP</span>
        )}
      </button>

      {!collapsed && (
        <div className="mt-1 overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
          {/* Column headers */}
          <div className="flex items-center gap-0 border-b border-zinc-100 bg-zinc-50 px-0 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
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
            <div className="px-8 py-6 text-center text-sm text-zinc-400">No tasks in this column.</div>
          ) : (
            tasks.map((task, i) => (
              <TableRow
                key={task.id}
                task={task}
                taskNumber={startIndex + i + 1}
                acting={acting === task.id}
                onMove={(s) => onMove(task.id, s)}
                onDelete={() => onDelete(task.id)}
              />
            ))
          )}

          {/* Add task row */}
          <button
            onClick={onAddTask}
            className="flex w-full items-center gap-2 border-t border-dashed border-zinc-200 px-8 py-2.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-600 dark:border-[#2D2A45] dark:hover:bg-white/5"
          >
            <Plus className="h-3.5 w-3.5" /> Add task
          </button>

          {/* SP sum row */}
          {spTotal > 0 && (
            <div className="flex items-center border-t border-zinc-100 bg-zinc-50 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
              <div className="w-8 shrink-0" /><div className="w-5 shrink-0" />
              <div className="flex-1 px-3 py-2 text-xs text-zinc-400">Sum</div>
              <div className="w-28 shrink-0" /><div className="w-36 shrink-0" /><div className="w-32 shrink-0" /><div className="w-24 shrink-0" />
              <div className="w-12 shrink-0 px-3 py-2 text-right text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {spTotal} SP
              </div>
              <div className="w-8 shrink-0" />
            </div>
          )}
        </div>
      )}

      <SectionColorBar tasks={tasks} />
    </div>
  );
}

function MainTableView({
  tasks,
  acting,
  onMove,
  onDelete,
  onAddTask,
}: {
  tasks: Task[];
  acting: string | null;
  onMove: (id: string, s: TaskStatus) => void;
  onDelete: (id: string) => void;
  onAddTask: (status: TaskStatus) => void;
}) {
  let counter = 0;
  return (
    <div className="flex flex-col">
      {TABLE_SECTIONS.map((section) => {
        const sectionTasks = tasks.filter((t) => t.status === section.status);
        const startIdx = counter;
        counter += sectionTasks.length;
        return (
          <TableSection
            key={section.status}
            section={section}
            tasks={sectionTasks}
            startIndex={startIdx}
            acting={acting}
            onMove={onMove}
            onDelete={onDelete}
            onAddTask={() => onAddTask(section.status)}
          />
        );
      })}

      <button
        onClick={() => {}}
        className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600 dark:hover:bg-white/5"
      >
        <Plus className="h-3.5 w-3.5" /> Add new group
      </button>
    </div>
  );
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      components={{
        h1: ({ children }) => <h1 className="mb-4 mt-6 text-lg font-semibold text-slate-900 dark:text-slate-100 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="mb-3 mt-5 text-base font-semibold text-slate-800 dark:text-slate-200 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300 first:mt-0">{children}</h3>,
        p:  ({ children }) => <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>,
        ul: ({ children }) => <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">{children}</ul>,
        ol: ({ children }) => <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-400">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock
            ? <code className="block w-full overflow-x-auto rounded-xl bg-slate-100 px-4 py-3 text-xs font-mono text-slate-800 dark:bg-slate-900 dark:text-slate-200">{children}</code>
            : <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">{children}</code>;
        },
        pre:    ({ children }) => <pre className="mb-3 overflow-x-auto rounded-xl bg-slate-100 p-4 dark:bg-slate-900">{children}</pre>,
        strong: ({ children }) => <strong className="font-semibold text-slate-800 dark:text-slate-200">{children}</strong>,
        hr:     ()             => <hr className="my-4 border-slate-200 dark:border-slate-800" />,
        a:      ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-[rgb(var(--accent-600))] underline underline-offset-2 hover:opacity-80">{children}</a>,
      }}
    >
      {content}
    </Markdown>
  );
}

// ─── Architecture Tab ─────────────────────────────────────────────────────────
function ArchitectureTab({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading]  = React.useState(true);
  React.useEffect(() => { fetchArchitecture(projectId).then((c) => { setContent(c); setLoading(false); }); }, [projectId]);
  if (loading) return <div className="py-10 text-center text-sm text-slate-500">Loading architecture…</div>;
  if (!content) return <Card><CardContent className="py-10 text-center"><p className="text-sm text-slate-500">No architecture documentation yet.</p></CardContent></Card>;
  return <Card><CardHeader><CardTitle>Architecture</CardTitle></CardHeader><CardContent><MarkdownContent content={content} /></CardContent></Card>;
}

// ─── Tech Spec Tab ────────────────────────────────────────────────────────────
function TechSpecTab({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading]  = React.useState(true);
  React.useEffect(() => { fetchTechSpec(projectId).then((c) => { setContent(c); setLoading(false); }); }, [projectId]);
  if (loading) return <div className="py-10 text-center text-sm text-slate-500">Loading tech spec…</div>;
  if (!content) return <Card><CardContent className="py-10 text-center"><p className="text-sm text-slate-500">No technical specification yet.</p></CardContent></Card>;
  return <Card><CardHeader><CardTitle>Technical Specification</CardTitle></CardHeader><CardContent><MarkdownContent content={content} /></CardContent></Card>;
}

// ─── Create Task Modal ────────────────────────────────────────────────────────
const TASK_TYPES = ["Task", "Feature", "Bug", "Quality", "Infrastructure"];

function CreateTaskModal({
  defaultStatus,
  team,
  onSave,
  onClose,
}: {
  defaultStatus: TaskStatus;
  team: TeamMemberWithAgent[];
  onSave: (payload: { title: string; description: string; assignee: string; status: TaskStatus; type: string; estimated_sp: number }) => Promise<void>;
  onClose: () => void;
}) {
  const [title,        setTitle]        = React.useState("");
  const [description,  setDescription]  = React.useState("");
  const [assignee,     setAssignee]     = React.useState("");
  const [status,       setStatus]       = React.useState<TaskStatus>(defaultStatus);
  const [type,         setType]         = React.useState("Task");
  const [estimatedSp,  setEstimatedSp]  = React.useState(0);
  const [saving,       setSaving]       = React.useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    await onSave({ title: title.trim(), description: description.trim(), assignee, status, type, estimated_sp: estimatedSp });
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white shadow-soft ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4 dark:border-slate-800">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">New task</div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-900">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col gap-4 p-5">
          {/* Title */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Title <span className="text-red-500">*</span></label>
            <Input
              autoFocus
              placeholder="What needs to be done?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) handleSave(); if (e.key === "Escape") onClose(); }}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Description</label>
            <textarea
              placeholder="Optional details, context, or acceptance criteria…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(
                "w-full resize-none rounded-xl border-0 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 ring-1 ring-line",
                "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-500)/0.45)]",
                "dark:bg-slate-900 dark:text-slate-100 dark:ring-slate-700"
              )}
            />
          </div>

          {/* Assignee + Status row */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Assignee", value: assignee, onChange: setAssignee, options: [{ value: "", label: "Unassigned" }, ...team.map(m => ({ value: m.agent?.name ?? m.agentId, label: m.agent?.name ?? m.agentId }))] },
              { label: "Column",   value: status,   onChange: (v: string) => setStatus(v as TaskStatus), options: TASK_COLUMNS.map(c => ({ value: c.id, label: c.label })) },
            ].map(({ label, value, onChange, options }) => (
              <div key={label} className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{label}</label>
                <select value={value} onChange={(e) => onChange(e.target.value)}
                  className="w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-500)/0.45)] dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700">
                  {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>

          {/* Type + SP row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value)}
                className="w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--accent-500)/0.45)] dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700">
                {TASK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Story Points</label>
              <Input type="number" min={0} max={100} value={estimatedSp}
                onChange={(e) => setEstimatedSp(Number(e.target.value))}
                placeholder="0" />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-line px-5 py-4 dark:border-slate-800">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={!title.trim() || saving}>
            {saving ? "Creating…" : "Create task"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────
function TaskCard({
  task,
  acting,
  onMove,
  onDelete,
  onDragStart,
}: {
  task: Task;
  acting: boolean;
  onMove: (status: TaskStatus) => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const nextActions: { label: string; status: TaskStatus; style: string }[] = [];

  // Monday.com-style transitions
  if (task.status === "proposed") {
    nextActions.push(
      { label: "→ To Do",      status: "approved",    style: "bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/30" },
      { label: "✓ Done",       status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
    );
  } else if (task.status === "approved") {
    nextActions.push(
      { label: "▶ Start",      status: "in-progress", style: "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/30" },
      { label: "✓ Done",       status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
    );
  } else if (task.status === "in-progress") {
    nextActions.push(
      { label: "⬆ Review",     status: "review",      style: "bg-sky-50 text-sky-700 ring-sky-200 hover:bg-sky-100 dark:bg-sky-500/10 dark:text-sky-400 dark:ring-sky-500/30" },
      { label: "✓ Done",       status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
    );
  } else if (task.status === "review") {
    nextActions.push(
      { label: "✓ Approve",    status: "done",        style: "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30" },
      { label: "↩ Rework",     status: "in-progress", style: "bg-brand-50 text-brand-700 ring-brand-200 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400 dark:ring-brand-500/30" },
    );
  } else if (task.status === "done") {
    nextActions.push(
      { label: "↩ Reopen",     status: "proposed",    style: "bg-zinc-50 text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700" },
    );
  }

  const canDelete = true;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={cn(
        "group rounded-xl bg-white p-3 ring-1 ring-zinc-200 shadow-softSm",
        "dark:bg-[#16132A] dark:ring-[#2D2A45]",
        "cursor-grab active:cursor-grabbing active:shadow-soft active:scale-[0.98] transition-all",
        acting && "opacity-60 pointer-events-none"
      )}
    >
      {/* Drag handle + title */}
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-700 group-hover:text-zinc-400" />
        <div className="min-w-0 flex-1">
          <div className="font-display text-sm font-semibold text-zinc-900 dark:text-white">{task.title}</div>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-snug text-zinc-500 dark:text-zinc-400">
              {task.description}
            </p>
          )}
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        {task.proposer && <span>by {task.proposer}</span>}
        {task.assignee && (
          <>
            <span>·</span>
            <span className="rounded-full bg-brand-100 px-2 py-0.5 font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {task.assignee}
            </span>
          </>
        )}
      </div>

      {/* Action buttons */}
      {(nextActions.length > 0 || canDelete) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {nextActions.map((a) => (
            <button
              key={a.status}
              disabled={acting}
              onClick={() => onMove(a.status)}
              className={cn(
                "flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 transition",
                a.style,
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {a.label}
            </button>
          ))}
          <button
            disabled={acting}
            onClick={onDelete}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-xs font-semibold ring-1 transition",
              "bg-red-50 text-red-600 ring-red-200 hover:bg-red-100",
              "dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/20",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            )}
          >
            {task.status === "proposed" ? "✕ Reject" : "✕ Remove"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Task Board Tab ─────────────────────────────────────────────────────────
type BoardView = "table" | "kanban";

function SprintBoardTab({ projectId }: { projectId: string }) {
  const [tasks,    setTasks]    = React.useState<Task[]>([]);
  const [team,     setTeam]     = React.useState<TeamMemberWithAgent[]>([]);
  const [acting,   setActing]   = React.useState<string | null>(null);
  const [dragOver, setDragOver] = React.useState<TaskStatus | null>(null);
  const [createIn, setCreateIn] = React.useState<TaskStatus | null>(null);
  const [boardView, setBoardView] = React.useState<BoardView>("table");

  // Track IDs we've deleted so WS task:created can't re-add them
  const recentlyDeleted = React.useRef(new Set<string>());

  // Initial load
  React.useEffect(() => {
    fetchTasks(projectId).then(setTasks);
    fetchTeam(projectId).then(setTeam);
  }, [projectId]);

  // WebSocket — real-time updates
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}/api/backend/ws`;
    let ws: WebSocket;
    let retryTimeout: ReturnType<typeof setTimeout>;

    function connect() {
      ws = new WebSocket(url);

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as { type: string; data: unknown };

          if (msg.type === "task:created") {
            const task = (msg.data as { task: Task }).task;
            const pid = taskProjectId(task);
            const tid = taskId(task);
            if (!pid || pid === projectId) {
              // Don't re-add tasks we've explicitly deleted
              if (!recentlyDeleted.current.has(tid)) {
                setTasks((prev) => prev.some((t) => taskId(t) === tid) ? prev : [...prev, task]);
              }
            }
          } else if (msg.type === "task:updated") {
            const task = (msg.data as { task: Task }).task;
            setTasks((prev) => prev.map((t) => taskId(t) === taskId(task) ? { ...t, ...task } : t));
          } else if (msg.type === "task:deleted") {
            const tid = (msg.data as { taskId: string }).taskId;
            setTasks((prev) => prev.filter((t) => taskId(t) !== tid));
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        // Reconnect after 3s
        retryTimeout = setTimeout(connect, 3000);
      };
    }

    connect();
    return () => {
      clearTimeout(retryTimeout);
      ws?.close();
    };
  }, [projectId]);

  // Actions
  async function moveTask(id: string, status: TaskStatus) {
    setActing(id);
    const updated = await updateTask(projectId, id, { status });
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: updated?.status ?? status } : t));
    setActing(null);
  }

  async function removeTask(id: string) {
    setActing(id);
    recentlyDeleted.current.add(id);
    const ok = await deleteTask(projectId, id);
    if (ok) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } else {
      // API failed — restore task visibility
      recentlyDeleted.current.delete(id);
    }
    setActing(null);
  }

  async function handleCreate(payload: { title: string; description: string; assignee: string; status: TaskStatus; type: string; estimated_sp: number }) {
    const created = await createTask(projectId, { ...payload, proposer: "Mithran ⚡" });
    if (created) setTasks((prev) => [...prev, created]);
    setCreateIn(null);
  }

  // Drag and drop
  function onDragStart(e: React.DragEvent, taskId: string) {
    e.dataTransfer.setData("taskId", taskId);
    e.dataTransfer.effectAllowed = "move";
  }

  function onDragOver(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(status);
  }

  async function onDrop(e: React.DragEvent, status: TaskStatus) {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("taskId");
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    await moveTask(id, status);
  }

  return (
    <>
      {/* ── View toggle (Main table / Kanban) ── */}
      <div className="mb-4 flex items-center gap-1 border-b border-zinc-200 dark:border-[#2D2A45]">
        {([["table", "Main table", LayoutList], ["kanban", "Kanban", Kanban]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setBoardView(id)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors -mb-px",
              boardView === id
                ? "border-brand-600 text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <button className="ml-1 px-2 py-2.5 text-zinc-400 hover:text-zinc-600 -mb-px border-b-2 border-transparent">
          <Plus className="h-4 w-4" />
        </button>
        <div className="ml-auto flex items-center gap-2 pb-2">
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
            <Search className="h-3.5 w-3.5" /> Search
          </button>
          <button className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
            <MoreHorizontal className="h-3.5 w-3.5" /> Filter
          </button>
          <Button variant="primary" size="sm" onClick={() => setCreateIn("proposed")}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> New task
          </Button>
        </div>
      </div>

      {/* ── Main Table view ── */}
      {boardView === "table" && (
        <MainTableView
          tasks={tasks.filter((t) => !recentlyDeleted.current.has(t.id))}
          acting={acting}
          onMove={(id, s) => moveTask(id, s)}
          onDelete={(id) => removeTask(id)}
          onAddTask={(status) => setCreateIn(status)}
        />
      )}

      {/* ── Kanban view ── */}
      {boardView === "kanban" && <div className="overflow-x-auto pb-2">
        <div className="flex gap-3" style={{ minWidth: `${TASK_COLUMNS.length * 256}px` }}>
          {TASK_COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.id && !recentlyDeleted.current.has(t.id));
            const isOver   = dragOver === col.id;

            return (
              <div
                key={col.id}
                className={cn(
                  "flex flex-1 flex-col gap-3 rounded-2xl p-4 transition-colors",
                  "bg-zinc-50 ring-1 ring-zinc-200",
                  "dark:bg-[#0F0D1E] dark:ring-[#2D2A45]",
                  isOver && "bg-brand-50 ring-brand-300 dark:bg-brand-950/40 dark:ring-brand-500/30"
                )}
                style={{ minWidth: 232 }}
                onDragOver={(e) => onDragOver(e, col.id)}
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onDrop(e, col.id)}
              >
                {/* Column header — Monday-style top border strip + dot */}
                <div className={cn("flex items-center gap-2 border-t-[3px] pt-3", col.color)}>
                  <div className={cn("h-2 w-2 shrink-0 rounded-full", col.dot)} />
                  <span className="font-display flex-1 text-xs font-bold text-zinc-700 dark:text-zinc-200 uppercase tracking-wide">
                    {col.label}
                  </span>
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-200 px-1.5 text-[11px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards */}
                <div className="flex flex-col gap-2">
                  {colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      acting={acting === task.id}
                      onMove={(status) => moveTask(task.id, status)}
                      onDelete={() => removeTask(task.id)}
                      onDragStart={(e) => onDragStart(e, task.id)}
                    />
                  ))}
                </div>

                {/* Add task button */}
                <button
                  onClick={() => setCreateIn(col.id)}
                  className={cn(
                    "mt-auto flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-zinc-500 transition",
                    "hover:bg-white hover:text-zinc-700 hover:ring-1 hover:ring-zinc-200",
                    "dark:hover:bg-white/5 dark:hover:text-zinc-200",
                    "focus:outline-none"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" /> Add task
                </button>
              </div>
            );
          })}
        </div>
      </div>}

      {/* Create task modal */}
      {createIn && (
        <CreateTaskModal
          defaultStatus={createIn}
          team={team}
          onSave={handleCreate}
          onClose={() => setCreateIn(null)}
        />
      )}
    </>
  );
}

// ─── Agent Registry Panel ─────────────────────────────────────────────────────
function AgentRegistryPanel({ agents, onAdd, onClose, alreadyAdded }: {
  agents: Agent[];
  onAdd: (agent: Agent) => void;
  onClose: () => void;
  alreadyAdded: string[];
}) {
  const [search, setSearch] = React.useState("");
  const filtered = agents.filter(
    (a) => a.name.toLowerCase().includes(search.toLowerCase()) || a.desc.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-start">
      <button className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col bg-white shadow-soft ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800 sm:rounded-l-2xl">
        <div className="flex items-center justify-between border-b border-line p-5 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent Registry</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Add agents to this project</div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl ring-1 ring-line text-slate-500 hover:bg-slate-50 dark:ring-slate-800 dark:hover:bg-slate-900/40">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="border-b border-line p-4 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input autoFocus placeholder="Search agents…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            {filtered.map((agent) => {
              const added = alreadyAdded.includes(agent.id);
              return (
                <div key={agent.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-700">
                    <span className="text-xs font-semibold">{agent.name[0]}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{agent.name}</span>
                      <Badge tone={statusTone(agent.status)}>{agent.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{agent.desc}</p>
                  </div>
                  <Button size="sm" variant={added ? "ghost" : "secondary"} disabled={added} onClick={() => !added && onAdd(agent)}>
                    {added ? "Added" : "Add"}
                  </Button>
                </div>
              );
            })}
            {filtered.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No agents found.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────
function TeamTab({ projectId }: { projectId: string }) {
  const [team,         setTeam]         = React.useState<TeamMemberWithAgent[]>([]);
  const [allAgents,    setAllAgents]    = React.useState<Agent[]>([]);
  const [showRegistry, setShowRegistry] = React.useState(false);

  React.useEffect(() => {
    fetchTeam(projectId).then(setTeam);
    fetchAgents().then(setAllAgents);
  }, [projectId]);

  const addedIds = team.map((m) => m.agentId);

  async function handleAdd(agent: Agent) {
    if (addedIds.includes(agent.id)) return;
    await addTeamMember(projectId, agent.id, "Member");
    setTeam((prev) => [...prev, { agentId: agent.id, role: "Member", joinedAt: new Date().toISOString().slice(0, 10), agent }]);
  }

  async function handleRemove(agentId: string) {
    await removeTeamMember(projectId, agentId);
    setTeam((prev) => prev.filter((m) => m.agentId !== agentId));
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Team</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">{team.length} agent{team.length !== 1 ? "s" : ""} on this project</p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowRegistry(true)}>
            <UserPlus className="h-4 w-4" /> Add Agent
          </Button>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No agents yet</p>
                <p className="text-xs text-slate-500">Add an agent from the registry to get started.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowRegistry(true)}>Add Agent</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {team.map((m) => (
                <div key={m.agentId} className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-700">
                    <span className="text-xs font-semibold">{(m.agent?.name ?? m.agentId)[0].toUpperCase()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{m.agent?.name ?? m.agentId}</span>
                      <Badge tone={statusTone(m.agent?.status ?? "offline")}>{m.agent?.status ?? "unknown"}</Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{m.role}</span>
                      {m.agent?.desc && <><span>·</span><span>{m.agent.desc}</span></>}
                      <span>· Joined {m.joinedAt}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary">Inspect</Button>
                    <Button size="sm" variant="ghost">Ping</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(m.agentId)}>Remove</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      {showRegistry && (
        <AgentRegistryPanel agents={allAgents} onAdd={handleAdd} onClose={() => setShowRegistry(false)} alreadyAdded={addedIds} />
      )}
    </>
  );
}

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "architecture",  label: "Architecture",           icon: BookOpen  },
  { id: "tech-spec",     label: "Technical Specification", icon: FileCode2 },
  { id: "sprint-board",  label: "Task Board",            icon: Kanban    },
  { id: "team",          label: "Team",                   icon: Users     },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params    = React.use(props.params);
  const [project, setProject]   = React.useState(PROJECTS.find((p) => p.id === params.id));
  const [loading, setLoading]   = React.useState(!project);
  const [activeTab, setActiveTab] = React.useState<Tab>("sprint-board");

  React.useEffect(() => {
    setLoading(true);
    fetchProject(params.id).then((p) => { if (p) setProject(p); setLoading(false); });
  }, [params.id]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="text-sm text-slate-500">Loading project…</div></div>;

  if (!project) return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Project not found</p>
      <Link href="/dashboard"><Button variant="secondary">Back to Dashboard</Button></Link>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/dashboard" className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-line text-slate-500 hover:bg-slate-50 hover:text-slate-700 dark:ring-slate-800 dark:hover:bg-slate-900/40 dark:text-slate-300")}>
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{project.name}</h1>
            <Badge tone={project.status === "active" ? "brand" : project.status === "review" ? "warning" : "neutral"}>{project.status}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{project.description}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-1.5 ring-1 ring-line dark:bg-slate-900/40 dark:ring-slate-800" role="tablist">
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon   = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
                active
                  ? "bg-white text-slate-900 shadow-softSm ring-1 ring-line dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800"
                  : "text-slate-500 hover:bg-white/70 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-950/40"
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === "architecture"  && <ArchitectureTab  projectId={project.slug ?? project.id} />}
        {activeTab === "tech-spec"     && <TechSpecTab      projectId={project.slug ?? project.id} />}
        {activeTab === "sprint-board"  && <SprintBoardTab   projectId={project.id} />}
        {activeTab === "team"          && <TeamTab          projectId={project.id} />}
      </div>
    </div>
  );
}
