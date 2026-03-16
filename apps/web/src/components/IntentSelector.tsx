import React from "react";

type BaseIntent = "request" | "response" | "thinking";
type Modifier = "not_handled" | "handled_incorrectly";

interface IntentSelectorProps {
  baseIntent: BaseIntent;
  modifiers: Modifier[];
  onBaseIntentChange: (intent: BaseIntent) => void;
  onModifiersChange: (modifiers: Modifier[]) => void;
}

export function IntentSelector({
  baseIntent,
  modifiers,
  onBaseIntentChange,
  onModifiersChange,
}: IntentSelectorProps) {
  const toggleModifier = (mod: Modifier) => {
    if (modifiers.includes(mod)) {
      onModifiersChange(modifiers.filter((m) => m !== mod));
    } else {
      // Max 1 modifier
      if (modifiers.length < 1) {
        onModifiersChange([...modifiers, mod]);
      }
    }
  };

  return (
    <div className="space-y-3 py-2">
      {/* Base Intent */}
      <div>
        <label className="text-xs font-semibold text-gray-600">Base Intent:</label>
        <div className="flex gap-4 mt-1">
          {(["request", "response", "thinking"] as const).map((intent) => (
            <label key={intent} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="baseIntent"
                value={intent}
                checked={baseIntent === intent}
                onChange={() => onBaseIntentChange(intent)}
                className="w-4 h-4"
              />
              <span className="text-sm capitalize">{intent}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Modifiers */}
      <div>
        <label className="text-xs font-semibold text-gray-600">Modifiers:</label>
        <div className="flex gap-4 mt-1">
          {(["not_handled", "handled_incorrectly"] as const).map((mod) => (
            <label key={mod} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={modifiers.includes(mod)}
                onChange={() => toggleModifier(mod)}
                className="w-4 h-4"
              />
              <span className="text-sm">{mod.replace(/_/g, " ")}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
