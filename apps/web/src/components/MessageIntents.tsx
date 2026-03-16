import React from "react";

type Intent =
  | "question"
  | "answer"
  | "in_progress"
  | "blocked"
  | "status_update"
  | "request_review"
  | "work_confirmation";

interface MessageIntentsProps {
  intents?: Intent[];
}

export function MessageIntents({ intents }: MessageIntentsProps) {
  if (!intents || intents.length === 0) return null;

  const intentColors: Record<Intent, { bg: string; text: string }> = {
    question: { bg: "bg-blue-100", text: "text-blue-700" },
    answer: { bg: "bg-green-100", text: "text-green-700" },
    in_progress: { bg: "bg-yellow-100", text: "text-yellow-700" },
    blocked: { bg: "bg-red-100", text: "text-red-700" },
    status_update: { bg: "bg-gray-100", text: "text-gray-700" },
    request_review: { bg: "bg-purple-100", text: "text-purple-700" },
    work_confirmation: { bg: "bg-emerald-100", text: "text-emerald-700" },
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {intents.map((intent) => {
        const colors = intentColors[intent] || intentColors.status_update;
        return (
          <span
            key={intent}
            className={`${colors.bg} ${colors.text} px-2 py-1 rounded text-xs font-medium whitespace-nowrap border border-current border-opacity-20`}
            title={intent}
          >
            [{intent}]
          </span>
        );
      })}
    </div>
  );
}
