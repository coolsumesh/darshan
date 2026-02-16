import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AGENTS } from "@/lib/agents";
import { formatDateShort, formatRelativeTime } from "@/lib/time";

export default function AgentsPage() {
  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Agents</CardTitle>
              <div className="mt-1 text-xs text-muted">
                Directory + quick controls (prototype)
              </div>
            </div>
            <Button variant="primary" size="sm">
              Create agent
            </Button>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {AGENTS.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl bg-white p-4 ring-1 ring-line hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold">{a.name}</div>
                      <div className="mt-1 text-xs text-muted">{a.desc}</div>
                      <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-600 dark:text-slate-300">
                          Profile last updated
                        </span>
                        : {formatRelativeTime(a.lastProfileUpdateAt)} • {formatDateShort(a.lastProfileUpdateAt)}
                      </div>
                    </div>
                    <Badge
                      tone={
                        a.status === "online"
                          ? "success"
                          : a.status === "away"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {a.status}
                    </Badge>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary">
                      Inspect
                    </Button>
                    <Button size="sm" variant="ghost">
                      Ping
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="col-span-12 lg:col-span-4">
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-slate-700 dark:text-slate-200">
              This section is a placeholder to make navigation feel real.
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
