"use client";

import * as React from "react";
import {
  ChevronDown,
  Clock,
  Copy,
  MessageSquareText,
  MoreHorizontal,
  ShieldAlert,
  Terminal,
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

type ConversationItem =
  | {
      kind: "message";
      who: string;
      role: "agent" | "operator" | "system";
      at: string;
      text: string;
      tags?: Array<"handoff" | "decision" | "question">;
    }
  | {
      kind: "tool";
      who: string;
      at: string;
      toolName: string;
      input: string;
      output: string;
      status: "ok" | "error";
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

const CONVERSATION: ConversationItem[] = [
  {
    kind: "message",
    who: "Operator",
    role: "operator",
    at: "09:18",
    text: "Customer reports attendance data missing for Agent-12. Please investigate and patch if needed.",
    tags: ["question"],
  },
  {
    kind: "message",
    who: "Agent: Mira",
    role: "agent",
    at: "09:19",
    text: "Ack. I’ll pull the latest /attendance exports and correlate with ingestion logs.",
  },
  {
    kind: "tool",
    who: "Agent: Mira",
    at: "09:19",
    toolName: "attendance_export_fetch",
    input: "agent=Agent-12 date=2026-02-16",
    output: "Fetched 24 sessions. 5 sessions missing end timestamps.",
    status: "ok",
  },
  {
    kind: "message",
    who: "System",
    role: "system",
    at: "09:19",
    text: "Event: ingestion lag spiked (p95 12.4s) • worker=ingest-2 restarted",
  },
  {
    kind: "tool",
    who: "Agent: Kaito",
    at: "09:20",
    toolName: "ingestion_log_query",
    input: "pipeline=attendance since=09:00",
    output: "Found duplicate timezone-normalization step invoked for shard=eu-1.",
    status: "ok",
  },
  {
    kind: "message",
    who: "Agent: Kaito",
    role: "agent",
    at: "09:20",
    text: "I see normalization running twice for shard eu-1. This likely shifts a subset out of the export window.",
    tags: ["decision"],
  },
  {
    kind: "message",
    who: "Agent: Mira",
    role: "agent",
    at: "09:21",
    text: "Confirmed. Preparing hotfix + backfill plan: (1) guard double-normalization, (2) reprocess affected sessions.",
    tags: ["handoff"],
  },
  {
    kind: "tool",
    who: "Agent: Mira",
    at: "09:26",
    toolName: "backfill_dry_run",
    input: "scope=affected_sessions shard=eu-1",
    output: "Dry run: 128 sessions will be updated. No conflicts detected.",
    status: "ok",
  },
  {
    kind: "message",
    who: "Operator",
    role: "operator",
    at: "09:28",
    text: "Proceed with hotfix. Decision: ship patch now; run backfill after deploy. Also generate one-off report for support.",
    tags: ["decision"],
  },
  {
    kind: "tool",
    who: "Agent: Mira",
    at: "09:31",
    toolName: "deploy_request",
    input: "service=attendance-normalizer env=prod",
    output: "Deploy queued. Awaiting approval.",
    status: "error",
  },
  {
    kind: "message",
    who: "Agent: Mira",
    role: "agent",
    at: "09:32",
    text: "Deploy is queued but blocked on approval. Can someone from Ops approve?",
    tags: ["question"],
  },
] as const;

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

function ConversationBubble({ item }: { item: ConversationItem }) {
  if (item.kind === "tool") {
    return (
      <div className="flex gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white dark:bg-slate-800">
          <Terminal className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {item.who}
            </div>
            <div className="text-xs text-slate-400">•</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">{item.at}</div>
            <Badge tone={item.status === "ok" ? "success" : "warning"}>
              tool
            </Badge>
            <Badge tone="neutral">{item.toolName}</Badge>
          </div>

          <div className="mt-2 overflow-hidden rounded-2xl bg-white ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
            <div className="border-b border-line px-4 py-3 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
              Tool call
            </div>
            <div className="grid gap-3 px-4 py-3 text-sm">
              <div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Input
                </div>
                <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:ring-slate-800">
                  {item.input}
                </pre>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Output
                </div>
                <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200 dark:bg-slate-900/40 dark:text-slate-200 dark:ring-slate-800">
                  {item.output}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const avatar = item.role === "system" ? "S" : item.who.slice(0, 1).toUpperCase();
  const avatarBg =
    item.role === "operator"
      ? "bg-[rgb(var(--accent-600))]"
      : item.role === "system"
        ? "bg-slate-900 dark:bg-slate-800"
        : "bg-white dark:bg-slate-950";
  const avatarRing =
    item.role === "agent"
      ? "ring-line dark:ring-slate-800"
      : "ring-transparent";
  const avatarText = item.role === "agent" ? "text-slate-700 dark:text-slate-200" : "text-white";

  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1",
          avatarBg,
          avatarRing,
          avatarText
        )}
        aria-hidden
      >
        <span className="text-xs font-semibold">{avatar}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {item.who}
          </div>
          <div className="text-xs text-slate-400">•</div>
          <div className="text-xs text-slate-500 dark:text-slate-400">{item.at}</div>
          {item.tags?.includes("handoff") && <Badge tone="brand">handoff</Badge>}
          {item.tags?.includes("decision") && <Badge tone="success">decision</Badge>}
          {item.tags?.includes("question") && <Badge tone="warning">question</Badge>}
        </div>

        <div className="mt-2 rounded-2xl bg-white p-4 text-sm text-slate-800 ring-1 ring-line shadow-softSm dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800">
          {item.text}
        </div>
      </div>
    </div>
  );
}

export default function InspectPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const [expanded, setExpanded] = React.useState<Record<number, boolean>>({ 0: true });

  const [notes, setNotes] = React.useState(
    [
      {
        who: "Operator",
        when: "just now",
        text: "Review: confirm we send report + ETA to support after approval.",
      },
    ]
  );
  const [newNote, setNewNote] = React.useState("");

  function toggle(i: number) {
    setExpanded((cur) => ({ ...cur, [i]: !cur[i] }));
  }

  function addNote() {
    const t = newNote.trim();
    if (!t) return;
    setNotes((cur) => [{ who: "Operator", when: "just now", text: t }, ...cur]);
    setNewNote("");
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
                  Review how agents collaborated: dialogue, tool calls, handoffs, and decisions.
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

          <Card>
            <CardHeader>
              <CardTitle>Agent conversation</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Chat transcript with tool calls and explicit decisions
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                {CONVERSATION.map((item, idx) => (
                  <ConversationBubble key={idx} item={item} />
                ))}
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
              <CardTitle>Review notes</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Optional reviewer notes (separate from the transcript)
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note for reviewers…"
                  aria-label="Add review note"
                />
                <Button variant="primary" onClick={addNote}>
                  Add
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {notes.map((c, idx) => (
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
                          aria-label="Note actions"
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
                  { k: "Participants", v: "Operator, Mira, Kaito, System" },
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
