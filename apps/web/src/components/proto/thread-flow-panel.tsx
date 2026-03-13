"use client";

import * as React from "react";
import type { Thread, ThreadNextReply, ThreadParticipant } from "@/lib/api";

type FlowNode = {
  id: string;
  type: "state" | "next-reply" | "participant-badge";
  x: number;
  y: number;
  data: Record<string, unknown>;
};

type FlowEdge = {
  id: string;
  source: string;
  target: string;
  type: "transition" | "reply-expected" | "reply-participant";
  data: Record<string, unknown>;
};

const STATE_CARD_WIDTH = 150;
const STATE_CARD_HEIGHT = 72;
const BADGE_WIDTH = 132;
const BADGE_HEIGHT = 36;

function getActiveStateKey(thread: Thread) {
  if (thread.status === "archived") return "thread.archived";
  if (thread.status === "closed") return "thread.closed";
  if (thread.thread_type === "task") {
    switch (thread.task_status) {
      case "approved":
        return "task.approved";
      case "in-progress":
        return "task.in_progress";
      case "review":
        return "task.review";
      case "blocked":
        return "task.blocked";
      case "proposed":
      default:
        return "task.proposed";
    }
  }
  return "conversation.open";
}

function buildFlow(thread: Thread, nextReply: ThreadNextReply | null) {
  const stateKeys = thread.thread_type === "task"
    ? [
        { id: "task.proposed", label: "Proposed" },
        { id: "task.approved", label: "Approved" },
        { id: "task.in_progress", label: "In Progress" },
        { id: "task.review", label: "Review" },
        { id: "task.blocked", label: "Blocked" },
        { id: "thread.closed", label: "Closed" },
        { id: "thread.archived", label: "Archived" },
      ]
    : [
        { id: "conversation.open", label: "Open" },
        { id: "thread.closed", label: "Closed" },
        { id: "thread.archived", label: "Archived" },
      ];

  const activeStateKey = getActiveStateKey(thread);
  const nodes: FlowNode[] = stateKeys.map((state, index) => ({
    id: state.id,
    type: "state",
    x: 32 + index * 172,
    y: 48,
    data: {
      label: state.label,
      state_key: state.id,
      isActive: state.id === activeStateKey,
    },
  }));

  const edges: FlowEdge[] = stateKeys.slice(1).map((state, index) => ({
    id: `transition-${stateKeys[index].id}-${state.id}`,
    source: stateKeys[index].id,
    target: state.id,
    type: "transition",
    data: {
      label: "transition",
      isActivePath: state.id === activeStateKey || stateKeys[index].id === activeStateKey,
    },
  }));

  if (!nextReply) {
    return { nodes, edges, width: Math.max(700, nodes.length * 172 + 80), height: 180 };
  }

  const nextReplyNodeX = Math.max(nodes[nodes.length - 1].x + 212, 620);
  nodes.push({
    id: "next-reply",
    type: "next-reply",
    x: nextReplyNodeX,
    y: 48,
    data: {
      label: nextReply.mode === "all" ? "All Pending" : "Any Pending",
      mode: nextReply.mode,
      pendingParticipantSlugs: nextReply.pending_participant_slugs,
      reason: nextReply.reason,
      expiresAt: nextReply.expires_at,
      isExpired: nextReply.is_expired,
      isActive: true,
    },
  });
  edges.push({
    id: `reply-expected-${activeStateKey}`,
    source: activeStateKey,
    target: "next-reply",
    type: "reply-expected",
    data: {
      label: "await reply",
      isActivePath: true,
    },
  });

  nextReply.pending_participant_slugs.forEach((slug, index) => {
    const badgeId = `pending-${slug}`;
    nodes.push({
      id: badgeId,
      type: "participant-badge",
      x: nextReplyNodeX + 220,
      y: 22 + index * 48,
      data: {
        slug,
        isPending: true,
      },
    });
    edges.push({
      id: `reply-participant-${slug}`,
      source: "next-reply",
      target: badgeId,
      type: "reply-participant",
      data: {
        label: nextReply.mode === "all" ? "required" : "eligible",
      },
    });
  });

  return {
    nodes,
    edges,
    width: nextReplyNodeX + 400,
    height: Math.max(180, 100 + nextReply.pending_participant_slugs.length * 48),
  };
}

