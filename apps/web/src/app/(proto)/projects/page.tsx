"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search, FolderKanban, Users, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { type Project } from "@/lib/projects";
import { fetchProjects } from "@/lib/api";

function statusLabel(s?: string) {
  if (s === "active")  return { label: "Active",  cls: "bg-emerald-100 text-emerald-700" };
  if (s === "review")  return { label: "Review",  cls: "bg-amber-100 text-amber-700"     };
  if (s === "planned") return { label: "Planned", cls: "bg-zinc-100 text-zinc-500"       };
  return { label: "Unknown", cls: "bg-zinc-100 text-zinc-400" };
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
      <div
        className="h-full rounded-full bg-brand-500 transition-all"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const { label, cls } = statusLabel(project.status);
  const progress = project.progress ?? 0;

  return (
    <Link
      href={`/projects/${project.slug ?? project.id}`}
      className={cn(
        "group flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-zinc-200 shadow-softSm",
        "dark:bg-[#16132A] dark:ring-[#2D2A45]",
        "transition-all hover:-translate-y-0.5 hover:shadow-md hover:ring-brand-300 dark:hover:ring-brand-500/40"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 dark:bg-brand-500/10">
            <FolderKanban className="h-5 w-5 text-brand-600 dark:text-brand-400" />
          </div>
          <div>
            <p className="font-display font-bold text-zinc-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
              {project.name}
            </p>
            <p className="text-xs text-zinc-400">/{project.slug ?? project.id}</p>
          </div>
        </div>
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0", cls)}>{label}</span>
      </div>

      {/* Description */}
      {project.description && (
        <p className="line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">{project.description}</p>
      )}

      {/* Progress */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between text-xs text-zinc-400">
          <span>Progress</span>
          <span className="font-semibold text-zinc-600 dark:text-zinc-300">{progress}%</span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4 text-xs text-zinc-400">
        {project.teamSize != null && (
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" />
            {project.teamSize} member{project.teamSize !== 1 ? "s" : ""}
          </span>
        )}
        <span className="flex items-center gap-1">
          <TrendingUp className="h-3.5 w-3.5" />
          {label}
        </span>
      </div>
    </Link>
  );
}

export default function ProjectsPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [loading,  setLoading]  = React.useState(true);
  const [query,    setQuery]    = React.useState("");

  React.useEffect(() => {
    fetchProjects().then((p) => { setProjects(p); setLoading(false); });
  }, []);

  const filtered = projects.filter((p) =>
    !query || p.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Projects</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{projects.length} workspace{projects.length !== 1 ? "s" : ""} · MithranLabs</p>
        </div>
        <button className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700">
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          placeholder="Search projects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-4 text-sm ring-1 ring-zinc-200",
            "placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40",
            "dark:bg-[#16132A] dark:ring-[#2D2A45] dark:text-white"
          )}
        />
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-zinc-100 dark:bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-sm text-zinc-400">No projects found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}
    </div>
  );
}
