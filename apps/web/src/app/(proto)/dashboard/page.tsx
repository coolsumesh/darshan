"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  FolderKanban,
  Layers,
  Plus,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchProjects } from "@/lib/api";
import { type Project, type ProjectStatus } from "@/lib/projects";
import { cn } from "@/lib/cn";

/* ─── helpers ──────────────────────────────────────────── */

function statusTone(s: ProjectStatus): "brand" | "warning" | "neutral" {
  if (s === "active") return "brand";
  if (s === "review") return "warning";
  return "neutral";
}

function statusLabel(s: ProjectStatus): string {
  if (s === "active") return "Active";
  if (s === "review") return "Review";
  return "Planned";
}

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function greeting(): string {
  const h = new Date().getUTCHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function todayLabel(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

/* ─── mock activity feed ────────────────────────────────── */

const ACTIVITY = [
  {
    id: 1,
    actor: "Komal 🌸",
    action: "approved",
    target: "Add markdown rendering",
    project: "Darshan",
    time: "8m ago",
    done: true,
  },
  {
    id: 2,
    actor: "Mithran ⚡",
    action: "updated architecture doc",
    target: "",
    project: "Alpha Analytics",
    time: "31m ago",
    done: false,
  },
  {
    id: 3,
    actor: "Komal 🌸",
    action: "moved to In Progress",
    target: "Assignee picker",
    project: "Darshan",
    time: "1h ago",
    done: false,
  },
  {
    id: 4,
    actor: "Mithran ⚡",
    action: "created project",
    target: "Beta Platform",
    project: "Beta",
    time: "2h ago",
    done: false,
  },
  {
    id: 5,
    actor: "Komal 🌸",
    action: "completed",
    target: "Approve/Reject sprint actions",
    project: "Darshan",
    time: "3h ago",
    done: true,
  },
];

/* ─── sub-components ────────────────────────────────────── */

function StatPill({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white px-4 py-3 ring-1 ring-line shadow-softSm dark:bg-slate-950 dark:ring-slate-800">
      <Icon className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
      <span className="text-sm font-bold text-slate-900 dark:text-slate-100">{value}</span>
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const accentClass =
    project.status === "active"
      ? "bg-brand-600"
      : project.status === "review"
        ? "bg-amber-400"
        : "bg-slate-300 dark:bg-slate-700";

  return (
    <Link
      href={`/projects/${project.slug ?? project.id}`}
      className={cn(
        "group flex flex-col rounded-2xl bg-white ring-1 ring-line shadow-softSm overflow-hidden",
        "transition-all hover:shadow-soft hover:-translate-y-0.5",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
        "dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
      )}
    >
      {/* colour bar */}
      <div className={cn("h-1 w-full", accentClass)} />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* title */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {project.name}
              </span>
              <Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-slate-500 dark:text-slate-400">
              {project.description}
            </p>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
        </div>

        {/* progress */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Progress</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {project.progress ?? 0}%
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-1.5 rounded-full bg-[rgb(var(--accent-600))] transition-all"
              style={{ width: `${project.progress ?? 0}%` }}
            />
          </div>
        </div>

        {/* footer */}
        <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" />
            {project.teamSize ?? 0} agents
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {relativeTime(project.lastActivity)}
          </span>
        </div>
      </div>
    </Link>
  );
}

function ActivityFeed() {
  return (
    <div className="flex flex-col gap-2">
      {ACTIVITY.map((item) => (
        <div
          key={item.id}
          className="flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-900/40"
        >
          <div className="mt-0.5 shrink-0">
            {item.done ? (
              <CheckCircle2 className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            ) : (
              <Circle className="h-4 w-4 text-slate-300 dark:text-slate-600" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm leading-snug text-slate-700 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {item.actor}
              </span>{" "}
              {item.action}
              {item.target && (
                <>
                  {" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    &ldquo;{item.target}&rdquo;
                  </span>
                </>
              )}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
              <span>{item.project}</span>
              <span>·</span>
              <span>{item.time}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── page ──────────────────────────────────────────────── */

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);

  React.useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  const activeCount = projects.filter((p) => p.status === "active").length;
  const avgProgress =
    projects.length > 0
      ? Math.round(projects.reduce((s, p) => s + (p.progress ?? 0), 0) / projects.length)
      : 0;
  const totalAgents = projects.reduce((s, p) => s + (p.teamSize ?? 0), 0);

  return (
    <div className="flex h-full flex-col gap-5">

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-600 px-8 py-7 text-white shadow-soft">
        <div className="pointer-events-none absolute inset-0 opacity-10 bg-grid" />
        <div className="relative flex flex-col gap-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand-200">
            {todayLabel()} · MithranLabs
          </p>
          <h1 className="text-2xl font-bold">
            {greeting()}, Sumesh 👋
          </h1>
          <p className="mt-1 text-sm text-brand-100">
            {activeCount} active project{activeCount !== 1 ? "s" : ""} · {avgProgress}% average
            progress across the team.
          </p>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2">
          <StatPill icon={Layers} label="projects" value={projects.length} />
          <StatPill icon={Zap} label="avg progress" value={`${avgProgress}%`} />
          <StatPill icon={Users} label="agents deployed" value={totalAgents || "—"} />
        </div>
      </div>

      {/* ── Two-column body ── */}
      <div className="flex min-h-0 flex-1 gap-5">

        {/* Left — project grid */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Projects
            </h2>
            <Button variant="primary" size="sm">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Project
            </Button>
          </div>

          <div className="grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 auto-rows-fr">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </div>

        {/* Right — activity + quick actions */}
        <div className="flex w-[300px] shrink-0 flex-col gap-4">

          {/* Quick actions */}
          <div className="rounded-2xl bg-white p-5 ring-1 ring-line shadow-softSm dark:bg-slate-950 dark:ring-slate-800">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Quick actions
            </h2>
            <div className="flex flex-col gap-1">
              {[
                { icon: Plus, label: "New task", href: "#" },
                { icon: FolderKanban, label: "Open sprint board", href: "/projects/darshan" },
                { icon: Users, label: "Manage team", href: "/projects/darshan" },
              ].map(({ icon: Icon, label, href }) => (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition",
                    "hover:bg-slate-50 hover:text-slate-900",
                    "dark:text-slate-300 dark:hover:bg-slate-900/40 dark:hover:text-slate-100"
                  )}
                >
                  <Icon className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                  {label}
                  <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
                </Link>
              ))}
            </div>
          </div>

          {/* Activity feed */}
          <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white p-5 ring-1 ring-line shadow-softSm dark:bg-slate-950 dark:ring-slate-800">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Recent activity
            </h2>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <ActivityFeed />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
