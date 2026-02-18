"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { fetchProjects } from "@/lib/api";
import { type Project, type ProjectStatus } from "@/lib/projects";
import { cn } from "@/lib/cn";

function statusTone(status: ProjectStatus): "brand" | "warning" | "neutral" {
  if (status === "active") return "brand";
  if (status === "review") return "warning";
  return "neutral";
}

function statusLabel(status: ProjectStatus): string {
  if (status === "active") return "Active";
  if (status === "review") return "Review";
  return "Planned";
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function DashboardPage() {
  const [projects, setProjects] = React.useState<Project[]>([]);

  React.useEffect(() => {
    fetchProjects().then(setProjects);
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Projects</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {projects.length} active workspaces
          </p>
        </div>
        <Button variant="primary" size="sm">
          New Project
        </Button>
      </div>

      {/* Project grid */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.slug ?? project.id}`}
            className={cn(
              "group flex flex-col gap-4 rounded-2xl bg-white p-5 ring-1 ring-line shadow-softSm",
              "transition hover:bg-slate-50 hover:shadow-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
              "dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
            )}
          >
            {/* Title row */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {project.name}
                  </span>
                  <Badge tone={statusTone(project.status)}>
                    {statusLabel(project.status)}
                  </Badge>
                </div>
                <p className="mt-1.5 text-sm leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">
                  {project.description}
                </p>
              </div>
              <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-500 dark:text-slate-600 dark:group-hover:text-slate-400" />
            </div>

            {/* Progress */}
            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>Progress</span>
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {project.progress}%
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-1.5 rounded-full bg-[rgb(var(--accent-600))] transition-all"
                  style={{ width: `${project.progress}%` }}
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                <span>{project.teamSize} agents</span>
              </div>
              <span>Updated {relativeTime(project.lastActivity)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
