import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const PROJECTS = [
  {
    id: "p-attendance",
    name: "Attendance Reliability",
    description: "Reduce export mismatches; improve ingestion and normalization checks.",
    agents: ["Mira", "Kaito"],
    status: "active" as const,
    progress: 62,
    threadId: "1842",
  },
  {
    id: "p-inbox",
    name: "Inbox UX v2",
    description: "Needs Attention queue: tabs, unread indicators, overflow actions.",
    agents: ["Anya"],
    status: "review" as const,
    progress: 84,
    threadId: "1837",
  },
  {
    id: "p-a11y",
    name: "Accessibility Pass",
    description: "WCAG AA: focus rings, contrast, keyboard flows, reduced motion.",
    agents: ["Nia", "Darshan"],
    status: "planned" as const,
    progress: 28,
    threadId: "1841",
  },
] as const;

function StatusBadge({ status }: { status: (typeof PROJECTS)[number]["status"] }) {
  if (status === "active") return <Badge tone="brand">active</Badge>;
  if (status === "review") return <Badge tone="warning">review</Badge>;
  return <Badge tone="neutral">planned</Badge>;
}

export default function ProjectsPage() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Projects</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Portfolio view (prototype)
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary">
                Filter
              </Button>
              <Button size="sm" variant="primary">
                New project
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {PROJECTS.map((p) => (
                <div
                  key={p.id}
                  className="rounded-2xl bg-white p-4 ring-1 ring-line shadow-softSm transition hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {p.name}
                        </div>
                        <StatusBadge status={p.status} />
                      </div>
                      <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                        {p.description}
                      </div>
                    </div>

                    <div className="shrink-0">
                      <Badge tone="neutral">{p.progress}%</Badge>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>Progress</span>
                      <span>{p.progress}%</span>
                    </div>
                    <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className={cn(
                          "h-2 rounded-full",
                          "bg-[rgb(var(--accent-600))]"
                        )}
                        style={{ width: `${p.progress}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Assigned
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {p.agents.map((a) => (
                          <span
                            key={a}
                            className="inline-flex h-9 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                          >
                            {a}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <ButtonLink
                        href={`/inspect/${p.threadId}`}
                        size="sm"
                        variant="ghost"
                      >
                        View threads
                      </ButtonLink>
                      <Button size="sm" variant="secondary">
                        Details
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 text-xs text-slate-500 dark:text-slate-400">
              Clicking “View threads” opens an Inspection-style detail view.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
