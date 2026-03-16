import React from "react";

type Intent =
  | "question"
  | "clarification"
  | "thought"
  | "answer"
  | "disagreement"
  | "suggestion"
  | "should_i"
  | "blocked"
  | "work_confirmation";

interface MessageIntentsProps {
  intents?: Intent[];
}

export function MessageIntents({ intents }: MessageIntentsProps) {
  if (!intents || intents.length === 0) return null;

  const intentColors: Record<Intent, { bg: string; text: string }> = {
    // Ask phase
    question: { bg: "bg-blue-100", text: "text-blue-700" },
    clarification: { bg: "bg-cyan-100", text: "text-cyan-700" },
    // Process phase
    thought: { bg: "bg-amber-100", text: "text-amber-700" },
    // Respond phase
    answer: { bg: "bg-green-100", text: "text-green-700" },
    disagreement: { bg: "bg-rose-100", text: "text-rose-700" },
    // Propose/Suggest phase
    suggestion: { bg: "bg-purple-100", text: "text-purple-700" },
    should_i: { bg: "bg-indigo-100", text: "text-indigo-700" },
    // Blockers & Completion
    blocked: { bg: "bg-red-100", text: "text-red-700" },
    work_confirmation: { bg: "bg-emerald-100", text: "text-emerald-700" },
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {intents.map((intent) => {
        const colors = intentColors[intent] || intentColors.thought;
        return (
          <span
            key={intent}
            className={`${colors.bg} ${colors.text} px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap border border-current border-opacity-20`}
            title={intent}
          >
            [{intent}]
          </span>
        );
      })}
    </div>
  );
}
