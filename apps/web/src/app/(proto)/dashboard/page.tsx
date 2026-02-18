"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, MessageSquareText, ClipboardList, FolderKanban, Circle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fetchAgents, fetchThreads, type ApiAgent, type ApiThread } from "@/lib/api";

type DashStats = {
  agents: ApiAgent[];
  threads: ApiThread[];
};

export default function DashboardPage() {
  const [stats, setStats] = React.useState<DashStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    Promise.all([fetchAgents(), fetchThreads()])
      .then(([a, t]) => setStats({ agents: a.agents, threads: t.threads }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const onlineAgents = stats?.agents.filter((a) => a.status === "online") ?? [];
  const offlineAgents = stats?.agents.filter((a) => a.status !== "online") ?? [];

  return (
    <div className="flex flex-col gap-6">

      {/* Welcome */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Welcome, Sumesh</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          MithranLabs · Darshan Agent Platform
        </p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          {
            label: "Online Agents",
            value: loading ? "…" : String(onlineAgents.length),
            sub: `of ${stats?.agents.length ?? "…"} total`,
            icon: Bot,
            tone: "success" as const,
          },
          {
            label: "Threads",
            value: loading ? "…" : String(stats?.threads.length ?? 0),
            sub: "conversations",
            icon: MessageSquareText,
            tone: "brand" as const,
          },
          {
            label: "Tasks",
            value: "—",
            sub: "open items",
            icon: ClipboardList,
            tone: "neutral" as const,
          },
          {
            label: "Projects",
            value: "1",
            sub: "Darshan",
            icon: FolderKanban,
            tone: "neutral" as const,
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5 pb-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs text-muted font-medium">{s.label}</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-100">{s.value}</div>
                  <div className="mt-0.5 text-xs text-muted">{s.sub}</div>
                </div>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800">
                  <s.icon className="h-4 w-4 text-slate-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

        {/* Agent status */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>Agents</CardTitle>
            <Link href="/agents" className="text-xs text-brand-600 hover:underline dark:text-brand-400">
              View all →
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="py-6 text-center text-sm text-muted">Loading…</div>
            ) : (
              <div className="space-y-2">
                {stats?.agents.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 ring-1 ring-line bg-white dark:bg-slate-950 dark:ring-slate-800"
                  >
                    <div className="flex items-center gap-2.5">
                      <Circle
                        className={`h-2 w-2 fill-current ${
                          a.status === "online"
                            ? "text-emerald-500"
                            : "text-slate-300 dark:text-slate-600"
                        }`}
                      />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{a.name}</span>
                      <span className="text-xs text-muted">{(a as any).capabilities?.role ?? ""}</span>
                    </div>
                    <Badge tone={a.status === "online" ? "success" : "neutral"}>
                      {a.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Threads */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>Threads</CardTitle>
            <Link href="/threads" className="text-xs text-brand-600 hover:underline dark:text-brand-400">
              Open →
            </Link>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="py-6 text-center text-sm text-muted">Loading…</div>
            ) : stats?.threads.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted">
                No threads yet.{" "}
                <Link href="/threads" className="text-brand-600 hover:underline">
                  Start one →
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {stats?.threads.map((t) => (
                  <Link
                    key={t.id}
                    href="/threads"
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 ring-1 ring-line bg-white hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40 transition"
                  >
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {t.title ?? `Thread ${t.id.slice(0, 8)}`}
                    </span>
                    <Badge tone="neutral">{t.visibility}</Badge>
                  </Link>
                ))}
              </div>
            )}

            {/* Quick links */}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/threads"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ring-1 ring-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100 transition dark:bg-brand-500/10 dark:ring-brand-500/30 dark:text-brand-300"
              >
                <MessageSquareText className="h-4 w-4" />
                Chat with agents
              </Link>
              <Link
                href="/tasks"
                className="flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium ring-1 ring-line bg-white text-slate-700 hover:bg-slate-50 transition dark:bg-slate-950 dark:ring-slate-800 dark:text-slate-200"
              >
                <ClipboardList className="h-4 w-4" />
                View tasks
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Onboarding status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Team Onboarding</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
            {[
              { name: "Mithran ⚡", role: "Coordinator", live: true },
              { name: "Komal 🌸",   role: "Developer",   live: true },
              { name: "Anantha 🐍", role: "Systems Architect", live: false },
              { name: "Vishwakarma 🏗️", role: "DevOps", live: false },
              { name: "Ganesha 📝", role: "Technical Writer", live: false },
              { name: "Drishti 👁️", role: "Product Analyst", live: false },
              { name: "Lekha 🗄️",  role: "Database Specialist", live: false },
              { name: "Sanjaya 🎨", role: "Image Generation", live: false },
              { name: "Suraksha 🛡️", role: "Security Expert", live: false },
            ].map((m) => (
              <div
                key={m.name}
                className={`rounded-xl px-3 py-2.5 ring-1 ${
                  m.live
                    ? "ring-emerald-200 bg-emerald-50 dark:bg-emerald-500/10 dark:ring-emerald-500/30"
                    : "ring-line bg-white dark:bg-slate-950 dark:ring-slate-800"
                }`}
              >
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.name}</div>
                <div className="mt-0.5 text-xs text-muted">{m.role}</div>
                <div className={`mt-1.5 text-[11px] font-semibold ${m.live ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400"}`}>
                  {m.live ? "● Live" : "○ Not yet onboarded"}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
