"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type TaskStatus = "todo" | "in-progress" | "done";

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  assignee: string;
  createdAt: string;
};

const AGENTS = [
  "Mithran ⚡",
  "Komal 🌸",
  "Anantha 🐍",
  "Vishwakarma 🏗️",
  "Ganesha 📝",
  "Drishti 👁️",
  "Lekha 🗄️",
  "Sanjaya 🎨",
  "Suraksha 🛡️",
];

const STATUS_ORDER: TaskStatus[] = ["todo", "in-progress", "done"];

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  "in-progress": "In Progress",
  done: "Done",
};

const STATUS_TONES: Record<TaskStatus, "neutral" | "brand" | "success"> = {
  todo: "neutral",
  "in-progress": "brand",
  done: "success",
};

function nextStatus(s: TaskStatus): TaskStatus {
  const idx = STATUS_ORDER.indexOf(s);
  return STATUS_ORDER[(idx + 1) % STATUS_ORDER.length];
}

let _idCounter = 3;
function newId() {
  return String(++_idCounter);
}

const INITIAL_TASKS: Task[] = [
  {
    id: "1",
    title: "Wire Agents page to real API",
    status: "done",
    assignee: "Komal 🌸",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    title: "Replace connector.ts with real OpenClaw connector",
    status: "in-progress",
    assignee: "Mithran ⚡",
    createdAt: new Date().toISOString(),
  },
  {
    id: "3",
    title: "Set up AWS deployment (PM2 + nginx)",
    status: "todo",
    assignee: "Mithran ⚡",
    createdAt: new Date().toISOString(),
  },
];

export default function TasksPage() {
  const [tasks, setTasks] = React.useState<Task[]>(INITIAL_TASKS);
  const [newTitle, setNewTitle] = React.useState("");
  const [newAssignee, setNewAssignee] = React.useState(AGENTS[0]);
  const [filter, setFilter] = React.useState<TaskStatus | "all">("all");

  function createTask() {
    if (!newTitle.trim()) return;
    setTasks((prev) => [
      ...prev,
      {
        id: newId(),
        title: newTitle.trim(),
        status: "todo",
        assignee: newAssignee,
        createdAt: new Date().toISOString(),
      },
    ]);
    setNewTitle("");
  }

  function cycleStatus(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: nextStatus(t.status) } : t
      )
    );
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  const filtered =
    filter === "all" ? tasks : tasks.filter((t) => t.status === filter);

  const counts = React.useMemo(() => {
    const c: Record<TaskStatus | "all", number> = {
      all: tasks.length,
      todo: 0,
      "in-progress": 0,
      done: 0,
    };
    for (const t of tasks) c[t.status]++;
    return c;
  }, [tasks]);

  return (
    <div className="space-y-4">
      {/* Create task */}
      <Card>
        <CardHeader>
          <CardTitle>Sprint Board</CardTitle>
          <div className="mt-1 text-xs text-muted">
            MithranLabs task queue — click a status badge to cycle it
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Input
              className="flex-1 min-w-[200px]"
              placeholder="New task title…"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createTask()}
            />
            <select
              className="rounded-xl border border-line bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus-visible:ring-2 dark:bg-slate-950 dark:text-slate-100 dark:border-slate-800"
              value={newAssignee}
              onChange={(e) => setNewAssignee(e.target.value)}
            >
              {AGENTS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={createTask} disabled={!newTitle.trim()}>
              Add task
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {(["all", ...STATUS_ORDER] as Array<TaskStatus | "all">).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ring-1 ${
              filter === s
                ? "bg-brand-600 text-white ring-brand-600"
                : "bg-white text-slate-700 ring-line hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800"
            }`}
          >
            {s === "all" ? "All" : STATUS_LABELS[s]}
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white/20 px-1 text-[11px]">
              {counts[s]}
            </span>
          </button>
        ))}
      </div>

      {/* Columns (board view on large screens) */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {STATUS_ORDER.map((col) => {
          const colTasks = filtered.filter((t) => t.status === col);
          if (filter !== "all" && filter !== col && colTasks.length === 0)
            return null;
          return (
            <div key={col} className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <Badge tone={STATUS_TONES[col]}>{STATUS_LABELS[col]}</Badge>
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

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="text-xs text-muted">{task.assignee}</div>
                    <button
                      type="button"
                      title="Cycle status"
                      onClick={() => cycleStatus(task.id)}
                    >
                      <Badge tone={STATUS_TONES[task.status]}>
                        {STATUS_LABELS[task.status]}
                      </Badge>
                    </button>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteTask(task.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
