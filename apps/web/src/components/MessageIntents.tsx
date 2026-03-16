import React from "react";
import type { ThreadMessageIntent } from "@/lib/api";

interface MessageIntentsProps {
  intents?: ThreadMessageIntent[];
}

export function MessageIntents({ intents }: MessageIntentsProps) {
  if (!intents || intents.length === 0) return null;

  const intentColors: Record<ThreadMessageIntent, { bg: string; text: string }> = {
    // Base intents
    request:             { bg: "bg-blue-100",   text: "text-blue-700" },
    response:            { bg: "bg-green-100",  text: "text-green-700" },
    thinking:            { bg: "bg-amber-100",  text: "text-amber-700" },
    // Modifiers
    not_handled:         { bg: "bg-red-100",    text: "text-red-700" },
    handled_incorrectly: { bg: "bg-orange-100", text: "text-orange-700" },
  };

  return (
    <div className="flex gap-1 flex-wrap">
      {intents.map((intent) => {
        const colors = intentColors[intent] ?? intentColors.thinking;
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
