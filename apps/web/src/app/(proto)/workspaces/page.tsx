"use client";

import * as React from "react";
import { FolderOpen, Plus, Pencil, Trash2, X, Check, FolderKanban } from "lucide-react";
import { cn } from "@/lib/cn";

// ─── API helpers ──────────────────────────────────────────────────────────────
const BASE = "/api/backend/api/v1";

interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  project_count?: number;
  created_at: string;
  updated_at: string;
}

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(`${BASE}${path}`, { credentials: "include", ...opts });
    const j = await r.json();
    return j.ok ? j : null;
  } catch { return null; }
}

// ─── WorkspaceCard ────────────────────────────────────────────────────────────
function WorkspaceCard({
  ws, onEdit, onDelete,
}: {
  ws: Workspace;
  onEdit: (ws: Workspace) => void;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  async function handleDelete() {
    setDeleting(true);
    const ok = await apiFetch(`/workspaces/${ws.id}`, { method: "DELETE" });
    setDeleting(false);
    if (ok !== null) onDelete(ws.id);
  }

  return (
    <div className="flex flex-col rounded-2xl bg-white ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45] p-4 gap-3">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-100 dark:bg-brand-500/10">
          <FolderOpen className="h-5 w-5 text-brand-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-bold text-zinc-900 dark:text-white truncate">{ws.name}</div>
          {ws.description
            ? <p className="mt-0.5 text-xs text-zinc-500 line-clamp-2">{ws.description}</p>
            : <p className="mt-0.5 text-xs italic text-zinc-300 dark:text-zinc-600">No description</p>
          }
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-zinc-400">
        <FolderKanban className="h-3.5 w-3.5" />
        <span>{ws.project_count ?? 0} {(ws.project_count ?? 0) === 1 ? "project" : "projects"}</span>
      </div>

      <div className="flex items-center gap-2 border-t border-zinc-100 pt-3 dark:border-white/5">
        {confirmDelete ? (
          <>
            <span className="flex-1 text-xs text-red-500">Delete workspace?</span>
            <button onClick={handleDelete} disabled={deleting}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              {deleting ? "…" : "Yes"}
            </button>
            <button onClick={() => setConfirmDelete(false)}
              className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 dark:bg-white/10 dark:text-zinc-400">
              Cancel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => onEdit(ws)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-zinc-100 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 transition-colors">
              <Pencil className="h-3.5 w-3.5" /> Edit
            </button>
            <button onClick={() => setConfirmDelete(true)}
              className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── WorkspaceForm ────────────────────────────────────────────────────────────
function WorkspaceForm({
  initial, onSave, onCancel,
}: {
  initial?: Workspace;
  onSave: (ws: Workspace) => void;
  onCancel: () => void;
}) {
  const [name, setName] = React.useState(initial?.name ?? "");
  const [desc, setDesc] = React.useState(initial?.description ?? "");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  async function handleSubmit() {
    if (!name.trim()) return;
    setSaving(true); setError("");

    let result: { ok: boolean; workspace: Workspace } | null;
    if (initial) {
      result = await apiFetch(`/workspaces/${initial.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || null }),
      }) as typeof result;
    } else {
      result = await apiFetch(`/workspaces`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: desc.trim() || undefined }),
      }) as typeof result;
    }

    setSaving(false);
    if (result?.ok && result.workspace) {
      onSave(result.workspace);
    } else {
      setError("Something went wrong. Try again.");
    }
  }

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
        <div>
          <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">
            {initial ? "Edit Workspace" : "New Workspace"}
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {initial ? "Update name or description" : "Just a name. That's it."}
          </div>
        </div>
        <button onClick={onCancel}
          className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 p-5 flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="e.g. Client Projects, Internal Tools…"
            className="w-full rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            Description <span className="text-zinc-400 font-normal">(optional)</span>
          </label>
          <textarea
            value={desc}
            onChange={e => setDesc(e.target.value)}
            rows={3}
            placeholder="What kind of projects live here?"
            className="w-full resize-none rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
        <button onClick={onCancel}
          className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name.trim() || saving}
          className={cn(
            "flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold transition-all",
            name.trim() && !saving
              ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
              : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-white/10 dark:text-zinc-500"
          )}>
          {saving ? "Saving…" : initial ? (<><Check className="h-4 w-4" /> Save changes</>) : (<><Plus className="h-4 w-4" /> Create</>)}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [panel, setPanel] = React.useState<{ mode: "new" | "edit"; ws?: Workspace } | null>(null);

  async function reload() {
    const r = await apiFetch<{ ok: boolean; workspaces: Workspace[] }>("/workspaces");
    setWorkspaces(r?.workspaces ?? []);
    setLoading(false);
  }
  React.useEffect(() => { reload(); }, []);

  function handleSave(ws: Workspace) {
    setWorkspaces(prev => {
      const idx = prev.findIndex(w => w.id === ws.id);
      if (idx >= 0) return prev.map(w => w.id === ws.id ? ws : w);
      return [ws, ...prev];
    });
    setPanel(null);
  }

  function handleDelete(id: string) {
    setWorkspaces(prev => prev.filter(w => w.id !== id));
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto gap-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Workspaces</h1>
            <p className="mt-0.5 text-sm text-zinc-500">
              Named folders to group related projects. No members, no roles — just organisation.
            </p>
          </div>
          <button
            onClick={() => setPanel({ mode: "new" })}
            className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            <Plus className="h-4 w-4" /> New Workspace
          </button>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
        ) : workspaces.length === 0 ? (
          <div className="py-20 text-center">
            <FolderOpen className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
            <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No workspaces yet</p>
            <p className="mt-1 text-sm text-zinc-400">Create one to start grouping your projects.</p>
            <button
              onClick={() => setPanel({ mode: "new" })}
              className="mt-4 mx-auto flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
              <Plus className="h-4 w-4" /> New Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {workspaces.map(ws => (
              <WorkspaceCard
                key={ws.id}
                ws={ws}
                onEdit={w => setPanel({ mode: "edit", ws: w })}
                onDelete={handleDelete}
              />
            ))}
            <button
              onClick={() => setPanel({ mode: "new" })}
              className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-zinc-400 hover:border-brand-400 hover:bg-brand-50/30 hover:text-brand-600 dark:border-white/10 dark:hover:border-brand-500/50 transition-all">
              <FolderOpen className="h-7 w-7" />
              <span className="text-sm font-semibold">New Workspace</span>
            </button>
          </div>
        )}
      </div>

      {/* Side panel */}
      {panel && (
        <WorkspaceForm
          initial={panel.mode === "edit" ? panel.ws : undefined}
          onSave={handleSave}
          onCancel={() => setPanel(null)}
        />
      )}
    </div>
  );
}
