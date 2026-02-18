"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchAgents, type ApiAgent } from "@/lib/api";
import { formatDateShort, formatRelativeTime } from "@/lib/time";

function statusTone(status: ApiAgent["status"]) {
  if (status === "online") return "success" as const;
  if (status === "away") return "warning" as const;
  return "neutral" as const;
}

export default function AgentsPage() {
  const [agents, setAgents] = React.useState<ApiAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchAgents()
      .then((res) => setAgents(res.agents))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Agents</CardTitle>
              <div className="mt-1 text-xs text-muted">
                MithranLabs team directory
              </div>
            </div>
            <Button variant="primary" size="sm">
              Create agent
            </Button>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="py-8 text-center text-sm text-muted">
                Loading agents…
              </div>
            )}
            {error && (
              <div className="py-8 text-center text-sm text-red-500">
                {error}
              </div>
            )}
            {!loading && !error && agents.length === 0 && (
              <div className="py-8 text-center text-sm text-muted">
                No agents found.
              </div>
            )}
            {!loading && !error && agents.length > 0 && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {agents.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-2xl bg-white p-4 ring-1 ring-line hover:bg-slate-50 dark:bg-slate-950 dark:ring-slate-800 dark:hover:bg-slate-900/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{a.name}</div>
                        <div className="mt-1 text-xs text-muted">{a.desc}</div>
                        {a.last_profile_update_at && (
                          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              Profile last updated
                            </span>
                            :{" "}
                            {formatRelativeTime(a.last_profile_update_at)} •{" "}
                            {formatDateShort(a.last_profile_update_at)}
                          </div>
                        )}
                      </div>
                      <Badge tone={statusTone(a.status)}>{a.status}</Badge>
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
            )}
          </CardContent>
        </Card>
      </div>

      <div className="col-span-12 lg:col-span-4">
        <Card>
          <CardHeader>
            <CardTitle>Online now</CardTitle>
          </CardHeader>
          <CardContent>
            {!loading && (
              <div className="space-y-2">
                {agents
                  .filter((a) => a.status === "online")
                  .map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <span className="inline-block h-2 w-2 rounded-full bg-green-500" />
                      <span className="font-medium">{a.name}</span>
                      <span className="text-muted">{a.desc}</span>
                    </div>
                  ))}
                {agents.filter((a) => a.status === "online").length === 0 && (
                  <div className="text-sm text-muted">No agents online.</div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
