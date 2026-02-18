"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Plus, Circle, CheckCircle2, Clock, Lightbulb, XCircle } from "lucide-react";
import {
  fetchProject, fetchAgents, fetchProjectTasks,
  createTask, approveTask, rejectTask,
  type ApiProject, type ApiAgent, type ApiTask,
} from "@/lib/api";

// ── Helpers ──────────────────────────────────────────────────────────────────

function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const colors: Record<string, string> = {
    Mithran: "bg-violet-600", Komal: "bg-rose-500",
    Anantha: "bg-amber-600", Vishwakarma: "bg-sky-600",
    Ganesha: "bg-teal-600", Drishti: "bg-purple-600",
    Lekha: "bg-pink-600", Sanjaya: "bg-orange-500", Suraksha: "bg-red-600",
  };
  const sz = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";
  const bg = colors[name] ?? "bg-slate-500";
  return (
    <div className={`${sz} ${bg} shrink-0 rounded-full flex items-center justify-center text-white font-semibold`}>
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

type TabId = "sprint" | "team" | "assignments";

const TABS: { id: TabId; label: string }[] = [
  { id: "sprint",      label: "Sprint Board" },
  { id: "team",        label: "Team" },
  { id: "assignments", label: "Task Assignments" },
];

const STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  proposed:   { label: "Proposed",    color: "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30",   icon: <Lightbulb className="h-3.5 w-3.5 text-amber-500" /> },
  approved:   { label: "Approved",    color: "bg-blue-50 ring-blue-200 dark:bg-blue-500/10 dark:ring-blue-500/30",       icon: <CheckCircle2 className="h-3.5 w-3.5 text-blue-500" /> },
  in_progress:{ label: "In Progress", color: "bg-violet-50 ring-violet-200 dark:bg-violet-500/10 dark:ring-violet-500/30", icon: <Clock className="h-3.5 w-3.5 text-violet-500" /> },
  done:       { label: "Done",        color: "bg-emerald-50 ring-emerald-200 dark:bg-emerald-500/10 dark:ring-emerald-500/30", icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> },
  rejected:   { label: "Rejected",    color: "bg-red-50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30",           icon: <XCircle className="h-3.5 w-3.5 text-red-500" /> },
};

// ── Sprint Board ─────────────────────────────────────────────────────────────

