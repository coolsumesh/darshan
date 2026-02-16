import { Calendar, ChevronLeft, ChevronRight, Clock, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/cn";

const AGENTS = [
  { name: "Mira", role: "Ops", status: "online" },
  { name: "Darshan", role: "Supervisor", status: "online" },
  { name: "Nia", role: "Support", status: "away" },
  { name: "Kaito", role: "Ops", status: "offline" },
  { name: "Anya", role: "QA", status: "online" },
] as const;

const SESSIONS = [
  {
    start: "09:04",
    end: "10:18",
    mode: "active",
    notes: "Triaged threads #1831–#1842",
  },
  {
    start: "10:18",
    end: "10:31",
    mode: "idle",
    notes: "Break / waiting on approvals",
  },
  {
    start: "10:31",
    end: "12:02",
    mode: "active",
    notes: "Backfill + report generation",
  },
  {
    start: "12:02",
    end: "12:24",
    mode: "away",
    notes: "Lunch",
  },
  {
    start: "12:24",
    end: "14:11",
    mode: "active",
    notes: "Customer follow-ups",
  },
] as const;

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "h-2.5 w-2.5 rounded-full",
        status === "online" && "bg-emerald-500",
        status === "away" && "bg-amber-500",
        status === "offline" && "bg-slate-300"
      )}
    />
  );
}

function TimelineBar() {
  // Lightweight visual: 24h lane with blocks aligned by %.
  // Hardcoded blocks for polish (not correctness).
  const blocks = [
    { left: 38, width: 18, tone: "active" },
    { left: 56, width: 3, tone: "idle" },
    { left: 59, width: 22, tone: "active" },
    { left: 81, width: 4, tone: "away" },
    { left: 85, width: 13, tone: "active" },
  ] as const;

  return (
    <div className="rounded-2xl bg-white p-4 shadow-softSm ring-1 ring-line">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Presence timeline</div>
          <div className="mt-1 text-xs text-muted">Agent: Mira • Local time</div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="success">6h 02m active</Badge>
          <Badge tone="neutral">43m idle</Badge>
          <Badge tone="warning">22m away</Badge>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-[11px] text-muted">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
        <div className="relative h-10 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,23,42,0.06)_1px,transparent_1px)] bg-[length:10%_100%]" />
          {blocks.map((b, idx) => (
            <div
              key={idx}
              className={cn(
                "absolute top-2 h-6 rounded-xl shadow-softSm",
                b.tone === "active" && "bg-brand-600",
                b.tone === "idle" && "bg-slate-400",
                b.tone === "away" && "bg-amber-400"
              )}
              style={{ left: `${b.left}%`, width: `${b.width}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-brand-600" /> active
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-slate-400" /> idle
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-amber-400" /> away
        </span>
      </div>
    </div>
  );
}

export default function AttendancePage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-4">
      {/* Left agent picker */}
      <div className="col-span-12 min-h-0 lg:col-span-3">
        <Card className="h-full min-h-0">
          <CardHeader>
            <CardTitle>Agents</CardTitle>
            <div className="mt-1 text-xs text-muted">Select an agent to inspect</div>
          </CardHeader>
          <CardContent className="min-h-0">
            <div className="flex h-[620px] flex-col gap-2 overflow-auto pr-2">
              {AGENTS.map((a) => (
                <div
                  key={a.name}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl p-3 ring-1 ring-line transition",
                    a.name === "Mira"
                      ? "bg-brand-50 ring-brand-100"
                      : "bg-white hover:bg-slate-50"
                  )}
                >
                  <div className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white">
                    {a.name.slice(0, 1)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-sm font-semibold">{a.name}</div>
                      <StatusDot status={a.status} />
                    </div>
                    <div className="truncate text-xs text-muted">{a.role}</div>
                  </div>
                  {a.name === "Mira" && <Badge tone="brand">selected</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Center report */}
      <div className="col-span-12 min-h-0 lg:col-span-6">
        <div className="flex h-full min-h-0 flex-col gap-4">
          <div className="rounded-2xl bg-white p-4 shadow-softSm ring-1 ring-line">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Attendance report</div>
                <div className="mt-1 text-xs text-muted">
                  Daily view • Computed from session activity
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                  <Calendar className="h-4 w-4 text-slate-500" />
                  <span className="font-medium">Feb 16, 2026</span>
                </div>
                <Button size="sm" variant="secondary">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <TimelineBar />

          <Card className="min-h-0 flex-1">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Sessions</CardTitle>
                <div className="mt-1 text-xs text-muted">Detailed time blocks</div>
              </div>
              <Badge tone="neutral">{SESSIONS.length} rows</Badge>
            </CardHeader>
            <CardContent className="min-h-0">
              <div className="overflow-auto rounded-2xl ring-1 ring-line">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-600">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold">Start</th>
                      <th className="px-4 py-3 text-left font-semibold">End</th>
                      <th className="px-4 py-3 text-left font-semibold">Mode</th>
                      <th className="px-4 py-3 text-left font-semibold">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SESSIONS.map((s, i) => (
                      <tr
                        key={i}
                        className="border-t border-line bg-white hover:bg-slate-50"
                      >
                        <td className="px-4 py-3 font-medium">{s.start}</td>
                        <td className="px-4 py-3 font-medium">{s.end}</td>
                        <td className="px-4 py-3">
                          <Badge
                            tone={
                              s.mode === "active"
                                ? "brand"
                                : s.mode === "idle"
                                  ? "neutral"
                                  : "warning"
                            }
                          >
                            {s.mode}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{s.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right summary */}
      <div className="col-span-12 min-h-0 lg:col-span-3">
        <div className="flex h-full min-h-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-muted">Active</div>
                  <div className="mt-1 text-2xl font-semibold">6h 02m</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-muted">Idle</div>
                  <div className="mt-1 text-2xl font-semibold">0h 43m</div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
                  <div className="text-xs text-muted">Away</div>
                  <div className="mt-1 text-2xl font-semibold">0h 22m</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="flex-1">
            <CardHeader>
              <CardTitle>Signals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-line">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">On-time start</span>
                  </div>
                  <Badge tone="success">yes</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-line">
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-slate-500" />
                    <span className="font-medium">Collaboration</span>
                  </div>
                  <Badge tone="brand">high</Badge>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-white p-3 ring-1 ring-line">
                  <div className="text-sm font-medium">Anomalies</div>
                  <Badge tone="warning">2</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
