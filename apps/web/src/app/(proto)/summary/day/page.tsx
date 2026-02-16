"use client";

import * as React from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  MessageSquareText,
  ShieldAlert,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

const EVENTS = [
  {
    at: "09:18",
    source: "Support",
    kind: "message",
    title: "New customer report: attendance missing",
    detail: "Thread #1842 opened (priority high).",
  },
  {
    at: "09:19",
    source: "System",
    kind: "error",
    title: "Ingestion lag spiked",
    detail: "p95 12.4s • worker ingest-2 restarted",
  },
  {
    at: "09:21",
    source: "Agent: Mira",
    kind: "task",
    title: "Hotfix prepared",
    detail: "Timezone normalization double-applied for subset of sessions.",
  },
  {
    at: "10:02",
    source: "Operator",
    kind: "message",
    title: "Approval requested",
    detail: "Deploy confirmation required before backfill.",
  },
  {
    at: "11:44",
    source: "Pipeline",
    kind: "error",
    title: "calendar_fetch timeout",
    detail: "p95 4.8s • fallback recommended",
  },
] as const;

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "neutral" | "brand" | "warning" | "success";
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {label}
          </div>
          <div className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100">
            {value}
          </div>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-slate-800">
          <Icon className="h-5 w-5" aria-hidden />
        </div>
      </div>
      <div className="mt-2">
        <Badge tone={tone}>today</Badge>
      </div>
    </div>
  );
}

export default function DaySummaryPage() {
  const [date, setDate] = React.useState("2026-02-16");
  const [compare, setCompare] = React.useState<string[]>(["2026-02-15"]);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Summary / Day
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Day Summary
          </h1>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Activity breakdown, comparisons, and timeline of key events.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" aria-label="Previous day">
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>

          <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
            <Calendar className="h-4 w-4 text-slate-500 dark:text-slate-300" aria-hidden />
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              <span className="sr-only">Select date</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-[160px] bg-transparent shadow-none ring-0 focus-visible:ring-0"
              />
            </label>
          </div>

          <Button variant="secondary" size="sm" aria-label="Next day">
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Messages"
          value="1,842"
          icon={MessageSquareText}
          tone="brand"
        />
        <Metric label="Tasks completed" value="44" icon={Wrench} tone="success" />
        <Metric label="Errors" value="3" icon={ShieldAlert} tone="warning" />
        <Metric label="Attendance" value="7h 12m" icon={Clock} tone="neutral" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activity breakdown</CardTitle>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Where time and messages went (placeholder)
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3">
              {[
                { label: "Support replies", pct: 52, tone: "bg-[rgb(var(--accent-600))]" },
                { label: "Approvals", pct: 18, tone: "bg-amber-400" },
                { label: "Investigations", pct: 22, tone: "bg-slate-400" },
                { label: "Admin", pct: 8, tone: "bg-emerald-500" },
              ].map((r) => (
                <div key={r.label} className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {r.label}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {r.pct}%
                    </div>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-white ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
                    <div className={cn("h-2 rounded-full", r.tone)} style={{ width: `${r.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Compare days</CardTitle>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Select additional days to overlay metrics (prototype)
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                "2026-02-15",
                "2026-02-14",
                "2026-02-13",
                "2026-02-12",
              ].map((d) => {
                const checked = compare.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() =>
                      setCompare((cur) =>
                        checked ? cur.filter((x) => x !== d) : [...cur, d]
                      )
                    }
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl bg-white p-4 ring-1 ring-line transition",
                      "hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
                      "dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                    )}
                    aria-pressed={checked}
                  >
                    <div>
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {d}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Messages, tasks, errors, hours
                      </div>
                    </div>
                    <Badge tone={checked ? "brand" : "neutral"}>
                      {checked ? "selected" : "add"}
                    </Badge>
                  </button>
                );
              })}

              {compare.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400">
                  No comparison days selected.
                </div>
              ) : (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Selected: <span className="font-semibold">{compare.join(", ")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Key events throughout the day (placeholder)
          </div>
        </CardHeader>
        <CardContent>
          <ol className="space-y-4" aria-label="Event timeline">
            {EVENTS.map((e, idx) => (
              <li key={idx} className="flex gap-3">
                <div className="mt-1 flex w-16 shrink-0 flex-col items-end">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {e.at}
                  </div>
                  <div className="mt-2 h-full w-px bg-slate-200 dark:bg-slate-800" aria-hidden />
                </div>

                <div className="min-w-0 flex-1 rounded-2xl bg-white p-4 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {e.source}
                      </div>
                      <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                        {e.title}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {e.detail}
                      </div>
                    </div>
                    <Badge
                      tone={
                        e.kind === "error"
                          ? "warning"
                          : e.kind === "task"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {e.kind}
                    </Badge>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
