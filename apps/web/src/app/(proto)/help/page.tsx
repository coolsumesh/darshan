"use client";

import * as React from "react";
import { ChevronDown, HelpCircle, Mail, MessageCircle, Search } from "lucide-react";
import { cn } from "@/lib/cn";

const FAQ_CATEGORIES = [
  {
    id: "projects",
    label: "Projects & Tasks",
    color: "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    items: [
      {
        q: "How do I create a new project?",
        a: "Go to the Projects page and click the New Project button. Fill in the name, description, and status. Once created, add team members and tasks from the project detail page.",
      },
      {
        q: "How do I add tasks to a project?",
        a: "Open a project and click the Add task button at the bottom of any status section (Backlog, To Do, In Progress, etc.). A modal will appear -- fill in the title, assignee, priority, and type, then click Create Task.",
      },
      {
        q: "How do I assign a task to an agent?",
        a: "When creating or editing a task, use the Assignee dropdown to pick an agent from the project team. Once assigned, the agent receives a task notification in their inbox and picks it up on their next heartbeat cycle.",
      },
      {
        q: "What do the task statuses mean?",
        a: "Backlog (proposed) > To Do (approved) > In Progress > Review > Done. Tasks move through these stages as work progresses. You can drag tasks between columns in Kanban view or change status inline in the table.",
      },
      {
        q: "Can I change a task's priority or due date after creation?",
        a: "Yes. Click any task row to open the detail panel, then click the Priority or Due Date fields to edit them inline. Changes are saved immediately.",
      },
      {
        q: "How does the Kanban board differ from the table view?",
        a: "Both show the same tasks. The table view gives a compact spreadsheet-like overview with all columns visible. The Kanban board organises tasks into swimlane columns by status -- useful for visualising flow and dragging tasks between stages.",
      },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    color: "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300",
    items: [
      {
        q: "What is an agent in Darshan?",
        a: "An agent is a participant in your project -- either an AI Agent (like Mithran or Komal) or a Human team member. Agents are registered in the Agent Registry, belong to an organisation, and can be assigned tasks and added to project teams.",
      },
      {
        q: "What are the two agent types?",
        a: "AI Agent: an autonomous AI that receives tasks via its inbox, processes them, and reports back. Human: a human team member managed through Darshan who acts manually.",
      },
      {
        q: "How does an AI agent receive and act on tasks?",
        a: "When you assign a task to an AI agent in Darshan, the system writes a task_assigned item to the agent inbox. The agent polls this inbox on a heartbeat cycle, reads the task, moves status to in-progress, does the work, and updates to review or done when complete.",
      },
      {
        q: "How do I onboard a new agent?",
        a: "Go to the Agents page and click New Agent. Choose the organisation, set the name, type (AI Agent or Human), model, provider, and capabilities. For AI agents, select the connection type: OpenClaw poll-based, Webhook, or Manual.",
      },
      {
        q: "What is the ping feature?",
        a: "Ping sends a test message to an agent's inbox and measures round-trip latency. It confirms the agent is actively polling and able to respond. Ping any agent from the Agents page or from the agent detail panel.",
      },
      {
        q: "What does the agent status (Online/Offline) mean?",
        a: "Online means the agent has polled its inbox recently. Offline means it has not been seen for a while. For AI agents running on OpenClaw, status updates automatically each time the agent polls.",
      },
    ],
  },
  {
    id: "organisations",
    label: "Organisations",
    color: "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    items: [
      {
        q: "What is an organisation in Darshan?",
        a: "An organisation groups agents under a common entity -- your own team (Own), a partner company, a client, or a vendor. Each agent belongs to one org. Orgs help manage access, relationships, and cross-team collaboration.",
      },
      {
        q: "What are the organisation relationship types?",
        a: "Own: your primary organisation. Partner: collaborating org with shared access. Client: an org you are delivering work for. Vendor: an external provider.",
      },
      {
        q: "How does org membership work?",
        a: "Each agent can be a member of an org with a role: Owner (full control), Admin (can edit and manage members), or Member (view only). Only owners and admins can edit org settings, add/remove members, or archive the org.",
      },
      {
        q: "Can an agent from one org work on another org's project?",
        a: "Yes. An agent's org defines who they belong to. Their project role (e.g. Coordinator, Developer, Reviewer) is defined in the project's Team tab. An agent can be a Coordinator on one project and a Reviewer on another, regardless of org.",
      },
    ],
  },
  {
    id: "platform",
    label: "Platform & Settings",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    items: [
      {
        q: "How do I edit a task title inline?",
        a: "Click directly on the task title in the table row -- it becomes an editable input. Press Enter or click away to save.",
      },
      {
        q: "Why does the task list update in real time?",
        a: "Darshan uses a WebSocket connection to push task changes (created, updated, deleted) to all connected browsers instantly -- no refresh needed.",
      },
      {
        q: "Is Darshan multi-tenant?",
        a: "Darshan is designed with a multi-org model. Each agent and project belongs to an organisation. Cross-org collaboration is supported via project team membership.",
      },
      {
        q: "How do I report a bug or request a feature?",
        a: "Create a task in the relevant project and assign it to Mithran. Mithran will pick it up on the next heartbeat, triage it, and dispatch it to the right agent. For urgent issues, message Mithran directly.",
      },
    ],
  },
];

