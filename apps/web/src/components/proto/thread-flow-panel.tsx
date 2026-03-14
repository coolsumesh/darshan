"use client";

import * as React from "react";
import type { Thread, ThreadMessage, ThreadNextReply, ThreadParticipant } from "@/lib/api";

type GraphNode = {
  id: string;
  slug: string;
  x: number;
  y: number;
};

type GraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: "expected" | "unexpected";
  status: "pending" | "fulfilled";
  label: string;
};

const NODE_R = 22;

function mentionSlugs(body: string) {
  return Array.from(new Set((body.match(/@([A-Za-z0-9_]+)/g) ?? []).map((m) => m.slice(1).toUpperCase())));
}

function buildGraph(
  participants: ThreadParticipant[],
  messages: ThreadMessage[],
  nextReply: ThreadNextReply | null
) {
  const active = participants.filter((p) => !p.removed_at);
  const slugs = Array.from(new Set(active.map((p) => p.participant_slug.toUpperCase()))).sort();
  const messageById = new Map(messages.map((m) => [m.message_id, m]));

  // Expected edges from mentions in each message
  const expected = new Map<string, GraphEdge>();
  for (const m of messages) {
    const from = m.sender_slug.toUpperCase();
    const mentions = mentionSlugs(m.body).filter((s) => s !== from && slugs.includes(s));
    for (const to of mentions) {
      const key = `${m.message_id}:${from}->${to}`;
      expected.set(key, {
        id: `exp-${key}`,
        from,
        to,
        kind: "expected",
        status: "pending",
        label: "to be replied by",
      });
    }
  }

  const edges: GraphEdge[] = [];

  // Resolve replies and unexpected replies
  for (const m of messages) {
    if (!m.reply_to) continue;
    const parent = messageById.get(m.reply_to);
    if (!parent) continue;

    const from = parent.sender_slug.toUpperCase();
    const to = m.sender_slug.toUpperCase();
    const e = expected.get(`${parent.message_id}:${from}->${to}`);
    if (e) {
      e.status = "fulfilled";
      edges.push(e);
    } else {
      edges.push({
        id: `unexp-${parent.message_id}-${m.message_id}`,
        from,
        to,
        kind: "unexpected",
        status: "fulfilled",
        label: "",
      });
    }
  }

  // Remaining pending expected edges
  for (const e of expected.values()) {
    if (e.status === "pending") edges.push(e);
  }

  // Pending from next_reply (final state marker)
  if (nextReply) {
    const pendingSet = new Set(nextReply.pending_participant_slugs.map((s) => s.toUpperCase()));
    for (const slug of pendingSet) {
      edges.push({
        id: `nr-${slug}`,
        from: "SYSTEM",
        to: slug,
        kind: "expected",
        status: "pending",
        label: "pending reply",
      });
    }
  }

  // Nodes in circular layout (+ optional SYSTEM node)
  const nodeIds = [...slugs];
  if (nextReply) nodeIds.push("SYSTEM");
  const cx = 430;
  const cy = 240;
  const radius = Math.max(120, 52 + nodeIds.length * 16);
  const nodes: GraphNode[] = nodeIds.map((id, i) => {
    if (id === "SYSTEM") return { id, slug: id, x: cx, y: 52 };
    const angle = (2 * Math.PI * i) / Math.max(slugs.length, 1) - Math.PI / 2;
    return {
      id,
      slug: id,
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  });

  return { nodes, edges, width: 860, height: 500 };
}

function curvedPath(x1: number, y1: number, x2: number, y2: number, bend = 0.22) {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const nx = -dy;
  const ny = dx;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function terminalText(thread: Thread, nextReply: ThreadNextReply | null) {
  if (thread.status === "closed") return "Conversation closed";
  if (!nextReply) return "No pending reply";
  const slugs = nextReply.pending_participant_slugs;
  if (!slugs.length) return "No pending reply";
  return `Pending for reply from ${slugs.join(", ")}`;
}

export function ThreadFlowPanel({
  thread,
  participants,
  messages,
  nextReply,
  canManage,
  saving,
  onApply,
  onClear,
}: {
  thread: Thread;
  participants: ThreadParticipant[];
  messages: ThreadMessage[];
  nextReply: ThreadNextReply | null;
  canManage: boolean;
  saving: boolean;
  onApply: (payload: { mode: "any" | "all"; pending_participant_ids: string[]; reason: string | null }) => void;
  onClear: () => void;
}) {
  const activeParticipants = React.useMemo(
    () => participants.filter((participant) => !participant.removed_at),
    [participants]
  );

  const [mode, setMode] = React.useState<"any" | "all">("any");
  const [reason, setReason] = React.useState("");
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    setMode(nextReply?.mode ?? "any");
    setReason(nextReply?.reason ?? "");
    setSelectedIds(nextReply?.pending_participant_ids ?? []);
  }, [nextReply?.mode, nextReply?.reason, nextReply?.pending_participant_ids, thread.thread_id]);

  const flow = React.useMemo(
    () => buildGraph(participants, messages.slice(-80), nextReply),
    [participants, messages, nextReply]
  );

  const nodeMap = new Map(flow.nodes.map((n) => [n.id, n]));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reply Network</div>
        <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {terminalText(thread, nextReply)}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="relative min-w-[820px]" style={{ width: flow.width, height: flow.height }}>
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {flow.edges.map((e) => {
              const a = nodeMap.get(e.from);
              const b = nodeMap.get(e.to);
              if (!a || !b) return null;
              const path = curvedPath(a.x, a.y, b.x, b.y, e.kind === "unexpected" ? 0.1 : 0.2);
              const stroke = e.kind === "unexpected" ? "#94a3b8" : e.status === "pending" ? "#f59e0b" : "#22c55e";
              return (
                <g key={e.id}>
                  <path d={path} fill="none" stroke={stroke} strokeWidth={e.status === "pending" ? 2.5 : 2} strokeDasharray={e.status === "pending" ? "7 4" : undefined} />
                  {e.label ? (
                    <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 8} textAnchor="middle" className="fill-slate-500 text-[10px]">
                      {e.label}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {flow.nodes.map((n) => (
            <div key={n.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: n.x, top: n.y }}>
              <div className={`flex h-11 w-11 items-center justify-center rounded-full border text-[11px] font-bold ${n.id === "SYSTEM" ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300" : "border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300"}`}>
                {n.id === "SYSTEM" ? "SYS" : n.slug.slice(0, 2)}
              </div>
              <div className="mt-1 text-center text-[10px] font-medium text-slate-500">{n.slug}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> pending expected</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> expected fulfilled</span>
        <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-400" /> unexpected reply</span>
      </div>

      {canManage && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as "any" | "all")}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              <option value="any">Any participant</option>
              <option value="all">All participants</option>
            </select>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Reason (optional)"
              className="min-w-[220px] flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
            <button
              onClick={() => onApply({ mode, pending_participant_ids: selectedIds, reason: reason.trim() || null })}
              disabled={saving || selectedIds.length === 0}
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-40"
            >
              Apply
            </button>
            <button
              onClick={onClear}
              disabled={saving || !nextReply}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
            >
              Clear
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {activeParticipants.map((participant) => {
              const selected = selectedIds.includes(participant.participant_id);
              return (
                <button
                  key={participant.participant_id}
                  type="button"
                  onClick={() =>
                    setSelectedIds((current) =>
                      current.includes(participant.participant_id)
                        ? current.filter((id) => id !== participant.participant_id)
                        : [...current, participant.participant_id]
                    )
                  }
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                    selected
                      ? "bg-violet-600 text-white"
                      : "bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-700"
                  }`}
                >
                  {participant.participant_slug}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
