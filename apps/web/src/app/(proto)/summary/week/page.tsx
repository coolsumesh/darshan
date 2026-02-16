import { BarChart3, Clock, MessageSquareText, ShieldAlert, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const METRICS = [
  { label: "Total messages", value: "12,483", icon: MessageSquareText },
  { label: "Tasks completed", value: "312", icon: Wrench },
  { label: "Errors", value: "18", icon: ShieldAlert },
  { label: "Attendance hours", value: "164h", icon: Clock },
] as const;

const AGENTS = [
  { name: "Mira", messages: 3920, tasks: 88, errors: 4, hours: 38.5 },
  { name: "Nia", messages: 2740, tasks: 64, errors: 6, hours: 35.0 },
  { name: "Kaito", messages: 2210, tasks: 73, errors: 2, hours: 33.0 },
  { name: "Anya", messages: 1950, tasks: 57, errors: 3, hours: 34.0 },
] as const;

function PlaceholderChart({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {subtitle}
          </div>
        </div>
        <Badge tone="neutral">placeholder</Badge>
      </div>

      <div className="mt-4 grid h-[160px] grid-cols-12 items-end gap-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
        {Array.from({ length: 12 }).map((_, i) => {
          const h = 20 + ((i * 17) % 110);
          return (
            <div
              key={i}
              className={cn(
                "w-full rounded-lg",
                "bg-[rgb(var(--accent-600))] opacity-85"
              )}
              style={{ height: `${h}px` }}
              aria-hidden
            />
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>Mon</span>
        <span>Sun</span>
      </div>
    </div>
  );
}

export default function WeekSummaryPage() {
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Summary / Week
          </div>
          <h1 className="mt-1 text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Week Summary
          </h1>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Aggregated performance across agents and queues.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm">
            Export
          </Button>
          <Button variant="primary" size="sm">
            Share
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {METRICS.map((m) => {
          const Icon = m.icon;
          return (
            <Card key={m.label}>
              <CardHeader className="flex flex-row items-start justify-between">
                <div>
                  <CardTitle>{m.label}</CardTitle>
                  <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Last 7 days
                  </div>
                </div>
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-slate-800">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">
                  {m.value}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  vs last week: <span className="font-semibold">+6%</span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PlaceholderChart
          title="Messages trend"
          subtitle="Daily messages across all threads"
        />
        <PlaceholderChart
          title="Errors trend"
          subtitle="System + tool errors per day"
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Per-agent breakdown</CardTitle>
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Messages, tasks, errors, and attendance hours
            </div>
          </div>
          <Badge tone="neutral">{AGENTS.length} agents</Badge>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto rounded-2xl ring-1 ring-line dark:ring-slate-800">
            <table className="min-w-full text-sm" aria-label="Per-agent breakdown">
              <thead className="bg-slate-50 text-xs text-slate-700 dark:bg-slate-900/40 dark:text-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Agent</th>
                  <th className="px-4 py-3 text-left font-semibold">Messages</th>
                  <th className="px-4 py-3 text-left font-semibold">Tasks</th>
                  <th className="px-4 py-3 text-left font-semibold">Errors</th>
                  <th className="px-4 py-3 text-left font-semibold">Hours</th>
                </tr>
              </thead>
              <tbody>
                {AGENTS.map((a) => (
                  <tr
                    key={a.name}
                    className="border-t border-line bg-white hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900/40"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-slate-800">
                          <span className="text-xs font-semibold">
                            {a.name.slice(0, 1)}
                          </span>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {a.name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">
                            Week total
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {a.messages.toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone="brand">{a.tasks}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={a.errors > 4 ? "warning" : "neutral"}>
                        {a.errors}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                      {a.hours.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Charts are placeholders for stakeholder review (data wiring TBD).
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
