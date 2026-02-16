import {
  CheckCircle2,
  FileWarning,
  Info,
  Play,
  ShieldAlert,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const THREAD = [
  {
    type: "operator",
    who: "Operator",
    when: "09:18",
    text: "Customer reports attendance data missing for Agent-12. Investigate and patch if needed.",
  },
  {
    type: "agent",
    who: "Agent: Mira",
    when: "09:19",
    text: "Acknowledged. Pulling latest /attendance exports and correlating with ingestion logs.",
  },
  {
    type: "system",
    who: "System",
    when: "09:19",
    text: "Event: ingestion lag spiked (p95 12.4s) • worker=ingest-2 restarted",
  },
  {
    type: "agent",
    who: "Agent: Mira",
    when: "09:21",
    text: "Found mismatch: timezone normalization applied twice for a subset of sessions. Preparing hotfix + backfill.",
  },
  {
    type: "operator",
    who: "Operator",
    when: "09:22",
    text: "Proceed. Include a one-off report for affected agents and notify support.",
  },
] as const;

function Bubble({
  type,
  who,
  when,
  text,
}: (typeof THREAD)[number]) {
  const isSystem = type === "system";
  const isOperator = type === "operator";

  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 grid h-9 w-9 place-items-center rounded-2xl ring-1",
          isSystem
            ? "bg-slate-900 text-white ring-slate-900"
            : isOperator
              ? "bg-brand-600 text-white ring-brand-600"
              : "bg-white text-slate-700 ring-line"
        )}
      >
        {isSystem ? (
          <Terminal className="h-4 w-4" />
        ) : isOperator ? (
          <Sparkles className="h-4 w-4" />
        ) : (
          <Wrench className="h-4 w-4" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <div className="text-sm font-semibold text-slate-900">{who}</div>
          <div className="text-xs text-muted">{when}</div>
          {isSystem && <Badge tone="neutral">event</Badge>}
          {type === "agent" && <Badge tone="brand">agent</Badge>}
        </div>

        <div
          className={cn(
            "mt-2 rounded-2xl p-3 text-sm leading-relaxed ring-1",
            isSystem
              ? "bg-slate-950 text-slate-100 ring-slate-900/60"
              : isOperator
                ? "bg-brand-50 text-slate-800 ring-brand-100"
                : "bg-white text-slate-800 ring-line"
          )}
        >
          {text}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-4">
      {/* Center timeline */}
      <div className="col-span-12 flex min-h-0 flex-col gap-4 lg:col-span-7">
        <Card className="min-h-0">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Thread #1842 — Attendance export mismatch</CardTitle>
              <div className="mt-1 text-xs text-muted">
                Workspace: Support • Priority: High • SLA: 42m
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone="warning">needs review</Badge>
              <Button size="sm" variant="secondary">
                Assign
              </Button>
              <Button size="sm" variant="primary">
                Resolve
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0">
            <div className="flex h-[520px] flex-col gap-5 overflow-auto pr-2">
              {THREAD.map((m, i) => (
                <Bubble key={i} {...m} />
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Latency</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">124ms</div>
              <div className="mt-1 text-xs text-muted">p95 over last 15 min</div>
              <div className="mt-3 h-2 w-full rounded-full bg-slate-100">
                <div className="h-2 w-[62%] rounded-full bg-brand-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tool health</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>13 OK</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <FileWarning className="h-4 w-4 text-amber-600" />
                <span>2 degraded</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-sm">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <span>0 blocked</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Backlog</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">31</div>
              <div className="mt-1 text-xs text-muted">untriaged threads</div>
              <div className="mt-3 flex items-center gap-2">
                <Badge tone="brand">12 new</Badge>
                <Badge tone="warning">7 escalations</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right inspector */}
      <div className="col-span-12 min-h-0 lg:col-span-5">
        <div className="flex h-full min-h-0 flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div>
                <CardTitle>Inspector</CardTitle>
                <div className="mt-1 text-xs text-muted">
                  Context, actions, diagnostics
                </div>
              </div>
              <Badge tone="success">connected</Badge>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-muted">Agent</div>
                  <div className="mt-1 text-sm font-semibold">Mira</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-muted">Session</div>
                  <div className="mt-1 text-sm font-semibold">prod-us-east</div>
                </div>
                <div className="col-span-2 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-muted">Working memory</div>
                  <div className="mt-1 text-sm text-slate-800">
                    Investigate attendance export mismatch; patch + backfill; notify support.
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button variant="secondary">
                  <Play className="h-4 w-4" /> Run tool
                </Button>
                <Button variant="secondary">
                  <Info className="h-4 w-4" /> Add note
                </Button>
                <Button variant="ghost" className="col-span-2">
                  Escalate to on-call
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle>Diagnostics</CardTitle>
            </CardHeader>
            <CardContent className="min-h-0">
              <div className="flex h-full flex-col gap-3 overflow-auto pr-2">
                {[
                  {
                    title: "ingest-2 restarted",
                    meta: "k8s • 3m ago",
                    ok: true,
                  },
                  {
                    title: "attendance-normalizer drift",
                    meta: "pipeline • flagged",
                    ok: false,
                  },
                  {
                    title: "cache hit rate",
                    meta: "redis • 91%",
                    ok: true,
                  },
                  {
                    title: "tool: calendar_fetch",
                    meta: "timeout • p95 4.8s",
                    ok: false,
                  },
                ].map((d, i) => (
                  <div
                    key={i}
                    className={cn(
                      "rounded-2xl p-3 ring-1 transition",
                      d.ok
                        ? "bg-emerald-50 ring-emerald-200"
                        : "bg-amber-50 ring-amber-200"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-900">
                        {d.title}
                      </div>
                      <Badge tone={d.ok ? "success" : "warning"}>
                        {d.ok ? "ok" : "check"}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted">{d.meta}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
