"use client";

import * as React from "react";
import {
  Award, ChevronDown, ChevronRight, ShieldCheck,
  ListChecks, MessageSquare, GitBranch, Plus, X, Loader2,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import {
  fetchLevelDefinitions, fetchProjectAgentLevels, fetchAgentLevelDetail, setAgentLevel,
  fetchProjects,
  type LevelDefinition, type AgentProjectLevel, type LevelEvent, type LevelProof,
} from "@/lib/api";

// ── Helpers ───────────────────────────────────────────────────────────────────

const LEVEL_COLORS: Record<number, string> = {
  0: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  1: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400",
  2: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  3: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400",
  4: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  5: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400",
};

const PROOF_ICONS: Record<string, React.ReactNode> = {
  task:         <ListChecks className="h-3.5 w-3.5" />,
  conversation: <MessageSquare className="h-3.5 w-3.5" />,
  a2a_thread:   <GitBranch className="h-3.5 w-3.5" />,
};

function LevelBadge({ level, label }: { level: number; label: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", LEVEL_COLORS[level] ?? LEVEL_COLORS[0])}>
      <Award className="h-3 w-3" />
      L{level} · {label}
    </span>
  );
}

function ProofChip({ proof }: { proof: LevelProof }) {
  const short = proof.ref_id.length > 16 ? proof.ref_id.slice(0, 8) + "…" : proof.ref_id;
  return (
    <span
      title={`${proof.proof_type}: ${proof.ref_id}${proof.notes ? " — " + proof.notes : ""}`}
      className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 font-mono cursor-default"
    >
      {PROOF_ICONS[proof.proof_type]}
      {short}
    </span>
  );
}

// ── Set Level Modal ───────────────────────────────────────────────────────────
function SetLevelModal({
  projectId, agentId, agentName, currentLevel, definitions,
  onClose, onSaved,
}: {
  projectId: string; agentId: string; agentName: string;
  currentLevel: number; definitions: LevelDefinition[];
  onClose: () => void; onSaved: () => void;
}) {
  const [level, setLevel] = React.useState(currentLevel);
  const [reason, setReason] = React.useState("");
  const [proofs, setProofs] = React.useState<Array<{ proof_type: "task" | "conversation" | "a2a_thread"; ref_id: string; notes: string }>>([]);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const addProof = () => setProofs(p => [...p, { proof_type: "task", ref_id: "", notes: "" }]);
  const removeProof = (i: number) => setProofs(p => p.filter((_, idx) => idx !== i));
  const updateProof = (i: number, field: string, value: string) =>
    setProofs(p => p.map((x, idx) => idx === i ? { ...x, [field]: value } : x));

  const save = async () => {
    if (!reason.trim()) { setError("Reason is required"); return; }
    setSaving(true);
    const res = await setAgentLevel(
      projectId, agentId, level, reason,
      proofs.filter(p => p.ref_id.trim()).map(p => ({ ...p, notes: p.notes || undefined }))
    );
    setSaving(false);
    if (res.ok) onSaved();
    else setError("Failed to save");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">
          <X className="h-4 w-4" />
        </button>
        <h2 className="mb-1 text-base font-semibold">Set Level — {agentName}</h2>
        <p className="mb-4 text-sm text-zinc-500">Current: L{currentLevel}</p>

        {/* Level selector */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">New Level</label>
          <div className="flex flex-wrap gap-2">
            {definitions.map(d => (
              <button
                key={d.level_id}
                onClick={() => setLevel(d.level_id)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  level === d.level_id
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-900/30 dark:text-blue-300"
                    : "border-zinc-200 text-zinc-600 hover:border-zinc-300 dark:border-zinc-700 dark:text-zinc-400"
                )}
              >
                L{d.level_id} · {d.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-zinc-400">{definitions.find(d => d.level_id === level)?.description}</p>
        </div>

        {/* Reason */}
        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Reason *</label>
          <textarea
            value={reason} onChange={e => setReason(e.target.value)}
            rows={2} placeholder="Why is this level changing?"
            className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Proofs */}
        <div className="mb-5">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Evidence / Proof</label>
            <button onClick={addProof} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400">
              <Plus className="h-3 w-3" /> Add proof
            </button>
          </div>
          {proofs.map((p, i) => (
            <div key={i} className="mb-2 flex items-start gap-2">
              <select
                value={p.proof_type}
                onChange={e => updateProof(i, "proof_type", e.target.value)}
                className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <option value="task">Task</option>
                <option value="conversation">Conversation</option>
                <option value="a2a_thread">A2A Thread</option>
              </select>
              <input
                value={p.ref_id} onChange={e => updateProof(i, "ref_id", e.target.value)}
                placeholder="ID / ref"
                className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-mono dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              />
              <input
                value={p.notes} onChange={e => updateProof(i, "notes", e.target.value)}
                placeholder="Notes (optional)"
                className="flex-1 rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              />
              <button onClick={() => removeProof(i)} className="mt-1 text-zinc-400 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {proofs.length === 0 && (
            <p className="text-xs text-zinc-400">No proof added yet. Add a task ID, conversation ID, or A2A thread ID.</p>
          )}
        </div>

        {error && <p className="mb-3 text-xs text-red-500">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save Level
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Agent Level Row ───────────────────────────────────────────────────────────
function AgentLevelRow({
  entry, projectId, definitions,
  onPromote,
}: {
  entry: AgentProjectLevel; projectId: string; definitions: LevelDefinition[];
  onPromote: (agentId: string, agentName: string, currentLevel: number) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [detail, setDetail] = React.useState<{ events: LevelEvent[]; proofs: LevelProof[] } | null>(null);
  const [loading, setLoading] = React.useState(false);

  const toggle = async () => {
    if (!expanded && !detail) {
      setLoading(true);
      const d = await fetchAgentLevelDetail(projectId, entry.agent_id);
      setDetail(d);
      setLoading(false);
    }
    setExpanded(e => !e);
  };

  const proofsForEvent = (eventId: string) =>
    detail?.proofs.filter(p => p.event_id === eventId) ?? [];

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      {/* Header row */}
      <div
        className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
        onClick={toggle}
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-200 text-xs font-bold text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 shrink-0">
          {entry.agent_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{entry.agent_name}</p>
          <p className="text-xs text-zinc-400">{entry.agent_slug}</p>
        </div>
        <LevelBadge level={entry.current_level} label={entry.level_label} />
        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={e => { e.stopPropagation(); onPromote(entry.agent_id, entry.agent_name, entry.current_level); }}
            className="rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:border-blue-400 hover:text-blue-600 dark:border-zinc-700 dark:text-zinc-400 transition-colors"
          >
            Set Level
          </button>
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-zinc-400" /> :
            expanded ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        </div>
      </div>

      {/* Expanded history */}
      {expanded && detail && (
        <div className="border-t border-zinc-100 dark:border-zinc-700/50 bg-zinc-50/50 dark:bg-zinc-800/30 px-4 py-3">
          {detail.events.length === 0 ? (
            <p className="text-xs text-zinc-400">No level change history yet.</p>
          ) : (
            <div className="space-y-3">
              {detail.events.map(ev => (
                <div key={ev.id} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <ShieldCheck className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <LevelBadge level={ev.from_level} label={ev.from_label} />
                      <span className="text-xs text-zinc-400">→</span>
                      <LevelBadge level={ev.to_level} label={ev.to_label} />
                      <span className="text-xs text-zinc-400 ml-1">
                        {new Date(ev.created_at).toLocaleString()}
                      </span>
                    </div>
                    {ev.reason && <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-1">{ev.reason}</p>}
                    {proofsForEvent(ev.id).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {proofsForEvent(ev.id).map(p => <ProofChip key={p.id} proof={p} />)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AgentLevelsPage() {
  const [projects, setProjects] = React.useState<Array<{ id: string; name: string }>>([]);
  const [selectedProject, setSelectedProject] = React.useState<string>("");
  const [definitions, setDefinitions] = React.useState<LevelDefinition[]>([]);
  const [levels, setLevels] = React.useState<AgentProjectLevel[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [modal, setModal] = React.useState<{ agentId: string; agentName: string; currentLevel: number } | null>(null);

  React.useEffect(() => {
    fetchLevelDefinitions().then(setDefinitions);
    fetchProjects().then(list => setProjects(list.map(p => ({ id: p.id, name: p.name }))));
  }, []);

  React.useEffect(() => {
    if (!selectedProject) { setLevels([]); return; }
    setLoading(true);
    fetchProjectAgentLevels(selectedProject).then(l => { setLevels(l); setLoading(false); });
  }, [selectedProject]);

  const refresh = () => {
    if (!selectedProject) return;
    fetchProjectAgentLevels(selectedProject).then(setLevels);
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
            <Award className="h-5 w-5 text-blue-500" />
            Agent Levels
          </h1>
          <p className="mt-0.5 text-sm text-zinc-500">Track and verify agent capability levels per project.</p>
        </div>
      </div>

      {/* Level legend */}
      <div className="mb-6 flex flex-wrap gap-2">
        {definitions.map(d => (
          <div key={d.level_id} className="flex items-center gap-1.5 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-1.5 dark:border-zinc-700 dark:bg-zinc-800">
            <LevelBadge level={d.level_id} label={d.label} />
            <span className="text-xs text-zinc-400">{d.description.split(".")[0]}</span>
          </div>
        ))}
      </div>

      {/* Project selector */}
      <div className="mb-6">
        <label className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">Select Project</label>
        <select
          value={selectedProject}
          onChange={e => setSelectedProject(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        >
          <option value="">— choose a project —</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      {/* Agent list */}
      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      )}

      {!loading && selectedProject && levels.length === 0 && (
        <div className="rounded-xl border border-dashed border-zinc-200 py-12 text-center dark:border-zinc-700">
          <Award className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-500">No agent levels recorded for this project yet.</p>
          <p className="mt-1 text-xs text-zinc-400">Use "Set Level" on an agent to get started.</p>
        </div>
      )}

      {!loading && levels.length > 0 && (
        <div className="space-y-2">
          {levels.map(entry => (
            <AgentLevelRow
              key={entry.agent_id}
              entry={entry}
              projectId={selectedProject}
              definitions={definitions}
              onPromote={(agentId, agentName, currentLevel) =>
                setModal({ agentId, agentName, currentLevel })
              }
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal && (
        <SetLevelModal
          projectId={selectedProject}
          agentId={modal.agentId}
          agentName={modal.agentName}
          currentLevel={modal.currentLevel}
          definitions={definitions}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); refresh(); }}
        />
      )}
    </div>
  );
}
