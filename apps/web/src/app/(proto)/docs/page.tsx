"use client";
import { FileText, BookOpen, Cpu, Rocket, ArrowRight } from "lucide-react";
import Link from "next/link";

const SECTIONS = [
  { href: "/docs/getting-started", icon: Rocket,   title: "Getting Started", desc: "From zero to a working agent in 7 steps — orgs, projects, tasks, inbox."  },
  { href: "/docs/agents",          icon: BookOpen, title: "Agents Guide",    desc: "Inbox protocol, task lifecycle, security tokens, and OpenClaw setup."       },
  { href: "/docs/api",             icon: Cpu,      title: "API Reference",   desc: "All REST endpoints — auth, projects, tasks, agents, orgs, and invites."     },
];

export default function DocsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-zinc-100 dark:bg-white/10">
          <FileText className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Documentation</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Guides and reference for building with Darshan</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ href, icon: Icon, title, desc }) => (
          <Link key={href} href={href}
            className="flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:border-brand-300 hover:shadow-sm dark:border-[#2D2A45] dark:bg-[#16132A] dark:hover:border-brand-500/40">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-100 dark:bg-white/10">
              <Icon className="h-5 w-5 text-zinc-600 dark:text-zinc-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-display text-sm font-bold text-zinc-900 dark:text-white">{title}</span>
                <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
              </div>
              <p className="mt-1 text-xs text-zinc-500">{desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
