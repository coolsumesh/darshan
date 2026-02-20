"use client";

import Link from "next/link";
import { HelpCircle, MessageCircle, FileQuestion } from "lucide-react";

export default function HelpPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-100 dark:bg-brand-500/10">
          <HelpCircle className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Help &amp; Support</h1>
          <p className="mt-0.5 text-xs text-zinc-500">Find answers and get assistance</p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/help/faq"
          className="flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 transition-colors hover:border-brand-300 hover:bg-brand-50/30 dark:border-[#2D2A45] dark:bg-[#16132A] dark:hover:border-brand-500/30">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 dark:bg-brand-500/10">
            <FileQuestion className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <p className="font-display font-bold text-zinc-900 dark:text-white">FAQ</p>
            <p className="mt-1 text-sm text-zinc-500">Frequently asked questions about projects, agents, orgs, and the platform.</p>
          </div>
        </Link>

        <div className="flex items-start gap-4 rounded-2xl border border-zinc-200 bg-white p-5 dark:border-[#2D2A45] dark:bg-[#16132A]">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-sky-100 dark:bg-sky-500/10">
            <MessageCircle className="h-5 w-5 text-sky-600" />
          </div>
          <div>
            <p className="font-display font-bold text-zinc-900 dark:text-white">Ask Mithran</p>
            <p className="mt-1 text-sm text-zinc-500">Create a task and assign it to Mithran. Picked up on the next heartbeat cycle.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