function SprintBoard({ projectId, tasks, onRefresh }: { projectId: string; tasks: ApiTask[]; onRefresh: () => void }) {
  const [title, setTitle] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);

  const columns: { status: ApiTask["status"]; label: string }[] = [
    { status: "proposed",    label: "Proposed" },
    { status: "approved",    label: "Approved" },
    { status: "in_progress", label: "In Progress" },
    { status: "done",        label: "Done" },
  ];

  async function handleCreate() {
    if (!title.trim()) return;
    setBusy("create");
    try {
      await createTask(title.trim(), desc.trim(), projectId);
      setTitle(""); setDesc(""); setAdding(false);
      onRefresh();
    } finally { setBusy(null); }
  }

  async function handleApprove(taskId: string) {
    setBusy(taskId);
    try { await approveTask(taskId); onRefresh(); } finally { setBusy(null); }
  }

  async function handleReject(taskId: string) {
    setBusy(taskId);
    try { await rejectTask(taskId); onRefresh(); } finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add task */}
      {adding ? (
        <div className="rounded-2xl bg-white dark:bg-slate-950 ring-1 ring-brand-200 dark:ring-brand-500/30 p-4 flex flex-col gap-3">
          <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">New Task</div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title…"
            className="rounded-xl bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm ring-1 ring-line dark:ring-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <textarea
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (optional)…"
            rows={2}
            className="rounded-xl bg-slate-50 dark:bg-slate-900 px-4 py-2.5 text-sm ring-1 ring-line dark:ring-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
          />
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={!title.trim() || busy === "create"}
              className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition">
              {busy === "create" ? "Adding…" : "Add Task"}
            </button>
            <button onClick={() => { setAdding(false); setTitle(""); setDesc(""); }}
              className="rounded-xl px-4 py-2 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-2 self-start rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition">
          <Plus className="h-4 w-4" /> Add Task
        </button>
      )}

      {/* Columns */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);
          const meta = STATUS_META[col.status];
          return (
            <div key={col.status} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                  {meta.icon}
                  {col.label}
                </div>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-[11px] text-slate-500">
                  {colTasks.length}
                </span>
              </div>

              <div className="flex flex-col gap-2 min-h-[120px]">
                {colTasks.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-4 text-center text-xs text-slate-400">
                    Empty
                  </div>
                )}
                {colTasks.map((t) => (
                  <div key={t.id} className={`rounded-xl p-3.5 ring-1 ${meta.color} flex flex-col gap-2`}>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t.title}</div>
                    {t.description && (
                      <div className="text-xs text-muted line-clamp-2">{t.description}</div>
                    )}
                    <div className="text-[11px] text-slate-500">
                      By: {t.proposed_by_agent_name ?? t.proposed_by_user_id ?? "—"}
                    </div>
                    {t.claimed_by_agent_name && (
                      <div className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                        → {t.claimed_by_agent_name}
                      </div>
                    )}
                    {/* Actions for proposed tasks */}
                    {t.status === "proposed" && (
                      <div className="flex gap-1.5 mt-1">
                        <button onClick={() => handleApprove(t.id)} disabled={!!busy}
                          className="flex-1 rounded-lg bg-emerald-500 py-1 text-[11px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40 transition">
                          {busy === t.id ? "…" : "Approve"}
                        </button>
                        <button onClick={() => handleReject(t.id)} disabled={!!busy}
                          className="flex-1 rounded-lg bg-red-100 dark:bg-red-500/20 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-200 disabled:opacity-40 transition">
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Team tab ─────────────────────────────────────────────────────────────────

function TeamTab({ members, allAgents }: { members: ApiAgent[]; allAgents: ApiAgent[] }) {
  const memberIds = new Set(members.map((m) => m.id));
  const nonMembers = allAgents.filter((a) => !memberIds.has(a.id));

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          Active on this project ({members.length})
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {members.map((a) => (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-white dark:bg-slate-950 ring-1 ring-line dark:ring-slate-800 p-4">
              <Avatar name={a.name} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{a.name}</div>
                <div className="text-xs text-muted truncate">{(a as any).capabilities?.role ?? "Agent"}</div>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Circle className={`h-2 w-2 fill-current ${a.status === "online" ? "text-emerald-500" : "text-slate-300"}`} />
                <span className={a.status === "online" ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}>
                  {a.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {nonMembers.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400 mb-3">
            Not yet on this project
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {nonMembers.map((a) => (
              <div key={a.id} className="flex items-center gap-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 ring-1 ring-line dark:ring-slate-800 p-3 opacity-60">
                <Avatar name={a.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{a.name}</div>
                  <div className="text-xs text-muted">{(a as any).capabilities?.role ?? "Agent"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Task Assignments tab ──────────────────────────────────────────────────────

function AssignmentsTab({ tasks }: { tasks: ApiTask[] }) {
  const inProgress = tasks.filter((t) => t.status === "in_progress");
  const approved = tasks.filter((t) => t.status === "approved");

  return (
    <div className="flex flex-col gap-6">
      {/* Active work */}
      <div>
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          Currently in progress ({inProgress.length})
        </div>
        {inProgress.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-400">
            No tasks in progress
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {inProgress.map((t) => (
              <div key={t.id} className="flex items-center gap-4 rounded-2xl bg-white dark:bg-slate-950 ring-1 ring-violet-200 dark:ring-violet-500/30 p-4">
                <Avatar name={t.claimed_by_agent_name ?? "?"} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{t.title}</div>
                  <div className="text-xs text-muted mt-0.5">
                    Claimed by <span className="font-medium text-violet-600 dark:text-violet-400">{t.claimed_by_agent_name ?? "unknown"}</span>
                  </div>
                </div>
                <div className="shrink-0 rounded-full bg-violet-100 dark:bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-700 dark:text-violet-300">
                  In Progress
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available to claim */}
      <div>
        <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          Available to pick up ({approved.length})
        </div>
        {approved.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-6 text-center text-sm text-slate-400">
            No approved tasks waiting
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {approved.map((t) => (
              <div key={t.id} className="flex items-center gap-4 rounded-2xl bg-white dark:bg-slate-950 ring-1 ring-blue-200 dark:ring-blue-500/30 p-4">
                <div className="grid h-9 w-9 place-items-center rounded-full bg-blue-100 dark:bg-blue-500/20">
                  <CheckCircle2 className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{t.title}</div>
                  {t.description && <div className="text-xs text-muted mt-0.5 truncate">{t.description}</div>}
                </div>
                <div className="shrink-0 rounded-full bg-blue-100 dark:bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300">
                  Ready
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = React.useState<TabId>("sprint");
  const [project, setProject] = React.useState<ApiProject | null>(null);
  const [members, setMembers] = React.useState<ApiAgent[]>([]);
  const [allAgents, setAllAgents] = React.useState<ApiAgent[]>([]);
  const [tasks, setTasks] = React.useState<ApiTask[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const [pRes, aRes, tRes] = await Promise.all([
        fetchProject(id),
        fetchAgents(),
        fetchProjectTasks(id),
      ]);
      setProject(pRes.project);
      setMembers(pRes.members);
      setAllAgents(aRes.agents);
      setTasks(tRes.tasks);
    } finally {
      setLoading(false);
    }
  }, [id]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (!project) {
    return <div className="flex h-64 items-center justify-center text-sm text-red-500">Project not found.</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/projects")}
          className="flex items-center gap-1 text-xs text-muted hover:text-slate-700 dark:hover:text-slate-200 transition"
        >
          <ChevronLeft className="h-4 w-4" /> Projects
        </button>
        <div className="h-4 w-px bg-line dark:bg-slate-700" />
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{project.name}</h1>
          {project.description && <p className="text-xs text-muted">{project.description}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl bg-slate-100 dark:bg-slate-900 p-1 w-fit">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 shadow-softSm ring-1 ring-line dark:ring-slate-800"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "sprint" && (
        <SprintBoard projectId={id} tasks={tasks} onRefresh={load} />
      )}
      {tab === "team" && (
        <TeamTab members={members} allAgents={allAgents} />
      )}
      {tab === "assignments" && (
        <AssignmentsTab tasks={tasks} />
      )}
    </div>
  );
}
