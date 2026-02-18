"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchProjects, createProject, fetchProjectTasks, type ApiProject } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { formatRelativeTime } from "@/lib/time";

export default function ProjectsPage() {
  const { setSelected } = useProject();
  const [projects, setProjects] = React.useState<ApiProject[]>([]);
  const [taskCounts, setTaskCounts] = React.useState<Record<string, number>>({});
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [newName, setNewName] = React.useState("");
  const [newDesc, setNewDesc] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  function load() {
    setLoading(true);
    fetchProjects("active")
      .then(async (res) => {
        setProjects(res.projects);
        // Fetch task counts for each project in parallel
        const counts = await Promise.all(
          res.projects.map((p) =>
            fetchProjectTasks(p.id)
              .then((r) => ({ id: p.id, count: r.tasks.length }))
              .catch(() => ({ id: p.id, count: 0 })),
          ),
        );
        const map: Record<string, number> = {};
        for (const c of counts) map[c.id] = c.count;
        setTaskCounts(map);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  React.useEffect(load, []);

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await createProject(newName.trim(), newDesc.trim());
      setProjects((prev) => [...prev, res.project]);
      setTaskCounts((prev) => ({ ...prev, [res.project.id]: 0 }));
      setNewName("");
      setNewDesc("");
    } catch {
      // no-op
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Projects</CardTitle>
          <div className="mt-1 text-xs text-muted">
            MithranLabs — all active projects
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[160px]"
              placeholder="Project name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="Description (optional)"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
            >
              {creating ? "Creating…" : "New project"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="py-10 text-center text-sm text-muted">Loading projects…</div>
      )}
      {error && (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <div
              key={p.id}
              className="rounded-2xl bg-white p-5 ring-1 ring-line hover:shadow-softSm dark:bg-slate-950 dark:ring-slate-800"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {p.name}
                  </div>
                  {p.description && (
                    <div className="mt-1 text-xs text-muted line-clamp-2">
                      {p.description}
                    </div>
                  )}
                </div>
                <Badge tone={p.status === "active" ? "success" : "neutral"}>
                  {p.status}
                </Badge>
              </div>

              <div className="mt-4 flex items-center gap-4 text-xs text-muted">
                <span>{taskCounts[p.id] ?? "—"} tasks</span>
                <span>{p.member_count} members</span>
                <span>Updated {formatRelativeTime(p.updated_at)}</span>
              </div>

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => setSelected(p)}
                >
                  Switch to
                </Button>
              </div>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="col-span-full py-10 text-center text-sm text-muted">
              No projects yet. Create one above.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