function findNode(nodes: FlowNode[], id: string) {
  return nodes.find((node) => node.id === id) ?? null;
}

function nodeCenter(node: FlowNode) {
  const width = node.type === "participant-badge" ? BADGE_WIDTH : STATE_CARD_WIDTH;
  const height = node.type === "participant-badge" ? BADGE_HEIGHT : STATE_CARD_HEIGHT;
  return {
    x: node.x + width / 2,
    y: node.y + height / 2,
  };
}

function nextReplySummary(nextReply: ThreadNextReply | null) {
  if (!nextReply) return "No reply pending";
  if (nextReply.mode === "any") {
    return nextReply.pending_participant_slugs.length > 2
      ? `Reply pending: any of ${nextReply.pending_participant_slugs.length}`
      : `Reply pending: ${nextReply.pending_participant_slugs.join(", ")}`;
  }
  return `Reply pending: ${nextReply.pending_participant_slugs.join(", ")}`;
}

export function ThreadFlowPanel({
  thread,
  participants,
  nextReply,
  canManage,
  saving,
  onApply,
  onClear,
}: {
  thread: Thread;
  participants: ThreadParticipant[];
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

  const flow = React.useMemo(() => buildFlow(thread, nextReply), [thread, nextReply]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Thread Flow</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{nextReplySummary(nextReply)}</div>
        </div>
        {nextReply && (
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${nextReply.is_expired ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}>
            {nextReply.is_expired ? "Expired" : nextReply.mode === "all" ? "Waiting on all" : "Waiting on any"}
          </span>
        )}
      </div>

      <div className="mt-4 overflow-x-auto">
        <div className="relative min-w-[700px]" style={{ height: flow.height, width: flow.width }}>
          <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
            {flow.edges.map((edge) => {
              const source = findNode(flow.nodes, edge.source);
              const target = findNode(flow.nodes, edge.target);
              if (!source || !target) return null;
              const start = nodeCenter(source);
              const end = nodeCenter(target);
              const isActive = Boolean(edge.data.isActivePath);
              return (
                <g key={edge.id}>
                  <path
                    d={`M ${start.x} ${start.y} C ${start.x + 48} ${start.y}, ${end.x - 48} ${end.y}, ${end.x} ${end.y}`}
                    fill="none"
                    stroke={isActive ? "#8b5cf6" : "#cbd5e1"}
                    strokeWidth={isActive ? 3 : 2}
                    strokeDasharray={edge.type === "reply-participant" ? "6 4" : undefined}
                  />
                </g>
              );
            })}
          </svg>

          {flow.nodes.map((node) => {
            if (node.type === "participant-badge") {
              return (
                <div
                  key={node.id}
                  className="absolute flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  style={{ left: node.x, top: node.y, width: BADGE_WIDTH, height: BADGE_HEIGHT }}
                >
                  {String(node.data.slug)}
                </div>
              );
            }

            const isActive = Boolean(node.data.isActive);
            const isReplyNode = node.type === "next-reply";
            return (
              <div
                key={node.id}
                className={`absolute rounded-2xl border px-4 py-3 shadow-sm ${
                  isReplyNode
                    ? "border-amber-300 bg-amber-50 dark:border-amber-900/70 dark:bg-amber-950/30"
                    : isActive
                    ? "border-violet-300 bg-violet-50 dark:border-violet-900/70 dark:bg-violet-950/30"
                    : "border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900"
                }`}
                style={{ left: node.x, top: node.y, width: STATE_CARD_WIDTH, height: STATE_CARD_HEIGHT }}
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  {isReplyNode ? "Next Reply" : "State"}
                </div>
                <div className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {String(node.data.label)}
                </div>
                {isReplyNode && (
                  <div className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {String(node.data.reason || "Awaiting participant reply")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
