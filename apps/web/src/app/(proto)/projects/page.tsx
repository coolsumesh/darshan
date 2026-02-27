"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Search, FolderKanban, Users, TrendingUp, X, Share2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { type Project } from "@/lib/projects";
import { fetchProjects, createProject } from "@/lib/api";

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
  const progress  = project.progress ?? 0;
  const isShared  = (project as unknown as { my_role?: string }).my_role === "member";

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
            <div className="flex items-center gap-2">
              <p className="font-display font-bold text-zinc-900 dark:text-white group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                {project.name}
              </p>
              {isShared && (
                <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">
                  <Share2 className="h-2.5 w-2.5" /> Shared
                </span>
              )}
            </div>
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

// ── Slug helper ────────────────────────────────────────────────────────────────
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── New Project Modal ──────────────────────────────────────────────────────────
function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (project: Project) => void;
}) {
  const [name,        setName]        = React.useState("");
  const [slug,        setSlug]        = React.useState("");
  const [slugEdited,  setSlugEdited]  = React.useState(false);
  const [description, setDescription] = React.useState("");
  const [status,      setStatus]      = React.useState<"active" | "planned">("active");
  const [saving,      setSaving]      = React.useState(false);
  const [error,       setError]       = React.useState<string | null>(null);
  const [nameError,   setNameError]   = React.useState(false);
  const [slugError,   setSlugError]   = React.useState(false);

  // Auto-generate slug from name unless user has manually edited it
  function handleNameChange(v: string) {
    setName(v);
    if (!slugEdited) setSlug(toSlug(v));
  }

  function handleSlugChange(v: string) {
    setSlug(toSlug(v) || v.toLowerCase());
    setSlugEdited(true);
  }

  async function handleSave() {
    const nameOk = name.trim().length > 0;
    const slugOk = slug.trim().length > 0;
    setNameError(!nameOk);
    setSlugError(!slugOk);
    if (!nameOk || !slugOk) return;

    setSaving(true);
    setError(null);
    try {
      const project = await createProject({ name: name.trim(), slug: slug.trim(), description: description.trim(), status });
      if (!project) { setError("Failed to create project. The slug may already be in use."); setSaving(false); return; }
      onCreated(project);
    } catch {
      setError("Unexpected error. Please try again.");
      setSaving(false);
    }
  }

  // Close on Escape
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inputCls = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";
  const labelCls = "text-xs font-semibold text-zinc-700 dark:text-zinc-300";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close"
      />

      {/* Modal */}
      <div className="relative z-10 flex w-full max-w-md flex-col rounded-2xl bg-white shadow-soft ring-1 ring-zinc-200 dark:bg-[#16132A] dark:ring-[#2D2A45] max-h-[90vh]">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <h2 className="font-display text-sm font-semibold text-zinc-900 dark:text-white">New project</h2>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5 min-h-0">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>
              Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              type="text"
              placeholder="My Awesome Project"
              value={name}
              onChange={(e) => handleNameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
              className={cn(inputCls, nameError && "ring-red-400 focus:ring-red-400")}
            />
            {nameError && <p className="text-xs text-red-500">Name is required</p>}
          </div>

          {/* Slug */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>
              Slug <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center rounded-xl ring-1 ring-zinc-200 focus-within:ring-2 focus-within:ring-brand-400/40 dark:ring-zinc-700 overflow-hidden bg-zinc-50 dark:bg-zinc-900">
              <span className="px-3 text-sm text-zinc-400 select-none">/</span>
              <input
                type="text"
                placeholder="my-awesome-project"
                value={slug}
                onChange={(e) => handleSlugChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                className="flex-1 border-0 bg-transparent py-2.5 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-100"
              />
            </div>
            {slugError && <p className="text-xs text-red-500">Slug is required</p>}
            <p className="text-[11px] text-zinc-400">Used in URLs. Auto-generated from name; lowercase letters, numbers, hyphens only.</p>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Description</label>
            <textarea
              placeholder="What is this project about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={cn(inputCls, "resize-none")}
            />
          </div>

          {/* Status */}
          <div className="flex flex-col gap-1.5">
            <label className={labelCls}>Status</label>
            <div className="flex gap-2">
              {(["active", "planned"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={cn(
                    "flex-1 rounded-xl py-2 text-sm font-semibold capitalize transition-colors ring-1",
                    status === s
                      ? s === "active"
                        ? "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:ring-white/10"
                      : "bg-white text-zinc-400 ring-zinc-200 hover:bg-zinc-50 dark:bg-transparent dark:ring-zinc-700 dark:text-zinc-500 dark:hover:bg-white/5"
                  )}
                >
                  {s === "active" ? "Active" : "Planned"}
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
          <button
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ backgroundColor: "#7C3AED" }}
            className="inline-flex h-9 items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sort config ────────────────────────────────────────────────────────────────
type SortKey = "status" | "name" | "progress" | "team";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "status",   label: "Status (active first)" },
  { value: "name",     label: "Name"                  },
  { value: "progress", label: "Progress"              },
  { value: "team",     label: "Team size"             },
];

const STATUS_ORDER: Record<string, number> = { active: 0, review: 1, planned: 2 };

function sortProjects(projects: Project[], key: SortKey): Project[] {
  const sorted = [...projects];
  sorted.sort((a, b) => {
    switch (key) {
      case "status":
        return (STATUS_ORDER[a.status ?? ""] ?? 9) - (STATUS_ORDER[b.status ?? ""] ?? 9);
      case "name":
        return a.name.localeCompare(b.name);
      case "progress":
        return (b.progress ?? 0) - (a.progress ?? 0);
      case "team":
        return (b.teamSize ?? 0) - (a.teamSize ?? 0);
    }
  });
  return sorted;
}

// ── Status filter tabs config ──────────────────────────────────────────────────
type StatusFilter = "all" | "active" | "planned" | "review";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all",     label: "All"     },
  { id: "active",  label: "Active"  },
  { id: "planned", label: "Planned" },
  { id: "review",  label: "Review"  },
];

// ── Page ───────────────────────────────────────────────────────────────────────
export default function ProjectsPage() {
  const router = useRouter();
  const [projects,      setProjects]      = React.useState<Project[]>([]);
  const [loading,       setLoading]       = React.useState(true);
  const [query,         setQuery]         = React.useState("");
  const [statusFilter,  setStatusFilter]  = React.useState<StatusFilter>("all");
  const [sortKey,       setSortKey]       = React.useState<SortKey>("status");
  const [showModal,     setShowModal]     = React.useState(false);

  React.useEffect(() => {
    fetchProjects().then((p) => { setProjects(p); setLoading(false); });
  }, []);

  // Counts per tab (search-aware)
  const searchFiltered = projects.filter((p) =>
    !query || p.name.toLowerCase().includes(query.toLowerCase())
  );
  const counts: Record<StatusFilter, number> = {
    all:     searchFiltered.length,
    active:  searchFiltered.filter((p) => p.status === "active").length,
    planned: searchFiltered.filter((p) => p.status === "planned").length,
    review:  searchFiltered.filter((p) => p.status === "review").length,
  };

  // Final filtered + sorted list
  const statusFiltered = statusFilter === "all"
    ? searchFiltered
    : searchFiltered.filter((p) => p.status === statusFilter);
  const filtered = sortProjects(statusFiltered, sortKey);

  // Stat summary (over all projects, not filtered)
  const totalProjects  = projects.length;
  const activeProjects = projects.filter((p) => p.status === "active").length;
  const avgProgress    = totalProjects > 0
    ? Math.round(projects.reduce((s, p) => s + (p.progress ?? 0), 0) / totalProjects)
    : 0;

  function handleCreated(project: Project) {
    setShowModal(false);
    router.push(`/projects/${project.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Projects</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{projects.length} workspace{projects.length !== 1 ? "s" : ""} · MithranLabs</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> New Project
        </button>
      </div>

      {/* Stat summary cards */}
      {!loading && (
        <div className="grid grid-cols-3 gap-3">
          {[
            {
              label: "Total Projects",
              value: totalProjects,
              sub: "across MithranLabs",
              accent: "text-zinc-900 dark:text-white",
              bg: "bg-white dark:bg-[#16132A]",
            },
            {
              label: "Active",
              value: activeProjects,
              sub: `${totalProjects - activeProjects} planned / review`,
              accent: "text-emerald-600 dark:text-emerald-400",
              bg: "bg-white dark:bg-[#16132A]",
            },
            {
              label: "Avg Progress",
              value: `${avgProgress}%`,
              sub: "across all projects",
              accent: "text-brand-600 dark:text-brand-400",
              bg: "bg-white dark:bg-[#16132A]",
            },
          ].map((s) => (
            <div key={s.label} className={cn("flex flex-col gap-1 rounded-2xl p-4 ring-1 ring-zinc-200 shadow-softSm dark:ring-[#2D2A45]", s.bg)}>
              <span className={cn("font-display text-2xl font-extrabold tabular-nums", s.accent)}>{s.value}</span>
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">{s.label}</span>
              <span className="text-xs text-zinc-400">{s.sub}</span>
            </div>
          ))}
        </div>
      )}

      {/* Search + Filter row */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Search + Sort */}
        <div className="flex items-center gap-2 w-full sm:max-w-md">
          <div className="relative flex-1">
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
          {/* Sort dropdown */}
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className={cn(
              "shrink-0 rounded-xl border-0 bg-white py-2.5 pl-3 pr-8 text-sm ring-1 ring-zinc-200",
              "focus:outline-none focus:ring-2 focus:ring-brand-500/40 text-zinc-700",
              "dark:bg-[#16132A] dark:ring-[#2D2A45] dark:text-zinc-300"
            )}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Status filter tabs */}
        <div className="flex items-center gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-white/5 overflow-x-auto shrink-0">
          {STATUS_TABS.map((tab) => {
            const active = statusFilter === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "bg-white text-zinc-900 shadow-sm dark:bg-[#1E1B35] dark:text-white"
                    : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                )}
              >
                {tab.label}
                <span className={cn(
                  "grid min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold",
                  active
                    ? "bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300"
                    : "bg-zinc-200 text-zinc-500 dark:bg-white/10 dark:text-zinc-400"
                )}>
                  {counts[tab.id]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-2xl bg-zinc-100 dark:bg-white/5" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-20 text-center">
          <FolderKanban className="h-10 w-10 text-zinc-300 dark:text-zinc-600" />
          <p className="text-sm text-zinc-400">
            {query || statusFilter !== "all"
              ? "No projects match your filters."
              : "No projects yet. Create your first one!"}
          </p>
          {!query && statusFilter === "all" && (
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              <Plus className="h-4 w-4" /> New Project
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => <ProjectCard key={p.id} project={p} />)}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
