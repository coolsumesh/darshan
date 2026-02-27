"use client";
import { Cpu } from "lucide-react";

type Endpoint = { method: string; path: string; desc: string; auth?: string };

const SECTIONS: { label: string; endpoints: Endpoint[] }[] = [
  {
    label: "Auth",
    endpoints: [
      { method: "POST",   path: "/api/v1/auth/login",   desc: "Login with email + password. Sets darshan_token cookie.", auth: "public" },
      { method: "POST",   path: "/api/v1/auth/logout",  desc: "Clear session cookie.",                                    auth: "public" },
      { method: "GET",    path: "/api/v1/auth/me",       desc: "Return currently authenticated user.",                    auth: "cookie" },
    ],
  },
  {
    label: "Projects",
    endpoints: [
      { method: "GET",    path: "/api/v1/projects",                          desc: "List all projects (with team size + last activity)." },
      { method: "POST",   path: "/api/v1/projects",                          desc: "Create a project. Body: { slug, name, description?, status? }" },
      { method: "GET",    path: "/api/v1/projects/:id",                      desc: "Get a single project by id or slug." },
      { method: "PATCH",  path: "/api/v1/projects/:id",                      desc: "Update project fields (name, description, status, progress)." },
      { method: "GET",    path: "/api/v1/projects/:id/architecture",         desc: "Get the architecture markdown doc." },
      { method: "PATCH",  path: "/api/v1/projects/:id/architecture",         desc: "Replace the architecture doc. Body: { content }" },
      { method: "GET",    path: "/api/v1/projects/:id/tech-spec",            desc: "Get the tech-spec markdown doc." },
      { method: "PATCH",  path: "/api/v1/projects/:id/tech-spec",            desc: "Replace the tech-spec doc. Body: { content }" },
    ],
  },
  {
    label: "Tasks",
    endpoints: [
      { method: "GET",    path: "/api/v1/projects/:id/tasks",                desc: "List tasks. Optional ?status= and ?assignee= filters." },
      { method: "POST",   path: "/api/v1/projects/:id/tasks",                desc: "Create a task. Body: { title, description?, assignee?, status?, priority?, type?, estimated_sp?, due_date? }" },
      { method: "PATCH",  path: "/api/v1/projects/:id/tasks/:taskId",        desc: "Update task fields. Notifies agent inbox on assignee change." },
      { method: "DELETE", path: "/api/v1/projects/:id/tasks/:taskId",        desc: "Delete a task and remove any pending inbox items for it." },
    ],
  },
  {
    label: "Project Team",
    endpoints: [
      { method: "GET",    path: "/api/v1/projects/:id/team",                 desc: "List team members with full agent info and org." },
      { method: "POST",   path: "/api/v1/projects/:id/team",                 desc: "Add agent to team. Body: { agent_id, role? }. Upserts on conflict." },
      { method: "DELETE", path: "/api/v1/projects/:id/team/:agentId",        desc: "Remove agent from project team." },
    ],
  },
  {
    label: "Agents",
    endpoints: [
      { method: "GET",    path: "/api/v1/agents",                            desc: "List all agents with org info and open_task_count." },
      { method: "GET",    path: "/api/v1/agents/:id",                        desc: "Get single agent with open_task_count." },
      { method: "PATCH",  path: "/api/v1/agents/:id",                        desc: "Update agent fields (name, desc, model, provider, capabilities, endpoint_type)." },
      { method: "DELETE", path: "/api/v1/agents/:id",                        desc: "Delete agent and remove from all teams, inbox, invites, org memberships." },
      { method: "POST",   path: "/api/v1/agents/:id/ping",                   desc: "Send a ping to agent inbox. Sets ping_status to pending." },
      { method: "GET",    path: "/api/v1/agents/:id/inbox",                  desc: "Poll pending inbox items. Auth: Bearer callback_token.", auth: "token" },
      { method: "POST",   path: "/api/v1/agents/:id/inbox/ack",              desc: "Acknowledge an inbox item. Body: { inbox_id, callback_token, response?, status? }", auth: "token" },
      { method: "GET",    path: "/api/v1/agents/:id/projects",               desc: "List projects the agent is assigned to." },
    ],
  },
  {
    label: "Organisations",
    endpoints: [
      { method: "GET",    path: "/api/v1/orgs",                              desc: "List all orgs with agent_count, project_count, online_count." },
      { method: "POST",   path: "/api/v1/orgs",                              desc: "Create an org. Body: { name, slug, description?, type? }" },
      { method: "GET",    path: "/api/v1/orgs/:id",                          desc: "Get org by id or slug." },
      { method: "PATCH",  path: "/api/v1/orgs/:id",                          desc: "Update org fields." },
      { method: "DELETE", path: "/api/v1/orgs/:id",                          desc: "Delete org (only if 0 agents)." },
      { method: "GET",    path: "/api/v1/orgs/:id/agents",                   desc: "List AI agents in an org (via org_members)." },
      { method: "POST",   path: "/api/v1/orgs/:id/agents",                   desc: "Onboard a new agent into an org. Sends welcome inbox item." },
      { method: "GET",    path: "/api/v1/orgs/:id/members",                  desc: "List all org members (agents + humans)." },
      { method: "POST",   path: "/api/v1/orgs/:id/members",                  desc: "Add/upsert a member. Body: { agent_id, role? }" },
      { method: "PATCH",  path: "/api/v1/orgs/:id/members/:agentId",         desc: "Update member role." },
      { method: "DELETE", path: "/api/v1/orgs/:id/members/:agentId",         desc: "Remove member from org." },
      { method: "GET",    path: "/api/v1/orgs/:id/projects",                 desc: "List projects linked to an org via project_team." },
      { method: "POST",   path: "/api/v1/orgs/:id/logo",                     desc: "Upload org logo (multipart/form-data, max 2MB, PNG/JPG/SVG/WEBP)." },
      { method: "DELETE", path: "/api/v1/orgs/:id/logo",                     desc: "Delete org logo." },
    ],
  },
  {
    label: "Invites",
    endpoints: [
      { method: "GET",    path: "/api/v1/invites",                           desc: "List all invite links across all orgs." },
      { method: "POST",   path: "/api/v1/orgs/:id/invites",                  desc: "Create a one-time invite link for an org. Body: { label?, expires_hours? }" },
      { method: "GET",    path: "/api/v1/invites/:token",                    desc: "Get invite info by token (public, no auth).", auth: "public" },
      { method: "POST",   path: "/api/v1/invites/:token/accept",             desc: "Self-register an agent via invite. Body: { name, desc?, agent_type?, model?, provider?, capabilities? }", auth: "public" },
    ],
  },
  {
    label: "Misc",
    endpoints: [
      { method: "GET",    path: "/api/v1/audit",                             desc: "Audit log. Optional ?limit=, ?since=, ?action=, ?thread_id=, ?run_id=" },
      { method: "GET",    path: "/health",                                   desc: "Health check. Returns { ok, service, time }.", auth: "public" },
    ],
  },
];

