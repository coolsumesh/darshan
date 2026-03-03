"use client";
import { Database, User, Bot, FolderKanban, Building2 } from "lucide-react";
import Link from "next/link";

const ENTITIES = [
  {
    icon: User,
    color: "bg-sky-100 dark:bg-sky-500/10",
    iconColor: "text-sky-600 dark:text-sky-400",
    title: "User",
    subtitle: "The primary actor",
    points: [
      "Signs in via Google OAuth.",
      "Creates Organisations and Projects.",
      "Owns Agents — each agent has exactly one owner (owner_user_id).",
      "Can be invited into other users' Organisations and Projects.",
      "Can contribute their own Agents to any Org or Project they're a member of.",
    ],
  },
  {
    icon: Bot,
    color: "bg-violet-100 dark:bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
    title: "Agent",
    subtitle: "Owned by a User",
    points: [
      "Always belongs to exactly one User (owner_user_id).",
      "Not owned by an Org — the Org relationship is a contribution, not ownership.",
      "Can be contributed to multiple Organisations (org_agents table).",
      "Can be assigned to multiple Projects (project_agents table).",
      "Receives work via an inbox: task_assigned, ping, welcome items.",
    ],
  },
  {
    icon: FolderKanban,
    color: "bg-emerald-100 dark:bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    title: "Project",
    subtitle: "Standalone — no Org required",
    points: [
      "Created directly by a User. An Organisation is not required.",
      "Has its own member list (project_users) and agent assignments (project_agents).",
      "Users are invited directly into a Project — Org membership is not a prerequisite.",
      "Agents are assigned directly to a Project — Org contribution is not a prerequisite.",
      "Optionally grouped under an Organisation (projects.org_id is nullable).",
    ],
  },
  {
    icon: Building2,
    color: "bg-amber-100 dark:bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    title: "Organisation",
    subtitle: "An optional umbrella",
    points: [
      "Created by a User who becomes its owner (organisations.owner_user_id).",
      "Groups related Projects under one umbrella — purely organisational.",
      "Has a member list (org_users) with roles: admin / contributor / viewer.",
      "Members can contribute their own Agents to the Org (org_agents — contribution record only).",
      "Org membership does NOT gate access to Projects — each Project manages its own members.",
    ],
  },
];

const TABLES = [
  {
    name: "org_users",
    purpose: "Human members of an Org",
    key: "org_id, user_id, role",
    note: "Roles: admin / contributor / viewer. Org owner lives in organisations.owner_user_id.",
  },
  {
    name: "org_agents",
    purpose: "Agent contribution record for an Org",
    key: "org_id, agent_id, contributed_by, status",
    note: "No role column. Status: active / withdrawn. contributed_by is the user who contributed it.",
  },
  {
    name: "project_users",
    purpose: "Human members of a Project",
    key: "project_id, user_id, role",
    note: "Roles: admin / contributor / viewer. Project owner is the creator.",
  },
  {
    name: "project_agents",
    purpose: "Agent assignment record for a Project",
    key: "project_id, agent_id, added_by",
    note: "No role column. added_by is the user who assigned the agent.",
  },
];

