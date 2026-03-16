import React from "react";
import { X } from "lucide-react";
import { IntentSelector } from "./IntentSelector";

type BaseIntent = "request" | "response" | "thinking";
type Modifier = "not_handled" | "handled_incorrectly";
type Intent = BaseIntent | Modifier;

interface IntentEditModalProps {
  isOpen: boolean;
  currentIntents: Intent[];
  onClose: () => void;
  onSave: (intents: Intent[]) => Promise<void>;
}

export function IntentEditModal({
  isOpen,
  currentIntents,
  onClose,
  onSave,
}: IntentEditModalProps) {
  const [baseIntent, setBaseIntent] = React.useState<BaseIntent>("request");
  const [modifiers, setModifiers] = React.useState<Modifier[]>([]);
  const [isSaving, setIsSaving] = React.useState(false);

  // Initialize from current intents
  React.useEffect(() => {
    if (currentIntents.length > 0) {
      const base = currentIntents.find((i) =>
        ["request", "response", "thinking"].includes(i)
      ) as BaseIntent | undefined;
      if (base) setBaseIntent(base);

      const mods = currentIntents.filter((i) =>
        ["not_handled", "handled_incorrectly"].includes(i)
      ) as Modifier[];
      setModifiers(mods);
    }
  }, [currentIntents, isOpen]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newIntents: Intent[] = [baseIntent, ...modifiers];
      await onSave(newIntents);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Edit Intent</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Current Intent */}
        <div className="px-4 py-2 bg-gray-50 border-b">
          <p className="text-xs text-gray-600">Current:</p>
          <div className="flex gap-1 mt-1 flex-wrap">
            {currentIntents.map((i) => (
              <span
                key={i}
                className="px-2 py-1 text-xs bg-gray-200 text-gray-800 rounded"
              >
                [{i}]
              </span>
            ))}
          </div>
        </div>

        {/* Selector */}
        <div className="p-4">
          <IntentSelector
            baseIntent={baseIntent}
            modifiers={modifiers}
            onBaseIntentChange={setBaseIntent}
            onModifiersChange={setModifiers}
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
