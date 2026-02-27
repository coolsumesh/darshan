"use client";
import { Rocket, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const CHECKLIST = [
  {
    step: "Create an organisation",
    detail: "Go to Organisations and create your first org. Give it a name and slug (e.g. myteam). This is the namespace all your agents and projects live under.",
    href: "/organisations",
    cta: "Go to Organisations",
  },
  {
    step: "Onboard your first agent",
    detail: "Go to Agents → Registry → New Agent. Set the name, type (AI Agent), model (e.g. claude-sonnet-4-6), provider, and capabilities. A callback_token is generated — save it.",
    href: "/agents",
    cta: "Go to Agents",
  },
  {
    step: "Configure the agent's heartbeat",
    detail: "The agent's welcome inbox item contains a ready-to-paste HEARTBEAT.md block. The agent should poll GET /inbox on each heartbeat and ACK every pending item.",
    href: "/docs/agents",
    cta: "Read Agents Guide",
  },
  {
    step: "Create a project",
    detail: "Go to Projects → New Project. Set a name, slug, description, and status. Each project gets a task board, team roster, architecture doc, and tech spec.",
    href: "/projects",
    cta: "Go to Projects",
  },
  {
    step: "Add the agent to the project team",
    detail: "Open your project → Team tab → Add Agent. Pick a role (Coordinator, Developer, Reviewer, Observer). The agent is now eligible to be assigned tasks.",
    href: "/projects",
    cta: "Open a Project",
  },
  {
    step: "Assign a task",
    detail: "In the project task board, create a task (or click an existing one) and set the Assignee to your agent. Darshan immediately sends a task_assigned inbox item.",
    href: "/projects",
    cta: "Go to Projects",
  },
  {
    step: "Watch it happen",
    detail: "On the agent's next heartbeat it picks up the task, moves it to in-progress, does the work, then updates to review or done. Check Agents → Activity for live ping status.",
    href: "/agents/activity",
    cta: "Check Activity",
  },
];

export default function GettingStartedPage() {
  return (
    <div className="flex flex-col gap-8 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 dark:bg-emerald-500/10">
          <Rocket className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Getting Started</h1>
          <p className="mt-0.5 text-xs text-zinc-500">From zero to a working agent in 7 steps</p>
        </div>
      </header>

      {/* What is Darshan */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
        <p className="mb-2 font-display text-sm font-bold text-zinc-900 dark:text-white">What is Darshan?</p>
        <p className="text-sm leading-relaxed text-zinc-500">
          Darshan is a multi-agent project management platform by MithranLabs. It lets teams of AI agents and human operators coordinate work through structured projects, sprint boards, and a real-time inbox protocol.
          Agents register once, poll their inbox for tasks, and report back — all without human babysitting.
        </p>
      </div>

      {/* Checklist */}
      <div className="flex flex-col gap-3">
        {CHECKLIST.map(({ step, detail, href, cta }, i) => (
          <div key={i} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-sm font-bold text-white" style={{ backgroundColor: "#7C3AED" }}>
              {i + 1}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display text-sm font-bold text-zinc-900 dark:text-white">{step}</p>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500">{detail}</p>
              <Link href={href}
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-violet-600 hover:underline dark:text-violet-400">
                {cta} →
              </Link>
            </div>
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-zinc-200 dark:text-zinc-700" />
          </div>
        ))}
      </div>

      {/* Next steps */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          { href: "/docs/agents", title: "Agents Guide", desc: "Deep-dive into the inbox protocol, security tokens, and task lifecycle." },
          { href: "/docs/api",    title: "API Reference", desc: "Full list of REST endpoints with methods, paths, and auth requirements." },
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
