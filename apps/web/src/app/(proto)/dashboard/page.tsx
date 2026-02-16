"use client";

import * as React from "react";
import {
  CheckCircle2,
  FileWarning,
  Info,
  MessageCirclePlus,
  Play,
  Send,
  ShieldAlert,
  Smile,
  Sparkles,
  Terminal,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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

function CommentPopover({
  open,
  onClose,
  initialText,
}: {
  open: boolean;
  onClose: () => void;
  initialText: string;
}) {
  const [value, setValue] = React.useState("");

  React.useEffect(() => {
    if (open) setValue("");
  }, [open]);

  if (!open) return null;

  return (
    <div className="absolute right-2 top-full z-20 mt-2 w-[360px] rounded-2xl bg-white p-3 shadow-soft ring-1 ring-line">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-800">Add Comment</div>
        <button
          onClick={onClose}
          className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-50 hover:text-slate-700"
        >
          Close
        </button>
      </div>

      <div className="mt-2 rounded-2xl bg-slate-50 p-3 text-[12px] leading-relaxed text-slate-700 ring-1 ring-slate-200">
        <div className="text-[11px] font-semibold text-slate-500">Context</div>
        <div className="mt-1 line-clamp-3">{initialText}</div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <div className="text-[11px] font-semibold text-slate-500">Reactions</div>
        {["👍", "✅", "👀", "🔥", "❓"].map((e) => (
          <button
            key={e}
            className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs ring-1 ring-line hover:bg-slate-50"
            onClick={() => setValue((v) => (v ? `${v} ${e}` : e))}
            title={`Add ${e}`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Write a note for the thread…"
          />
        </div>
        <Button
          variant="primary"
          className="shrink-0"
          onClick={onClose}
          title="Send"
        >
          <Send className="h-4 w-4" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
        <span>Enter to send • Shift+Enter for newline</span>
        <span className="inline-flex items-center gap-1">
          <Smile className="h-3.5 w-3.5" /> emoji
        </span>
      </div>
    </div>
  );
}

function Bubble({
  type,
  who,
  when,
  text,
  id,
  onComment,
  commentOpen,
}: (typeof THREAD)[number] & {
  id: string;
  onComment: () => void;
  commentOpen: boolean;
}) {
  const isSystem = type === "system";
  const isOperator = type === "operator";

  return (
    <div className="group relative flex gap-3">
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
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2">
            <div className="truncate text-sm font-semibold text-slate-900">
              {who}
            </div>
            <div className="text-xs text-muted">{when}</div>
            {isSystem && <Badge tone="neutral">event</Badge>}
            {type === "agent" && <Badge tone="brand">agent</Badge>}
          </div>

          <div className="opacity-0 transition group-hover:opacity-100">
            {!isSystem && (
              <button
                onClick={onComment}
                className={cn(
                  "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs",
                  "bg-white shadow-softSm ring-1 ring-line hover:bg-slate-50"
                )}
              >
                <MessageCirclePlus className="h-4 w-4 text-slate-500" />
                Add Comment
              </button>
            )}
          </div>
        </div>

        <div
          className={cn(
            "mt-2 rounded-2xl p-4 text-sm leading-relaxed ring-1 shadow-softSm",
            isSystem
              ? "bg-slate-950 text-slate-100 ring-slate-900/60"
              : isOperator
                ? "bg-brand-50 text-slate-800 ring-brand-100"
                : "bg-white text-slate-800 ring-line"
          )}
          id={id}
        >
          {text}
        </div>

        <CommentPopover
          open={commentOpen}
          onClose={onComment}
          initialText={text}
        />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [openCommentId, setOpenCommentId] = React.useState<string | null>(null);

  return (
    <div className="grid h-full min-h-0 grid-cols-12 gap-4">
      {/* Center: document-style thread */}
      <div className="col-span-12 flex min-h-0 flex-col gap-4 lg:col-span-7">
        <Card className="min-h-0 overflow-hidden">
          <div className="border-b border-line bg-white">
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-500">
                    Threads / Support
                  </div>
                  <div className="mt-1 truncate text-base font-semibold tracking-tight text-slate-900">
                    Attendance export mismatch
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">
                      #1842
                    </span>
                    <span>Priority: High</span>
                    <span>•</span>
                    <span>SLA: 42m</span>
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
              </div>

              {/* Toolbar */}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge tone="brand">Live</Badge>
                  <span className="text-xs text-slate-500">
                    Last update: 12s ago
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="ghost">
                    Export
                  </Button>
                  <Button size="sm" variant="secondary">
                    Add watcher
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <CardContent className="min-h-0 bg-bg">
            <div className="grid grid-cols-1 gap-4 p-1">
              {/* Clean content area */}
              <div className="rounded-2xl bg-white shadow-softSm ring-1 ring-line">
                <div className="border-b border-line px-5 py-4">
                  <div className="text-sm font-semibold">Conversation</div>
                  <div className="mt-1 text-xs text-muted">
                    Operator ↔ Agent ↔ System events
                  </div>
                </div>

                <div className="h-[470px] overflow-auto px-5 py-5">
                  <div className="flex flex-col gap-6">
                    {THREAD.map((m, i) => {
                      const id = `m-${i}`;
                      return (
                        <Bubble
                          key={id}
                          id={id}
                          {...m}
                          commentOpen={openCommentId === id}
                          onComment={() =>
                            setOpenCommentId((cur) => (cur === id ? null : id))
                          }
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="border-t border-line px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Input placeholder="Reply as operator…" />
                    <Button variant="primary">
                      <Send className="h-4 w-4" />
                      Send
                    </Button>
                  </div>
                  <div className="mt-2 text-[11px] text-slate-400">
                    Tip: Hover any message to add a comment and quick reactions.
                  </div>
                </div>
              </div>
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