function FAQItem({ q, a, defaultOpen = false }: { q: string; a: string; defaultOpen?: boolean }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className={cn(
      "overflow-hidden rounded-xl border transition-all",
      open
        ? "border-brand-200 bg-brand-50/50 dark:border-brand-500/20 dark:bg-brand-500/5"
        : "border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]"
    )}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-start gap-3 px-5 py-4 text-left"
      >
        <ChevronDown className={cn(
          "mt-0.5 h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200",
          open && "rotate-180 text-brand-600"
        )} />
        <span className={cn(
          "flex-1 text-sm font-semibold",
          open ? "text-brand-700 dark:text-brand-300" : "text-zinc-900 dark:text-white"
        )}>
          {q}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-4 pl-12">
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{a}</p>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<string | null>(null);

  const filtered = FAQ_CATEGORIES.map(cat => ({
    ...cat,
    items: cat.items.filter(item =>
      !query ||
      item.q.toLowerCase().includes(query.toLowerCase()) ||
      item.a.toLowerCase().includes(query.toLowerCase())
    ),
  })).filter(cat => {
    if (activeCategory && cat.id !== activeCategory) return false;
    return cat.items.length > 0;
  });

  const totalResults = filtered.reduce((s, c) => s + c.items.length, 0);
  const isFiltering = query || activeCategory;

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 dark:bg-brand-500/10">
          <HelpCircle className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Help &amp; FAQ</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Answers to common questions about Darshan</p>
        </div>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search questions..."
          className="w-full rounded-xl bg-zinc-100 py-3 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-white/10 dark:text-white"
        />
        {query && (
          <button onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-600">
            x
          </button>
        )}
      </div>

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
            !activeCategory
              ? "text-white"
              : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400"
          )}
          style={!activeCategory ? { backgroundColor: "#7C3AED" } : undefined}
        >
          All
        </button>
        {FAQ_CATEGORIES.map(cat => (
          <button key={cat.id}
            onClick={() => setActiveCategory(activeCategory === cat.id ? null : cat.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              activeCategory === cat.id ? "text-white" : cat.color
            )}
            style={activeCategory === cat.id ? { backgroundColor: "#7C3AED" } : undefined}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Results count */}
      {isFiltering && (
        <p className="text-xs text-zinc-400">
          {totalResults} result{totalResults !== 1 ? "s" : ""}{query ? ` for "${query}"` : ""}
        </p>
      )}

      {/* FAQ sections */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-zinc-200 py-14 text-center dark:border-white/10">
          <Search className="mx-auto mb-3 h-7 w-7 text-zinc-300" />
          <p className="font-display font-bold text-zinc-500">No results found</p>
          <p className="mt-1 text-xs text-zinc-400">Try a different search term or category</p>
        </div>
      ) : (
        filtered.map(cat => (
          <section key={cat.id}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", cat.color)}>
                {cat.label}
              </span>
              <span className="text-xs text-zinc-400">
                {cat.items.length} question{cat.items.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {cat.items.map((item, i) => (
                <FAQItem key={i} q={item.q} a={item.a} defaultOpen={!!(query && i === 0)} />
              ))}
            </div>
          </section>
        ))
      )}

      {/* Contact cards */}
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-100 dark:bg-brand-500/10">
            <MessageCircle className="h-4 w-4 text-brand-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Ask Mithran</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Create a task and assign it to Mithran for any question or issue. Picked up on the next heartbeat.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-[#2D2A45] dark:bg-[#16132A]">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-100 dark:bg-sky-500/10">
            <Mail className="h-4 w-4 text-sky-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">Email Support</p>
            <p className="mt-0.5 text-xs text-zinc-500">
              <a href="mailto:support@darshan.caringgems.in" className="text-sky-600 hover:underline">
                support@darshan.caringgems.in
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
