"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchProjectTasks, createTask, type ApiTask, BASE } from "@/lib/api";
import { useProject } from "@/lib/project-context";
import { formatRelativeTime } from "@/lib/time";

type ColStatus = "proposed" | "approved" | "in_progress" | "done";

const COLUMNS: ColStatus[] = ["proposed", "approved", "in_progress", "done"];

const COL_LABELS: Record<ColStatus, string> = {
  proposed: "Proposed",
  approved: "Approved",
  in_progress: "In Progress",
  done: "Done",
};

const COL_TONES: Record<ColStatus, "neutral" | "warning" | "brand" | "success"> = {
  proposed: "neutral",
  approved: "warning",
  in_progress: "brand",
  done: "success",
};

async function apiPatch(path: string) {
  const res = await fetch(`${BASE}${path}`, { method: "PATCH" });
  return res.json();
}

export default function TasksPage() {
  const { selected: project } = useProject();
  const [tasks, setTasks] = React.useState<ApiTask[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [newTitle, setNewTitle] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  function load(projectId: string) {
    setLoading(true);
    setError(null);
    fetchProjectTasks(projectId)
      .then((res) => setTasks(res.tasks))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  React.useEffect(() => {
    if (project) load(project.id);
  }, [project?.id]);

  async function handleCreate() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const res = await createTask(newTitle.trim());
      // Reload from server to get the project-scoped view
      if (project) load(project.id);
      setNewTitle("");
      // If task comes back but isn't in project scope yet, still show optimistic
      setTasks((prev) => [res.task, ...prev]);
    } catch {
      // no-op for now
    } finally {
      setCreating(false);
    }
  }

  async function handleApprove(taskId: string) {
    await apiPatch(`/api/v1/tasks/${taskId}/approve`);
    if (project) load(project.id);
  }

  async function handleDone(taskId: string) {
    // Mark done — using a placeholder agentId (sumesh as human approver)
    await fetch(`${BASE}/api/v1/tasks/${taskId}/done`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: tasks.find((t) => t.id === taskId)?.claimed_by_agent_id ?? "" }),
    });
    if (project) load(project.id);
  }

  const byStatus = React.useMemo(() => {
    const map: Record<ColStatus, ApiTask[]> = {
      proposed: [],
      approved: [],
      in_progress: [],
      done: [],
    };
    for (const t of tasks) {
      if (t.status === "rejected") continue; // hide rejected from board
      const col = t.status as ColStatus;
      if (col in map) map[col].push(t);
    }
    return map;
  }, [tasks]);

  return (
    <div className="space-y-4">
      {/* Header + create */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Sprint Board</CardTitle>
              <div className="mt-1 text-xs text-muted">
                {project ? project.name : "No project selected"} — task queue
              </div>
            </div>
            {project && (
              <Button variant="ghost" size="sm" onClick={() => load(project.id)}>
                Refresh
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="New task title…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              disabled={!project || creating}
            />
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!newTitle.trim() || !project || creating}
            >
              {creating ? "Adding…" : "Add task"}
            </Button>
          </div>
          {!project && (
            <div className="mt-2 text-xs text-muted">Select a project first.</div>
          )}
        </CardContent>
      </Card>

      {/* Board */}
      {loading && (
        <div className="py-10 text-center text-sm text-muted">Loading tasks…</div>
      )}
      {error && (
        <div className="py-10 text-center text-sm text-red-500">{error}</div>
      )}
      {!loading && !error && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
          {COLUMNS.map((col) => {
            const colTasks = byStatus[col];
            return (
              <div key={col} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Badge tone={COL_TONES[col]}>{COL_LABELS[col]}</Badge>
                  <span className="text-xs text-muted">{colTasks.length}</span>
                </div>

                {colTasks.length === 0 && (
                  <div className="rounded-2xl border-2 border-dashed border-line py-8 text-center text-xs text-muted dark:border-slate-800">
                    Empty
                  </div>
                )}

                {colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-2xl bg-white p-4 ring-1 ring-line hover:shadow-softSm dark:bg-slate-950 dark:ring-slate-800"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {task.title}
                    </div>
                    {task.description && (
                      <div className="mt-1 text-xs text-muted line-clamp-2">
                        {task.description}
                      </div>
                    )}
                    <div className="mt-2 text-xs text-muted">
                      {task.claimed_by_agent_name
                        ? `Assigned: ${task.claimed_by_agent_name}`
                        : task.proposed_by_agent_name
                          ? `Proposed by: ${task.proposed_by_agent_name}`
                          : `By: ${task.proposed_by_user_id ?? "human"}`}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {formatRelativeTime(task.updated_at)}
                    </div>

                    {/* Actions */}
                    <div className="mt-3 flex gap-2">
                      {task.status === "proposed" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleApprove(task.id)}
                        >
                          Approve
                        </Button>
                      )}
                      {task.status === "in_progress" && task.claimed_by_agent_id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleDone(task.id)}
                        >
                          Mark done
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
