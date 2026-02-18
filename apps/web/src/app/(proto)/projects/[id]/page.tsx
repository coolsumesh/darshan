"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BookOpen,
  FileCode2,
  Kanban,
  Users,
  X,
  Search,
  Plus,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import {
  PROJECTS,
  type Task,
  type TaskStatus,
} from "@/lib/projects";
import { type Agent } from "@/lib/agents";
import { fetchProject, fetchTasks, fetchTeam, fetchAgents, createTask, addTeamMember, removeTeamMember, type TeamMemberWithAgent } from "@/lib/api";

// ─── Types ───────────────────────────────────────────────────────────────────
type Tab = "architecture" | "tech-spec" | "sprint-board" | "team";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusTone(status: string): "brand" | "warning" | "success" | "neutral" {
  if (status === "active") return "brand";
  if (status === "review") return "warning";
  if (status === "online") return "success";
  if (status === "away") return "warning";
  return "neutral";
}

const TASK_COLUMNS: { id: TaskStatus; label: string }[] = [
  { id: "proposed", label: "Proposed" },
  { id: "approved", label: "Approved" },
  { id: "in-progress", label: "In Progress" },
  { id: "done", label: "Done" },
];

// ─── Architecture Tab ─────────────────────────────────────────────────────────
function ArchitectureTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>System Overview</CardTitle>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Darshan Hub is a multi-agent project management platform built by MithranLabs. It enables teams of AI agents and human operators to coordinate work through structured projects, sprint boards, and real-time feedback.
          </p>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { name: "Web App", desc: "Next.js 14 + TypeScript + Tailwind — project dashboards, sprint boards, team management.", tag: "Frontend" },
              { name: "API Server", desc: "REST API at /api/v1 — handles projects, tasks, agents, and team membership.", tag: "Backend" },
              { name: "Agent Registry", desc: "Global registry of all available agents. Accessed inline via the Team tab per project.", tag: "Service" },
              { name: "Database", desc: "Persistent store for projects, tasks, sprint data, and team rosters.", tag: "Infra" },
            ].map((c) => (
              <div
                key={c.name}
                className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{c.name}</span>
                  <Badge tone="neutral">{c.tag}</Badge>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{c.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-3">
            {[
              "User opens Dashboard → fetches all projects from GET /api/v1/projects.",
              "Clicking a project navigates to /projects/:id → loads project detail, tasks, and team in parallel.",
              "Sprint Board reads tasks via GET /api/v1/projects/:id/tasks, grouped by status column.",
              "Team tab reads roster via GET /api/v1/projects/:id/team. Add Agent uses GET /api/v1/agents (registry) and POST /api/v1/projects/:id/team.",
              "All mutations trigger a local state refresh to keep UI consistent without full page reload.",
            ].map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-slate-700 dark:text-slate-300">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[rgb(var(--accent-600))] text-xs font-semibold text-white">
                  {i + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tech Spec Tab ────────────────────────────────────────────────────────────
function TechSpecTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Stack</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              { key: "Framework", val: "Next.js 14 (App Router)" },
              { key: "Language", val: "TypeScript" },
              { key: "Styling", val: "Tailwind CSS" },
              { key: "Package manager", val: "pnpm (monorepo)" },
              { key: "Deployment", val: "darshan.caringgems.in" },
              { key: "Repo", val: "github.com/coolsumesh/darshan" },
            ].map(({ key, val }) => (
              <div
                key={key}
                className="flex items-start justify-between gap-2 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
              >
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{key}</span>
                <span className="text-right text-xs font-medium text-slate-900 dark:text-slate-100">{val}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Endpoints</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2">
            {[
              { method: "GET", path: "/api/v1/projects", desc: "List all projects" },
              { method: "GET", path: "/api/v1/projects/:id/architecture", desc: "Project architecture doc" },
              { method: "GET", path: "/api/v1/projects/:id/tech-spec", desc: "Project tech spec" },
              { method: "GET", path: "/api/v1/projects/:id/tasks", desc: "Tasks for project" },
              { method: "POST", path: "/api/v1/projects/:id/tasks", desc: "Create new task" },
              { method: "PATCH", path: "/api/v1/projects/:id/tasks/:taskId", desc: "Update task status" },
              { method: "GET", path: "/api/v1/projects/:id/team", desc: "Team roster for project" },
              { method: "POST", path: "/api/v1/projects/:id/team", desc: "Add agent to project" },
              { method: "GET", path: "/api/v1/agents", desc: "Global agent registry" },
            ].map(({ method, path, desc }) => (
              <div
                key={path}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
              >
                <span
                  className={cn(
                    "shrink-0 rounded-lg px-2 py-0.5 text-xs font-bold",
                    method === "GET"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                      : method === "POST"
                        ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-200"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
                  )}
                >
                  {method}
                </span>
                <code className="min-w-0 flex-1 truncate text-xs font-mono text-slate-800 dark:text-slate-200">
                  {path}
                </code>
                <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sprint Board Tab ─────────────────────────────────────────────────────────
function SprintBoardTab({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [addingIn, setAddingIn] = React.useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = React.useState("");

  React.useEffect(() => {
    fetchTasks(projectId).then(setTasks);
  }, [projectId]);

  async function addTask(status: TaskStatus) {
    if (!newTitle.trim()) return;
    const payload = { title: newTitle.trim(), status, proposer: "You" };
    const created = await createTask(projectId, payload);
    const task: Task = created ?? { id: `t-${Date.now()}`, projectId, title: newTitle.trim(), status, proposer: "You" };
    setTasks((prev) => [...prev, task]);
    setNewTitle("");
    setAddingIn(null);
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-4" style={{ minWidth: `${TASK_COLUMNS.length * 260}px` }}>
        {TASK_COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);
          return (
            <div
              key={col.id}
              className="flex flex-1 flex-col gap-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
              style={{ minWidth: 240 }}
            >
              {/* Column header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{col.label}</span>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-slate-200 px-1.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {colTasks.length}
                </span>
              </div>

              {/* Task cards */}
              <div className="flex flex-col gap-2">
                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-xl bg-white p-3 ring-1 ring-line shadow-softSm dark:bg-slate-950 dark:ring-slate-800"
                  >
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{task.title}</div>
                    {task.description && (
                      <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">
                        {task.description}
                      </p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {task.proposer && <span>by {task.proposer}</span>}
                      {task.assignee && (
                        <>
                          <span>·</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {task.assignee}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add task */}
              {addingIn === col.id ? (
                <div className="flex flex-col gap-2 rounded-xl bg-white p-3 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
                  <Input
                    autoFocus
                    placeholder="Task title…"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addTask(col.id);
                      if (e.key === "Escape") { setAddingIn(null); setNewTitle(""); }
                    }}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => addTask(col.id)}>Add</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingIn(null); setNewTitle(""); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAddingIn(col.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-slate-500",
                    "hover:bg-white hover:text-slate-700 hover:ring-1 hover:ring-line",
                    "dark:hover:bg-slate-950 dark:hover:text-slate-200 dark:hover:ring-slate-800",
                    "transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]"
                  )}
                >
                  <Plus className="h-3.5 w-3.5" /> Add task
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Agent Registry Panel ─────────────────────────────────────────────────────
function AgentRegistryPanel({
  agents,
  onAdd,
  onClose,
  alreadyAdded,
}: {
  agents: Agent[];
  onAdd: (agent: Agent) => void;
  onClose: () => void;
  alreadyAdded: string[];
}) {
  const [search, setSearch] = React.useState("");
  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.desc.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end sm:items-start sm:justify-end">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Panel */}
      <div className="relative z-10 flex h-full w-full max-w-sm flex-col bg-white shadow-soft ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800 sm:rounded-l-2xl">
        <div className="flex items-center justify-between border-b border-line p-5 dark:border-slate-800">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Agent Registry</div>
            <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Add agents to this project</div>
          </div>
          <button
            onClick={onClose}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-xl ring-1 ring-line",
              "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              "dark:ring-slate-800 dark:hover:bg-slate-900/40 dark:text-slate-300",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]"
            )}
            aria-label="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line p-4 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              autoFocus
              placeholder="Search agents…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-2">
            {filtered.map((agent) => {
              const added = alreadyAdded.includes(agent.id);
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
                >
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
                  <Button
                    size="sm"
                    variant={added ? "ghost" : "secondary"}
                    disabled={added}
                    onClick={() => !added && onAdd(agent)}
                  >
                    {added ? "Added" : "Add"}
                  </Button>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
                No agents found.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────
function TeamTab({ projectId }: { projectId: string }) {
  const [team, setTeam] = React.useState<TeamMemberWithAgent[]>([]);
  const [allAgents, setAllAgents] = React.useState<Agent[]>([]);
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
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {team.length} agent{team.length !== 1 ? "s" : ""} on this project
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowRegistry(true)}>
            <UserPlus className="h-4 w-4" />
            Add Agent
          </Button>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">No agents yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Add an agent from the registry to get started.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowRegistry(true)}>
                Add Agent
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {team.map((m) => (
                <div
                  key={m.agentId}
                  className="flex items-center gap-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
                >
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-900 text-white dark:bg-slate-700">
                    <span className="text-xs font-semibold">
                      {(m.agent?.name ?? m.agentId)[0].toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {m.agent?.name ?? m.agentId}
                      </span>
                      <Badge tone={statusTone(m.agent?.status ?? "offline")}>
                        {m.agent?.status ?? "unknown"}
                      </Badge>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span>{m.role}</span>
                      {m.agent?.desc && <><span>·</span><span>{m.agent.desc}</span></>}
                      <span>· Joined {m.joinedAt}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button size="sm" variant="secondary">Inspect</Button>
                    <Button size="sm" variant="ghost">Ping</Button>
                    <Button size="sm" variant="ghost" onClick={() => handleRemove(m.agentId)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
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

// ─── Tab Bar ──────────────────────────────────────────────────────────────────
const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "architecture", label: "Architecture", icon: BookOpen },
  { id: "tech-spec", label: "Technical Specification", icon: FileCode2 },
  { id: "sprint-board", label: "Sprint Board", icon: Kanban },
  { id: "team", label: "Team", icon: Users },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ProjectDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = React.use(props.params);
  const [project, setProject] = React.useState(PROJECTS.find((p) => p.id === params.id));
  const [activeTab, setActiveTab] = React.useState<Tab>("architecture");

  React.useEffect(() => {
    fetchProject(params.id).then((p) => { if (p) setProject(p); });
  }, [params.id]);

  if (!project) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">Project not found</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          No project with id <code className="font-mono">{params.id}</code> exists.
        </p>
        <Link href="/dashboard">
          <Button variant="secondary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link
          href="/dashboard"
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-line",
            "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
            "dark:ring-slate-800 dark:hover:bg-slate-900/40 dark:text-slate-300",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]"
          )}
          aria-label="Back to Dashboard"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{project.name}</h1>
            <Badge tone={project.status === "active" ? "brand" : project.status === "review" ? "warning" : "neutral"}>
              {project.status}
            </Badge>
          </div>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{project.description}</p>
        </div>
      </div>

      {/* Tab bar */}
      <div
        className="flex gap-1 overflow-x-auto rounded-2xl bg-slate-50 p-1.5 ring-1 ring-line dark:bg-slate-900/40 dark:ring-slate-800"
        role="tablist"
      >
        {TABS.map((tab) => {
          const active = activeTab === tab.id;
          const Icon = tab.icon;
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
              <Icon className="h-4 w-4" aria-hidden />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div role="tabpanel">
        {activeTab === "architecture" && <ArchitectureTab />}
        {activeTab === "tech-spec" && <TechSpecTab />}
        {activeTab === "sprint-board" && <SprintBoardTab projectId={project.id} />}
        {activeTab === "team" && <TeamTab projectId={project.id} />}
      </div>
    </div>
  );
}