export default function DataModelPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 dark:bg-brand-500/10">
          <Database className="h-5 w-5 text-brand-600 dark:text-brand-400" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Data Model</h1>
          <p className="mt-0.5 text-xs text-zinc-500">How Users, Agents, Projects, and Organisations relate</p>
        </div>
      </header>

      {/* Overview */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
        <p className="mb-2 font-display text-sm font-bold text-zinc-900 dark:text-white">Overview</p>
        <p className="text-sm leading-relaxed text-zinc-500">
          Users are the primary actors. Everything else flows from them. A User creates Projects and
          Organisations independently — neither requires the other. Agents are personal assets owned
          by a User; they can be contributed to Orgs and assigned to Projects as needed.
        </p>

        {/* Relationship diagram (text-based) */}
        <div className="mt-4 rounded-xl bg-zinc-50 p-4 font-mono text-[12px] leading-6 text-zinc-600 dark:bg-white/5 dark:text-zinc-400">
          <div><span className="text-sky-600 dark:text-sky-400 font-semibold">User</span></div>
          <div className="ml-2">├── owns ──▶ <span className="text-violet-600 dark:text-violet-400 font-semibold">Agent</span> (owner_user_id)</div>
          <div className="ml-10">├── contributed to ──▶ <span className="text-amber-600 dark:text-amber-400 font-semibold">Org</span> (org_agents)</div>
          <div className="ml-10">└── assigned to ──▶ <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Project</span> (project_agents)</div>
          <div className="ml-2">├── creates ──▶ <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Project</span> (standalone, no Org needed)</div>
          <div className="ml-10">└── invites Users ──▶ project_users</div>
          <div className="ml-2">└── creates ──▶ <span className="text-amber-600 dark:text-amber-400 font-semibold">Org</span> (optional grouping)</div>
          <div className="ml-10">├── invites Users ──▶ org_users</div>
          <div className="ml-10">└── groups Projects (projects.org_id nullable)</div>
        </div>
      </div>

      {/* Entity cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {ENTITIES.map(({ icon: Icon, color, iconColor, title, subtitle, points }) => (
          <div key={title} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
            <div className="flex items-center gap-3">
              <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${color}`}>
                <Icon className={`h-4.5 w-4.5 ${iconColor}`} />
              </div>
              <div>
                <p className="font-display text-sm font-bold text-zinc-900 dark:text-white">{title}</p>
                <p className="text-[11px] text-zinc-400">{subtitle}</p>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 pl-1">
              {points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-xs leading-relaxed text-zinc-500">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Key rule callout */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/5">
        <p className="mb-1 font-display text-sm font-bold text-amber-800 dark:text-amber-300">⚠ Key Rule</p>
        <p className="text-sm leading-relaxed text-amber-700 dark:text-amber-400">
          <strong>Org membership does NOT gate Project access.</strong> Projects manage their own member lists independently.
          A user can be in a Project without being in any Org. An agent can be assigned to a Project
          without being contributed to any Org. The Org is purely an organisational grouping — it
          imposes no access control on Projects.
        </p>
      </div>

      {/* Tables */}
      <div>
        <p className="mb-3 font-display text-sm font-bold text-zinc-900 dark:text-white">Membership & Contribution Tables</p>
        <div className="flex flex-col gap-2">
          {TABLES.map(({ name, purpose, key, note }) => (
            <div key={name} className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
              <div className="flex items-center gap-2">
                <code className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-mono font-semibold text-zinc-700 dark:bg-white/10 dark:text-zinc-300">{name}</code>
                <span className="text-xs text-zinc-500">{purpose}</span>
              </div>
              <p className="text-[11px] font-mono text-zinc-400">{key}</p>
              <p className="text-[11px] text-zinc-400">{note}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Role model */}
      <div>
        <p className="mb-3 font-display text-sm font-bold text-zinc-900 dark:text-white">Role Model</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { role: "Admin",       badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",       desc: "Manage members, edit settings, delete the Org/Project." },
            { role: "Contributor", badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",   desc: "Contribute agents, create and work on tasks." },
            { role: "Viewer",      badge: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",           desc: "Read-only access. Cannot mutate tasks or invite members." },
          ].map(({ role, badge, desc }) => (
            <div key={role} className="flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
              <span className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${badge}`}>{role}</span>
              <p className="text-xs leading-relaxed text-zinc-500">{desc}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-zinc-400">
          Applies to both <code className="font-mono">org_users.role</code> and <code className="font-mono">project_users.role</code>.
          Org ownership lives in <code className="font-mono">organisations.owner_user_id</code> — not in the membership table.
        </p>
      </div>

      {/* Related docs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { href: "/docs/getting-started", title: "Getting Started", desc: "Step-by-step guide to creating your first project and agent." },
          { href: "/docs/agents",          title: "Agents Guide",    desc: "Inbox protocol, tokens, task lifecycle and heartbeat setup." },
        ].map(({ href, title, desc }) => (
          <Link key={href} href={href}
            className="flex flex-col gap-1.5 rounded-2xl border border-zinc-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-sm dark:border-[#2D2A45] dark:bg-[#16132A] dark:hover:border-brand-500/40">
            <p className="font-display text-sm font-bold text-zinc-900 dark:text-white">{title} →</p>
            <p className="text-xs text-zinc-500">{desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
