"use client";

import * as React from "react";
import {
  ChevronDown,
  Clock,
  Copy,
  MessageSquareText,
  MoreHorizontal,
  ShieldAlert,
  User,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";

type TimelineEvent = {
  at: string;
  source: string;
  kind: "message" | "task" | "error" | "system";
  title: string;
  detail: string;
};

const SAMPLE_EVENTS: TimelineEvent[] = [
  {
    at: "09:18",
    source: "Support",
    kind: "message",
    title: "Customer report received",
    detail: "Attendance data missing for Agent-12.",
  },
  {
    at: "09:19",
    source: "System",
    kind: "system",
    title: "Ingestion lag spike",
    detail: "p95 12.4s • worker ingest-2 restarted",
  },
  {
    at: "09:21",
    source: "Agent: Mira",
    kind: "task",
    title: "Investigation update",
    detail: "Mismatch due to timezone normalization applied twice.",
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
];

function KindBadge({ kind }: { kind: TimelineEvent["kind"] }) {
  if (kind === "error") return <Badge tone="warning">error</Badge>;
  if (kind === "task") return <Badge tone="success">task</Badge>;
  if (kind === "message") return <Badge tone="neutral">message</Badge>;
  return <Badge tone="brand">system</Badge>;
}

function EventIcon({ kind }: { kind: TimelineEvent["kind"] }) {
  const klass = "h-4 w-4";
  if (kind === "error") return <ShieldAlert className={klass} aria-hidden />;
  if (kind === "task") return <Wrench className={klass} aria-hidden />;
  if (kind === "message") return <MessageSquareText className={klass} aria-hidden />;
  return <Clock className={klass} aria-hidden />;
}

export default function InspectPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({ 0: true });
  const [comments, setComments] = React.useState(
    [
      {
        who: "Mira",
        when: "12m ago",
        text: "Confirmed double-normalization on subset of sessions. Hotfix ready; needs approval.",
      },
      {
        who: "Nia",
        when: "8m ago",
        text: "Support asked for one-off report. We should attach affected agent list + ETA.",
      },
    ]
  );
  const [newComment, setNewComment] = React.useState("");

  function toggle(i: number) {
    setExpanded((cur) => ({ ...cur, [i]: !cur[i] }));
  }

  function addComment() {
    const t = newComment.trim();
    if (!t) return;
    setComments((cur) => [
      { who: "Operator", when: "just now", text: t },
      ...cur,
    ]);
    setNewComment("");
  }

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-4">
      {/* Main */}
      <div className="col-span-12 min-h-0 lg:col-span-8">
        <div className="flex min-h-0 flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Inspect
                </div>
                <CardTitle>
                  Thread / Run / Task <span className="text-slate-400">#{id}</span>
                </CardTitle>
                <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  Detailed event timeline and agent notes.
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    try {
                      navigator.clipboard.writeText(id);
                    } catch {}
                  }}
                >
                  <Copy className="h-4 w-4" aria-hidden /> Copy ID
                </Button>
                <Button size="sm" variant="primary">
                  Resolve
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warning">needs review</Badge>
                <Badge tone="neutral">priority: high</Badge>
                <Badge tone="neutral">sla: 42m</Badge>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800">
                <div className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Summary
                </div>
                <div className="mt-1 text-sm text-slate-900 dark:text-slate-100">
                  Attendance export mismatch flagged; investigate normalization and backfill affected sessions.
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 flex-1">
            <CardHeader>
              <CardTitle>Event timeline</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Expand items to see full details
              </div>
            </CardHeader>
            <CardContent className="min-h-0">
              <ol className="space-y-2" aria-label="Event timeline">
                {SAMPLE_EVENTS.map((e, i) => {
                  const open = !!expanded[i];
                  return (
                    <li
                      key={i}
                      className="rounded-2xl bg-white ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        className={cn(
                          "flex w-full items-start justify-between gap-3 p-4 text-left",
                          "hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
                          "dark:hover:bg-slate-900/40"
                        )}
                        aria-expanded={open}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-slate-800">
                            <EventIcon kind={e.kind} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                                {e.source}
                              </div>
                              <div className="text-xs text-slate-400">•</div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {e.at}
                              </div>
                              <KindBadge kind={e.kind} />
                            </div>
                            <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                              {e.title}
                            </div>
                          </div>
                        </div>
                        <ChevronDown
                          className={cn(
                            "mt-2 h-4 w-4 text-slate-500 transition",
                            open && "rotate-180"
                          )}
                          aria-hidden
                        />
                      </button>
                      {open && (
                        <div className="border-t border-line px-4 pb-4 pt-3 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-200">
                          {e.detail}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Agent comments</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Notes/observations attached to this run
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add an observation…"
                  aria-label="Add agent comment"
                />
                <Button variant="primary" onClick={addComment}>
                  Add
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {comments.map((c, idx) => (
                  <div
                    key={idx}
                    className="rounded-2xl bg-white p-4 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-slate-800">
                          <User className="h-4 w-4" aria-hidden />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {c.who}
                          </div>
                          <div className="mt-1 text-sm text-slate-700 dark:text-slate-200">
                            {c.text}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-slate-400">{c.when}</div>
                        <button
                          type="button"
                          className={cn(
                            "inline-flex h-11 w-11 items-center justify-center rounded-xl",
                            "text-slate-500 hover:bg-slate-100 hover:text-slate-700",
                            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
                            "dark:text-slate-300 dark:hover:bg-slate-900/60 dark:hover:text-slate-100"
                          )}
                          aria-label="Comment actions"
                        >
                          <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Metadata sidebar */}
      <div className="col-span-12 min-h-0 lg:col-span-4">
        <div className="flex h-full min-h-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Participants, timing, outcome
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {[
                  { k: "Participants", v: "Operator, Mira, System" },
                  { k: "Started", v: "09:18" },
                  { k: "Duration", v: "2h 26m" },
                  { k: "Outcome", v: "Pending approval" },
                ].map((m) => (
                  <div
                    key={m.k}
                    className="rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:ring-slate-800"
                  >
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      {m.k}
                    </div>
                    <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {m.v}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <ButtonLink href="/threads" variant="secondary">
                  Back to threads
                </ButtonLink>
                <Button variant="ghost">Escalate</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
