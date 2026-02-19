"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock,
  LayoutGrid,
  List,
  Plus,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchProjects } from "@/lib/api";
import { type Project, type ProjectStatus } from "@/lib/projects";
import { cn } from "@/lib/cn";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusTone(s: ProjectStatus): "brand" | "warning" | "neutral" {
  if (s === "active") return "brand";
  if (s === "review") return "warning";
  return "neutral";
}

function statusLabel(s: ProjectStatus) {
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

// ─── Cycling hero text ────────────────────────────────────────────────────────

const PHRASES = ["Manage launches", "Track sprints", "Ship faster", "Coordinate agents"];

function CyclingText() {
  const [idx,     setIdx]     = React.useState(0);
  const [visible, setVisible] = React.useState(true);

  React.useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIdx((i) => (i + 1) % PHRASES.length);
        setVisible(true);
      }, 350);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <span
      className="font-display font-extrabold text-zinc-900 dark:text-white"
      style={{ transition: "opacity 350ms ease-in-out", opacity: visible ? 1 : 0 }}
    >
      {PHRASES[idx]}
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  iconBg,
  label,
  value,
  sub,
}: {
  icon: React.ElementType;
  iconBg: string;
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className={cn(
      "flex min-h-[96px] flex-1 items-center gap-4 rounded-2xl bg-white p-5",
      "border border-zinc-200 shadow-softSm",
      "dark:bg-[#16132A] dark:border-[#2D2A45]",
      "animate-fade-up"
    )}>
      <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", iconBg)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
        <p className="font-display text-[40px] font-extrabold leading-none text-zinc-900 dark:text-white">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-zinc-400">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Color bar (Monday-style section status strip) ────────────────────────────

function ColorBar({ projects }: { projects: Project[] }) {
  const total    = projects.length;
  if (!total) return null;
  const active   = projects.filter(p => p.status === "active").length;
  const review   = projects.filter(p => p.status === "review").length;
  const planned  = projects.filter(p => p.status === "planned").length;
  return (
    <div className="flex h-1 w-full overflow-hidden rounded-full">
      <div className="bg-brand-500 transition-all" style={{ width: `${(active  / total) * 100}%` }} />
      <div className="bg-amber-400 transition-all"  style={{ width: `${(review  / total) * 100}%` }} />
      <div className="bg-zinc-300 transition-all"   style={{ width: `${(planned / total) * 100}%` }} />
    </div>
  );
}

// ─── Section group header ─────────────────────────────────────────────────────

function SectionHeader({
  label,
  count,
  accentClass,
  collapsed,
  onToggle,
}: {
  label: string;
  count: number;
  accentClass: string;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "group flex w-full items-center gap-2.5 border-b border-zinc-200 py-2.5 text-left transition-colors",
        "hover:bg-zinc-50 dark:border-[#2D2A45] dark:hover:bg-white/5"
      )}
    >
      <div className={cn("h-4 w-1 shrink-0 rounded-full", accentClass)} />
      <ChevronDown
        className={cn("h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200",
          collapsed && "-rotate-90"
        )}
      />
      <span className="font-display text-sm font-bold text-zinc-900 dark:text-white">{label}</span>
      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-zinc-100 px-1.5 text-[11px] font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
        {count}
      </span>
      <span className="ml-auto flex items-center gap-1.5 text-xs text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100">
        <Plus className="h-3.5 w-3.5" /> Add project
      </span>
    </button>
  );
}

// ─── Project card ─────────────────────────────────────────────────────────────

function ProjectCard({ project, index }: { project: Project; index: number }) {
  return (
    <Link
      href={`/projects/${project.slug ?? project.id}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl bg-white",
        "border border-zinc-200 shadow-softSm",
        "transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md-soft",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
        "dark:bg-[#16132A] dark:border-[#2D2A45]",
        "animate-fade-up"
      )}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      {/* Top colour strip */}
      <div className={cn("h-[3px] w-full",
        project.status === "active"  ? "bg-brand-500" :
        project.status === "review"  ? "bg-amber-400"  : "bg-zinc-200"
      )} />

      <div className="flex flex-1 flex-col gap-4 p-5">
        {/* Title row */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-sm font-semibold text-zinc-900 dark:text-white">{project.name}</span>
              <Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge>
            </div>
            <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-zinc-500">{project.description}</p>
          </div>
          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
        </div>

        {/* Progress */}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-zinc-500">
            <span>Progress</span>
            <span className="font-bold text-zinc-700 dark:text-zinc-200">{project.progress ?? 0}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <div
              className="h-1.5 rounded-full bg-brand-500 transition-all"
              style={{ width: `${project.progress ?? 0}%` }}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-white/5">
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

// ─── Project table row ────────────────────────────────────────────────────────

function ProjectRow({ project, index }: { project: Project; index: number }) {
  return (
    <Link
      href={`/projects/${project.slug ?? project.id}`}
      className={cn(
        "group flex items-center gap-4 border-b border-zinc-100 px-4 py-3 text-sm transition-colors",
        "hover:bg-zinc-50 dark:border-[#2D2A45] dark:hover:bg-white/5",
        "animate-fade-up"
      )}
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className={cn("h-2 w-2 shrink-0 rounded-full",
        project.status === "active" ? "bg-brand-500" :
        project.status === "review" ? "bg-amber-400" : "bg-zinc-300"
      )} />
      <span className="font-display min-w-0 flex-1 truncate font-semibold text-zinc-900 dark:text-white">{project.name}</span>
      <Badge tone={statusTone(project.status)}>{statusLabel(project.status)}</Badge>
      <div className="hidden w-32 sm:block">
        <div className="flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
            <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${project.progress ?? 0}%` }} />
          </div>
          <span className="text-xs font-semibold text-zinc-500">{project.progress ?? 0}%</span>
        </div>
      </div>
      <span className="hidden text-xs text-zinc-400 sm:block">{relativeTime(project.lastActivity)}</span>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 transition group-hover:translate-x-0.5 group-hover:text-zinc-500" />
    </Link>
  );
}

