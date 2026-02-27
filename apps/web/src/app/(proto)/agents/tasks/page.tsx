"use client";

import * as React from "react";
import { ClipboardList, Circle } from "lucide-react";
import { fetchAgents, fetchProjects, fetchTasks } from "@/lib/api";
import { cn } from "@/lib/cn";
import type { Agent } from "@/lib/agents";
import type { Task } from "@/lib/projects";

type AgentTask = Task & { projectName: string; projectSlug: string };

const STATUS_META: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  proposed:      { label: "Backlog",     dot: "bg-zinc-400",    bg: "bg-zinc-100",    text: "text-zinc-600"    },
  approved:      { label: "To Do",       dot: "bg-amber-400",   bg: "bg-amber-100",   text: "text-amber-700"   },
  "in-progress": { label: "In Progress", dot: "bg-violet-500",  bg: "bg-violet-100",  text: "text-violet-700"  },
  review:        { label: "Review",      dot: "bg-sky-400",     bg: "bg-sky-100",     text: "text-sky-700"     },
  done:          { label: "Done",        dot: "bg-emerald-500", bg: "bg-emerald-100", text: "text-emerald-700" },
};

const PRIORITY_META: Record<string, { dot: string; text: string }> = {
  urgent: { dot: "bg-red-500",    text: "text-red-600"    },
  high:   { dot: "bg-orange-500", text: "text-orange-600" },
  medium: { dot: "bg-amber-400",  text: "text-amber-600"  },
  low:    { dot: "bg-zinc-400",   text: "text-zinc-500"   },
};

export default function AgentTasksPage() {
  const [tasks,   setTasks]   = React.useState<AgentTask[]>([]);
  const [agents,  setAgents]  = React.useState<Agent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [filter,  setFilter]  = React.useState<string>("all"); // agent name or "all"
  const [statusF, setStatusF] = React.useState<string>("open"); // "open" | "all" | status

  React.useEffect(() => {
    async function load() {
      const [ags, projects] = await Promise.all([fetchAgents(), fetchProjects()]);
      setAgents(ags as Agent[]);

      const allTasks: AgentTask[] = [];
      await Promise.all(
        projects.map(async (p) => {
          const ts = await fetchTasks(p.id);
          ts.forEach((t) => {
            if (t.assignee) {
              allTasks.push({ ...t, projectName: p.name, projectSlug: (p as unknown as { slug?: string }).slug ?? p.id });
            }
          });
        })
      );

      // Sort: open first, then by project
      allTasks.sort((a, b) => {
        const order = ["in-progress", "review", "approved", "proposed", "done"];
        return order.indexOf(a.status) - order.indexOf(b.status);
      });
      setTasks(allTasks);
      setLoading(false);
    }
    load();
  }, []);

  const agentNames = Array.from(new Set(tasks.map((t) => t.assignee).filter(Boolean))) as string[];

  const visible = tasks.filter((t) => {
    const agentOk = filter === "all" || t.assignee === filter;
    const statusOk =
      statusF === "all"  ? true :
      statusF === "open" ? t.status !== "done" :
      t.status === statusF;
    return agentOk && statusOk;
  });

  const openCount = tasks.filter((t) => t.status !== "done").length;
  const doneCount = tasks.filter((t) => t.status === "done").length;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-violet-100 dark:bg-violet-500/10">
          <ClipboardList className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Agent Tasks</h1>
          <p className="mt-0.5 text-xs text-zinc-500">All tasks assigned across agents and projects</p>
        </div>
        {/* Summary pills */}
        {!loading && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
              {openCount} open
            </span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              {doneCount} done
            </span>
          </div>
        )}
      </header>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Agent filter */}
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="rounded-lg border-0 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 focus:outline-none focus:ring-brand-400 dark:bg-[#16132A] dark:text-zinc-300 dark:ring-[#2D2A45]"
        >
          <option value="all">All agents</option>
          {agentNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        {/* Status filter */}
        {(["open", "all", "in-progress", "review", "approved", "proposed", "done"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusF(s)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
              statusF === s
                ? "bg-violet-600 text-white"
                : "bg-white text-zinc-500 ring-1 ring-zinc-200 hover:text-zinc-700 dark:bg-[#16132A] dark:ring-[#2D2A45] dark:hover:text-zinc-300"
            )}
          >
            {s === "open" ? "Open" : s === "all" ? "All" : STATUS_META[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
        {/* Header row */}
        <div className="hidden md:flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
          <div className="flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Task</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Agent</div>
          <div className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Project</div>
          <div className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Status</div>
          <div className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Priority</div>
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[1,2,3,4].map(i => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <ClipboardList className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-500">No tasks match this filter</p>
          </div>
        ) : (
          visible.map((task) => {
            const sm = STATUS_META[task.status] ?? STATUS_META.proposed;
            const pm = PRIORITY_META[task.priority ?? "medium"] ?? PRIORITY_META.medium;
            return (
              <div key={task.id} className="group border-b border-zinc-100 last:border-0 dark:border-[#2D2A45]">
                {/* Mobile */}
                <div className="flex md:hidden flex-col gap-1 px-4 py-3">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white truncate">{task.title}</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", sm.bg, sm.text)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />{sm.label}
                    </span>
                    <span className="text-xs text-zinc-500">{task.assignee}</span>
                    <span className="text-xs text-zinc-400">· {task.projectName}</span>
                  </div>
                </div>
                {/* Desktop */}
                <div className="hidden md:flex items-center px-4 py-2.5 hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                  <div className="flex-1 min-w-0 pr-3">
                    <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{task.title}</p>
                  </div>
                  <div className="w-28 shrink-0 flex items-center gap-2">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-600 text-[10px] font-bold text-white">
                      {(task.assignee ?? "?")[0].toUpperCase()}
                    </div>
                    <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">{task.assignee}</span>
                  </div>
                  <div className="w-32 shrink-0 truncate text-xs text-zinc-500 dark:text-zinc-400">{task.projectName}</div>
                  <div className="w-32 shrink-0">
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold", sm.bg, sm.text)}>
                      <span className={cn("h-1.5 w-1.5 rounded-full", sm.dot)} />{sm.label}
                    </span>
                  </div>
                  <div className="w-24 shrink-0 flex items-center gap-1.5">
                    <Circle className={cn("h-2 w-2 fill-current", pm.text)} />
                    <span className={cn("text-xs font-medium capitalize", pm.text)}>{task.priority ?? "medium"}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