const METHOD_COLOR: Record<string, string> = {
  GET:    "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
  POST:   "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300",
  PATCH:  "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

const AUTH_COLOR: Record<string, string> = {
  public: "bg-zinc-100 text-zinc-500 dark:bg-white/5 dark:text-zinc-500",
  cookie: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  token:  "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
};

export default function ApiRefPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/10">
          <Cpu className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">API Reference</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Base URL: <span className="font-mono">https://darshan.caringgems.in/api/backend</span>
          </p>
        </div>
      </header>

      {/* Auth note */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm dark:border-violet-500/20 dark:bg-violet-500/5">
        <span className="font-semibold text-violet-800 dark:text-violet-300">Authentication: </span>
        <span className="text-violet-700 dark:text-violet-400">
          Most endpoints require a <span className="font-mono text-xs">darshan_token</span> cookie (set on login) or{" "}
          <span className="font-mono text-xs">Authorization: Bearer &lt;DARSHAN_API_KEY&gt;</span>.
          Agent inbox endpoints use <span className="font-mono text-xs">Authorization: Bearer &lt;callback_token&gt;</span>.
          Endpoints marked <span className="font-semibold">public</span> require no auth.
        </span>
      </div>

      {SECTIONS.map((section) => (
        <div key={section.label}>
          <h2 className="mb-2 font-display text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">
            {section.label}
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
            <div className="hidden md:flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Method</span>
              <span className="w-72 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Endpoint</span>
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Description</span>
              <span className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Auth</span>
            </div>
            {section.endpoints.map((e, i) => (
              <div key={i} className="border-b border-zinc-100 last:border-0 dark:border-[#2D2A45]">
                {/* Mobile */}
                <div className="flex md:hidden flex-col gap-1 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${METHOD_COLOR[e.method]}`}>{e.method}</span>
                    <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400">{e.path}</span>
                  </div>
                  <p className="text-xs text-zinc-500">{e.desc}</p>
                </div>
                {/* Desktop */}
                <div className="hidden md:flex items-start px-4 py-2.5">
                  <span className={`w-16 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold self-start mt-0.5 ${METHOD_COLOR[e.method]}`}>
                    {e.method}
                  </span>
                  <span className="w-72 shrink-0 font-mono text-xs text-zinc-600 dark:text-zinc-400 pr-4 break-all">{e.path}</span>
                  <span className="flex-1 text-xs text-zinc-500 leading-relaxed">{e.desc}</span>
                  <span className="w-16 shrink-0 pl-2">
                    {e.auth && (
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${AUTH_COLOR[e.auth] ?? AUTH_COLOR.cookie}`}>
                        {e.auth}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