// ─── Section group ────────────────────────────────────────────────────────────

const STATUS_SECTIONS: {
  key: "active" | "review" | "planned";
  label: string;
  accent: string;
}[] = [
  { key: "active",  label: "Active Projects",  accent: "bg-brand-500" },
  { key: "review",  label: "Review",           accent: "bg-amber-400"  },
  { key: "planned", label: "Planned",          accent: "bg-zinc-300"   },
];

type ViewMode = "board" | "table";

function SectionGroup({
  section,
  projects,
  view,
}: {
  section: typeof STATUS_SECTIONS[number];
  projects: Project[];
  view: ViewMode;
}) {
  const [collapsed, setCollapsed] = React.useState(false);

  if (!projects.length) return null;

  return (
    <div>
      <SectionHeader
        label={section.label}
        count={projects.length}
        accentClass={section.accent}
        collapsed={collapsed}
        onToggle={() => setCollapsed((c) => !c)}
      />

      {!collapsed && (
        <div className="py-4">
          {view === "board" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
              {projects.map((p, i) => <ProjectRow key={p.id} project={p} index={i} />)}
            </div>
          )}

          {/* Monday-style color strip */}
          <div className="mt-3">
            <ColorBar projects={projects} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [view,     setView]     = React.useState<ViewMode>("board");

  React.useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  const activeProjects  = projects.filter((p) => p.status === "active");
  const avgProgress     = projects.length
    ? Math.round(projects.reduce((s, p) => s + (p.progress ?? 0), 0) / projects.length)
    : 0;
  const totalAgents     = projects.reduce((s, p) => s + (p.teamSize ?? 0), 0);

  return (
    <div className="flex flex-col gap-8">

      {/* ── Hero ── */}
      <div className="animate-fade-up">
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
          MithranLabs Ops Console
        </p>
        <h1 className="mt-1 text-[40px] leading-tight">
          <CyclingText />
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {activeProjects.length} active project{activeProjects.length !== 1 ? "s" : ""} · {projects.length} total workspaces
        </p>
      </div>

      {/* ── Stats row ── */}
      <div className="flex flex-wrap gap-4 delay-100">
        <StatCard icon={TrendingUp}   iconBg="bg-brand-600"   label="Total Projects"   value={projects.length}   sub="active workspaces"      />
        <StatCard icon={Users}        iconBg="bg-sky-500"     label="Active Agents"    value={totalAgents || "—"} sub="assigned"              />
        <StatCard icon={Zap}          iconBg="bg-amber-500"   label="Avg Progress"     value={`${avgProgress}%`} sub="across all"            />
        <StatCard icon={CheckCircle2} iconBg="bg-emerald-500" label="Completed Today"  value={0}                 sub="tasks in last 24h"     />
      </div>

      {/* ── View tabs ── */}
      <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-[#2D2A45] animate-fade-up delay-200">
        {([["board", "Board", LayoutGrid], ["table", "Table", List]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setView(id as ViewMode)}
            className={cn(
              "flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              view === id
                ? "border-brand-600 text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
        <div className="ml-auto pb-2">
          <Button variant="primary" size="sm">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Project
          </Button>
        </div>
      </div>

      {/* ── Section groups ── */}
      <div className="flex flex-col gap-2 animate-fade-up delay-300">
        {STATUS_SECTIONS.map((section) => (
          <SectionGroup
            key={section.key}
            section={section}
            projects={projects.filter((p) => p.status === section.key)}
            view={view}
          />
        ))}
      </div>
    </div>
  );
}
