"use client";

import * as React from "react";
import Markdown from "react-markdown";
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
import { fetchProject, fetchTasks, fetchTeam, fetchAgents, createTask, updateTask, deleteTask, addTeamMember, removeTeamMember, fetchArchitecture, fetchTechSpec, type TeamMemberWithAgent } from "@/lib/api";

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

// ─── Markdown Renderer ───────────────────────────────────────────────────────
function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      components={{
        h1: ({ children }) => (
          <h1 className="mb-4 mt-6 text-lg font-semibold text-slate-900 dark:text-slate-100 first:mt-0">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-3 mt-5 text-base font-semibold text-slate-800 dark:text-slate-200 first:mt-0">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-2 mt-4 text-sm font-semibold text-slate-700 dark:text-slate-300 first:mt-0">{children}</h3>
        ),
        p: ({ children }) => (
          <p className="mb-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{children}</p>
        ),
        ul: ({ children }) => (
          <ul className="mb-3 ml-4 list-disc space-y-1 text-sm text-slate-600 dark:text-slate-400">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-3 ml-4 list-decimal space-y-1 text-sm text-slate-600 dark:text-slate-400">{children}</ol>
        ),
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          return isBlock ? (
            <code className="block w-full overflow-x-auto rounded-xl bg-slate-100 px-4 py-3 text-xs font-mono text-slate-800 dark:bg-slate-900 dark:text-slate-200">
              {children}
            </code>
          ) : (
            <code className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="mb-3 overflow-x-auto rounded-xl bg-slate-100 p-4 dark:bg-slate-900">{children}</pre>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-slate-800 dark:text-slate-200">{children}</strong>
        ),
        hr: () => <hr className="my-4 border-slate-200 dark:border-slate-800" />,
        a: ({ children, href }) => (
          <a href={href} target="_blank" rel="noopener noreferrer"
            className="text-[rgb(var(--accent-600))] underline underline-offset-2 hover:opacity-80">
            {children}
          </a>
        ),
      }}
    >
      {content}
    </Markdown>
  );
}

// ─── Architecture Tab ─────────────────────────────────────────────────────────
function ArchitectureTab({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchArchitecture(projectId).then((c) => { setContent(c); setLoading(false); });
  }, [projectId]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading architecture…</div>;
  }

  if (!content) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No architecture documentation yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Architecture</CardTitle></CardHeader>
      <CardContent>
        <MarkdownContent content={content} />
      </CardContent>
    </Card>
  );
}

// ─── Tech Spec Tab ────────────────────────────────────────────────────────────
function TechSpecTab({ projectId }: { projectId: string }) {
  const [content, setContent] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchTechSpec(projectId).then((c) => { setContent(c); setLoading(false); });
  }, [projectId]);

  if (loading) {
    return <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">Loading tech spec…</div>;
  }

  if (!content) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">No technical specification yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader><CardTitle>Technical Specification</CardTitle></CardHeader>
      <CardContent>
        <MarkdownContent content={content} />
      </CardContent>
    </Card>
  );
}

// ─── Sprint Board Tab ─────────────────────────────────────────────────────────
function SprintBoardTab({ projectId }: { projectId: string }) {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [addingIn, setAddingIn] = React.useState<TaskStatus | null>(null);
  const [newTitle, setNewTitle] = React.useState("");
  const [acting, setActing] = React.useState<string | null>(null); // taskId being acted on

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

  async function approveTask(taskId: string) {
    setActing(taskId);
    const updated = await updateTask(projectId, taskId, { status: "approved" });
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: updated?.status ?? "approved" } : t));
    setActing(null);
  }

  async function rejectTask(taskId: string) {
    setActing(taskId);
    await deleteTask(projectId, taskId);
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    setActing(null);
  }

  async function markDoneTask(taskId: string) {
    setActing(taskId);
    const updated = await updateTask(projectId, taskId, { status: "done" });
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: updated?.status ?? "done" } : t));
    setActing(null);
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
                    {task.status === "proposed" && (
                      <div className="mt-3 flex gap-1.5">
                        <button
                          disabled={acting === task.id}
                          onClick={() => approveTask(task.id)}
                          className={cn(
                            "flex-1 rounded-lg py-1.5 text-xs font-semibold transition",
                            "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100",
                            "dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30 dark:hover:bg-emerald-500/20",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          ✓ Approve
                        </button>
                        <button
                          disabled={acting === task.id}
                          onClick={() => markDoneTask(task.id)}
                          className={cn(
                            "flex-1 rounded-lg py-1.5 text-xs font-semibold transition",
                            "bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100",
                            "dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-500/30 dark:hover:bg-blue-500/20",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          ✦ Mark Done
                        </button>
                        <button
                          disabled={acting === task.id}
                          onClick={() => rejectTask(task.id)}
                          className={cn(
                            "flex-1 rounded-lg py-1.5 text-xs font-semibold transition",
                            "bg-red-50 text-red-600 ring-1 ring-red-200 hover:bg-red-100",
                            "dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30 dark:hover:bg-red-500/20",
                            "disabled:opacity-50 disabled:cursor-not-allowed"
                          )}
                        >
                          ✕ Reject
                        </button>
                      </div>
                    )}
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
  const [loading, setLoading] = React.useState(!project);
  const [activeTab, setActiveTab] = React.useState<Tab>("architecture");

  React.useEffect(() => {
    setLoading(true);
    fetchProject(params.id).then((p) => {
      if (p) setProject(p);
      setLoading(false);
    });
  }, [params.id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-sm text-slate-500 dark:text-slate-400">Loading project…</div>
      </div>
    );
  }

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
        {activeTab === "architecture" && <ArchitectureTab projectId={project.slug ?? project.id} />}
        {activeTab === "tech-spec" && <TechSpecTab projectId={project.slug ?? project.id} />}
        {activeTab === "sprint-board" && <SprintBoardTab projectId={project.id} />}
        {activeTab === "team" && <TeamTab projectId={project.id} />}
      </div>
    </div>
  );
}
