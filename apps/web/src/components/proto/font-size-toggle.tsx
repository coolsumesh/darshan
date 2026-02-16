"use client";

import * as React from "react";
import { Text } from "lucide-react";
import { Button } from "@/components/ui/button";

export type FontSizePreset = "sm" | "md" | "lg" | "xl";

const PRESETS: Array<{ key: FontSizePreset; label: string; px: number }> = [
  { key: "sm", label: "Small", px: 14 },
  { key: "md", label: "Medium", px: 16 },
  { key: "lg", label: "Large", px: 18 },
  { key: "xl", label: "XL", px: 20 },
];

function applyFontSize(px: number) {
  // Rem-based scaling: setting root font-size scales all rem values proportionally.
  document.documentElement.style.setProperty("--base-font-size", `${px}px`);
}

export default function FontSizeToggle({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const [preset, setPreset] = React.useState<FontSizePreset>("md");

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("darshan-font-size") as
        | FontSizePreset
        | null;
      const next: FontSizePreset = stored && PRESETS.some((p) => p.key === stored) ? stored : "md";
      setPreset(next);
      const px = PRESETS.find((p) => p.key === next)?.px ?? 16;
      applyFontSize(px);
    } catch {
      // no-op
    }
  }, []);

  function cycle() {
    const i = PRESETS.findIndex((p) => p.key === preset);
    const next = PRESETS[(i + 1 + PRESETS.length) % PRESETS.length];
    setPreset(next.key);
    try {
      localStorage.setItem("darshan-font-size", next.key);
    } catch {
      // no-op
    }
    applyFontSize(next.px);
  }

  const current = PRESETS.find((p) => p.key === preset) ?? PRESETS[1];

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={cycle}
      aria-label={`Font size: ${current.label}. Click to change.`}
      className={className}
      title={`Font size: ${current.label}`}
    >
      <Text className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{current.label}</span>
    </Button>
  );
}

export function FontSizeSelector({
  value,
  onChange,
}: {
  value: FontSizePreset;
  onChange: (v: FontSizePreset) => void;
}) {
  return (
    <div
      className="flex w-full items-center gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-line dark:bg-slate-900/40 dark:ring-slate-800"
      role="group"
      aria-label="Font size"
    >
      {PRESETS.map((p) => {
        const active = value === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(p.key)}
            className={
              "inline-flex flex-1 items-center justify-center rounded-lg px-2 py-2 text-xs font-semibold transition " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)] " +
              (active
                ? "bg-white text-slate-900 shadow-softSm ring-1 ring-line dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-950/40")
            }
            aria-pressed={active}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

export function setFontSizePreset(preset: FontSizePreset) {
  const px = PRESETS.find((p) => p.key === preset)?.px ?? 16;
  applyFontSize(px);
  try {
    localStorage.setItem("darshan-font-size", preset);
  } catch {
    // no-op
  }
}
