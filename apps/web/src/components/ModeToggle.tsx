import React from "react";

type Mode = "planning" | "executing";

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  React.useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Shift+Tab to toggle mode
      if (e.shiftKey && e.key === "Tab") {
        e.preventDefault();
        onChange(mode === "planning" ? "executing" : "planning");
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [mode, onChange]);

  const backgroundColor = mode === "planning" ? "bg-blue-50" : "bg-white";
  const label = mode === "planning" ? "PLANNING MODE" : "EXECUTING MODE";
  const nextMode = mode === "planning" ? "EXECUTING" : "PLANNING";

  return (
    <div className={`${backgroundColor} transition-colors px-4 py-2 border-b border-gray-200`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        <span className="text-xs text-gray-500">Shift+Tab to {nextMode}</span>
      </div>
    </div>
  );
}
