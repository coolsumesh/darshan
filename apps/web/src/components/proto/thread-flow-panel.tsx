"use client";

import * as React from "react";
import type { Thread, ThreadFlow, ThreadMessage, ThreadNextReply, ThreadParticipant } from "@/lib/api";

function intentLabel(intent: string) {
  return intent.replace(/_/g, " ");
}

function terminalText(flow: ThreadFlow, thread: Thread, nextReply: ThreadNextReply | null) {
  if (thread.status === "closed") return "Conversation closed";
  if (flow.awaiting_on && flow.next_expected_from) return `Awaiting ${flow.next_expected_from}`;
  if (!nextReply) return "No pending reply";
  const slugs = nextReply.pending_participant_slugs;
  if (!slugs.length) return "No pending reply";
  return `Pending for reply from ${slugs.join(", ")}`;
}

export function ThreadFlowPanel({
  thread,
  participants,
  flow,
  nextReply,
  canManage,
  saving,
  onApply,
  onClear,
}: {
  thread: Thread;
  participants: ThreadParticipant[];
  messages: ThreadMessage[];
  flow: ThreadFlow;
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

  const pathText = React.useMemo(() => {
    if (!flow.path?.length) return "No flow events yet";
    return flow.path
      .map((step) => {
        if (step.event_type === "created") return "Thread Created";
        return step.from_actor;
      })
      .join(" → ");
  }, [flow.path]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Thread Flow</div>
        <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {terminalText(flow, thread, nextReply)}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {pathText}
      </div>

      <div className="mt-3 space-y-2">
        {flow.path?.map((step) => (
          <div key={`${step.seq}-${step.message_id ?? "created"}`} className="rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                #{step.seq}
              </span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{step.from_actor}</span>
              {step.to_actor ? <span className="text-slate-400">→ {step.to_actor}</span> : null}
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {intentLabel(step.event_type)}
              </span>
              {step.awaiting_on !== "none" && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  awaiting {step.next_expected_from ?? step.awaiting_on}
                </span>
              )}
            </div>
          </div>
        ))}
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
