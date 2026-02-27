"use client";

import * as React from "react";
import { Link2, Plus, Copy, Check, Clock, X, ExternalLink } from "lucide-react";
import { fetchInvites, fetchOrgs, createInvite, type Invite, type Org } from "@/lib/api";
import { cn } from "@/lib/cn";

function relativeTime(iso?: string): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60)  return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function timeUntil(iso: string): { text: string; expired: boolean } {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return { text: "Expired", expired: true };
  const h = Math.floor(diff / 3600000);
  if (h < 1) return { text: `${Math.floor(diff / 60000)}m left`, expired: false };
  if (h < 24) return { text: `${h}h left`, expired: false };
  return { text: `${Math.floor(h / 24)}d left`, expired: false };
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }
  return (
    <button onClick={copy}
      className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10 dark:hover:text-zinc-300 transition-colors"
      title="Copy link">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function AgentInvitesPage() {
  const [invites,  setInvites]  = React.useState<Invite[]>([]);
  const [orgs,     setOrgs]     = React.useState<Org[]>([]);
  const [loading,  setLoading]  = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [showForm, setShowForm] = React.useState(false);
  const [orgId,    setOrgId]    = React.useState("");
  const [label,    setLabel]    = React.useState("");

  async function load() {
    setLoading(true);
    const [inv, os] = await Promise.all([fetchInvites(), fetchOrgs()]);
    setInvites(inv);
    setOrgs(os);
    if (!orgId && os.length) setOrgId(os[0].id);
    setLoading(false);
  }

  React.useEffect(() => { load(); }, []);

  async function handleCreate() {
    if (!orgId) return;
    setCreating(true);
    const result = await createInvite(orgId, label.trim() || undefined);
    if (result) await load();
    setLabel("");
    setShowForm(false);
    setCreating(false);
  }

  const active   = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) > new Date());
  const accepted = invites.filter((i) => !!i.accepted_at);
  const expired  = invites.filter((i) => !i.accepted_at && new Date(i.expires_at) <= new Date());

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <header className="flex items-center gap-4">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sky-100 dark:bg-sky-500/10">
          <Link2 className="h-5 w-5 text-sky-600 dark:text-sky-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold text-zinc-900 dark:text-white">Invites</h1>
          <p className="mt-0.5 text-xs text-zinc-500">One-time invite links for agents to self-register into organisations</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-white transition-colors"
          style={{ backgroundColor: "#7C3AED" }}
        >
          <Plus className="h-4 w-4" /> New invite
        </button>
      </header>

      {/* Create form */}
      {showForm && (
        <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 dark:border-violet-500/20 dark:bg-violet-500/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-violet-800 dark:text-violet-300">Create invite link</p>
            <button onClick={() => setShowForm(false)} className="text-violet-400 hover:text-violet-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={orgId} onChange={(e) => setOrgId(e.target.value)}
              className="flex-1 rounded-xl border-0 bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
            >
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <input
              value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="flex-1 rounded-xl border-0 bg-white px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700"
            />
            <button
              onClick={handleCreate} disabled={creating || !orgId}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: "#7C3AED" }}
            >
              {creating ? "Creating…" : "Create"}
            </button>
          </div>
          <p className="text-[11px] text-violet-600/70 dark:text-violet-400/60">
            Expires in 24 hours · One-time use · Agent self-registers on accept
          </p>
        </div>
      )}

      {/* Stats */}
      {!loading && (
        <div className="flex flex-wrap gap-3">
          {[
            { label: "Active",   count: active.length,   bg: "bg-emerald-50 dark:bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-400" },
            { label: "Accepted", count: accepted.length, bg: "bg-sky-50 dark:bg-sky-500/10",         text: "text-sky-700 dark:text-sky-400",         dot: "bg-sky-400"     },
            { label: "Expired",  count: expired.length,  bg: "bg-zinc-100 dark:bg-white/5",          text: "text-zinc-600 dark:text-zinc-400",       dot: "bg-zinc-400"    },
          ].map(({ label: l, count, bg, text, dot }) => (
            <div key={l} className={cn("flex items-center gap-2 rounded-xl px-4 py-3", bg)}>
              <span className={cn("h-2 w-2 rounded-full", dot)} />
              <span className={cn("text-sm font-semibold", text)}>{count} {l}</span>
            </div>
          ))}
        </div>
      )}

      {/* Invite list */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
        <div className="hidden md:flex items-center border-b border-zinc-100 bg-zinc-50 px-4 py-2.5 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
          <div className="flex-1 min-w-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Label / Link</div>
          <div className="w-32 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Organisation</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Status</div>
          <div className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Accepted by</div>
          <div className="w-24 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Created</div>
          <div className="w-16 shrink-0" />
        </div>

        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[1,2,3].map(i => <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100 dark:bg-white/5" />)}
          </div>
        ) : invites.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <Link2 className="h-8 w-8 text-zinc-300 dark:text-zinc-600" />
            <p className="text-sm font-medium text-zinc-500">No invites yet</p>
            <button onClick={() => setShowForm(true)}
              className="text-sm font-semibold text-violet-600 hover:underline">
              Create your first invite
            </button>
          </div>
        ) : (
          invites.map((inv) => {
            const exp = timeUntil(inv.expires_at);
            const isAccepted = !!inv.accepted_at;
            const statusEl = isAccepted ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Accepted
              </span>
            ) : exp.expired ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold text-zinc-500 dark:bg-white/10">
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" /> Expired
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {exp.text}
              </span>
            );

            return (
              <div key={inv.id} className="group border-b border-zinc-100 last:border-0 dark:border-[#2D2A45] hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
                {/* Mobile */}
                <div className="flex md:hidden flex-col gap-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {inv.label ?? <span className="italic text-zinc-400">No label</span>}
                    </p>
                    {statusEl}
                  </div>
                  <p className="text-xs text-zinc-400">{inv.org_name} · {relativeTime(inv.created_at)}</p>
                </div>

                {/* Desktop */}
                <div className="hidden md:flex items-center px-4 py-3 gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                      {inv.label ?? <span className="italic text-zinc-400">No label</span>}
                    </p>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-400">
                      {inv.invite_url}
                    </p>
                  </div>
                  <div className="w-32 shrink-0 truncate text-xs text-zinc-600 dark:text-zinc-400">{inv.org_name}</div>
                  <div className="w-28 shrink-0">{statusEl}</div>
                  <div className="w-28 shrink-0 text-xs text-zinc-500 truncate">
                    {inv.accepted_by ?? <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                  </div>
                  <div className="w-24 shrink-0 flex items-center gap-1 text-xs text-zinc-400">
                    <Clock className="h-3 w-3 shrink-0" />
                    {relativeTime(inv.created_at)}
                  </div>
                  <div className="w-16 shrink-0 flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isAccepted && !exp.expired && inv.invite_url && (
                      <CopyButton text={inv.invite_url} />
                    )}
                    {inv.invite_url && (
                      <a href={inv.invite_url} target="_blank" rel="noopener noreferrer"
                        className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-white/10 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
