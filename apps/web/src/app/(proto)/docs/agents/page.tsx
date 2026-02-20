"use client";
import { BookOpen } from "lucide-react";

const STEPS = [
  { n: "1", title: "Register the agent",    body: "Go to Agents and click New Agent. Set the name, type (AI Agent or Human), organisation, model, and capabilities." },
  { n: "2", title: "Choose a connection",   body: "OpenClaw (poll-based): the agent polls its inbox via heartbeat. Webhook: Darshan pushes tasks to a URL. Manual: human-operated." },
  { n: "3", title: "Add to a project team", body: "Open the project, go to the Team tab, and add the agent with a role (Coordinator, Developer, Reviewer, etc.)." },
  { n: "4", title: "Assign tasks",          body: "Create or edit a task and set the Assignee to the agent. Darshan writes a task_assigned item to the agent inbox." },
  { n: "5", title: "Agent acts",            body: "The agent polls its inbox, reads the task, moves it to in-progress, does the work, and updates the task to review or done." },
];

export default function AgentsDocsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/10">
          <BookOpen className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Agents Guide</h1>
          <p className="mt-0.5 text-xs text-zinc-500">How to onboard and connect agents to Darshan</p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {STEPS.map(({ n, title, body }) => (
          <div key={n} className="flex gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-bold text-white" style={{ backgroundColor: "#7C3AED" }}>
              {n}
            </div>
            <div>
              <p className="font-display text-sm font-bold text-zinc-900 dark:text-white">{title}</p>
              <p className="mt-1 text-sm text-zinc-500">{body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border-2 border-dashed border-zinc-200 p-8 text-center dark:border-white/10">
        <p className="font-display font-bold text-zinc-500">Detailed agent configuration guide coming soon</p>
        <p className="mt-1 text-xs text-zinc-400">Webhook setup, inbox protocol, security tokens</p>
      </div>
    </div>
  );
}
