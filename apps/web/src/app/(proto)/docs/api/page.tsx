"use client";
import { Cpu } from "lucide-react";

const ENDPOINTS = [
  { method: "GET",    path: "/api/v1/projects",                    desc: "List all projects"              },
  { method: "GET",    path: "/api/v1/projects/:id/tasks",          desc: "List tasks for a project"       },
  { method: "POST",   path: "/api/v1/projects/:id/tasks",          desc: "Create a task"                  },
  { method: "PATCH",  path: "/api/v1/projects/:id/tasks/:taskId",  desc: "Update a task"                  },
  { method: "DELETE", path: "/api/v1/projects/:id/tasks/:taskId",  desc: "Delete a task"                  },
  { method: "GET",    path: "/api/v1/agents",                      desc: "List all agents"                },
  { method: "PATCH",  path: "/api/v1/agents/:id",                  desc: "Update an agent"                },
  { method: "GET",    path: "/api/v1/orgs",                        desc: "List organisations"             },
  { method: "GET",    path: "/api/v1/orgs/:id/members",            desc: "List org members"               },
  { method: "POST",   path: "/api/v1/orgs/:id/members",            desc: "Add a member to an org"         },
  { method: "GET",    path: "/api/v1/agents/:id/inbox",            desc: "Poll agent inbox"               },
  { method: "POST",   path: "/api/v1/agents/:id/inbox/ack",        desc: "Acknowledge an inbox item"      },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  POST:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  PATCH:  "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

export default function ApiRefPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/10">
          <Cpu className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">API Reference</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Base URL: https://darshan.caringgems.in/api/backend</p>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
        <div className="flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
          <span className="w-20 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Method</span>
          <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Endpoint</span>
          <span className="w-64 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Description</span>
        </div>
        {ENDPOINTS.map((e, i) => (
          <div key={i} className="flex items-center border-b border-zinc-100 px-4 py-3 last:border-0 dark:border-[#2D2A45]">
            <span className={`w-20 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${METHOD_COLOR[e.method]}`}>
              {e.method}
            </span>
            <span className="flex-1 font-mono text-xs text-zinc-600 dark:text-zinc-400">{e.path}</span>
            <span className="w-64 text-xs text-zinc-500">{e.desc}</span>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-zinc-400">Full request/response schemas coming soon.</p>
    </div>
  );
}
