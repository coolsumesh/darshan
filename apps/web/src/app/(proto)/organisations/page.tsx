"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2, Bot, Camera, Check, ChevronRight, ExternalLink,
  LayoutGrid, List, Lock, Plus, Search, X, Zap, Users,
  FolderKanban, Archive, Trash2, Save, Upload, Link2,
  MoreVertical, Crown, Settings, UserCircle,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchOrgs, createOrg, updateOrg, deleteOrg,
  fetchOrgAgents, fetchOrgProjects,
  uploadOrgLogo, deleteOrgLogo,
  type Org, type OrgDetail,
} from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrgType   = "own" | "partner" | "client" | "vendor";
type OrgFilter = "all" | OrgType | "admin" | "contributor" | "viewer" | "archived";
type OrgView   = "grid" | "list";
type PanelTab  = "overview" | "team" | "settings";

type ExtOrg = OrgDetail & {
  agent_count?: number;
  project_count?: number;
  online_count?: number;
};
type OrgAgent = {
  id: string; name: string; status: string; agent_type?: string;
  model?: string; ping_status?: string;
};
type OrgProject = {
  id: string; name: string; slug: string; status: string; progress?: number;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const ORG_TYPE_META: Record<string, {
  label: string; desc: string; badge: string; accent: string; cardActive: string;
}> = {
  own:     {
    label: "Own workspace", desc: "Your team",
    badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    accent: "border-brand-500", cardActive: "bg-brand-600 ring-brand-600 text-white",
  },
  admin:  {
    label: "Admin", desc: "You manage this org",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    accent: "border-blue-500", cardActive: "bg-blue-600 ring-blue-600 text-white",
  },
  contributor: {
    label: "Contributor", desc: "You work here",
    badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    accent: "border-brand-400", cardActive: "bg-brand-600 ring-brand-600 text-white",
  },
  viewer: {
    label: "Viewer", desc: "Read-only access",
    badge: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
    accent: "border-zinc-300", cardActive: "bg-zinc-500 ring-zinc-500 text-white",
  },
  partner: {
    label: "Partner", desc: "Collaborate together",
    badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",
    accent: "border-sky-500", cardActive: "bg-sky-600 ring-sky-600 text-white",
  },
  client:  {
    label: "Client", desc: "You serve them",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
    accent: "border-emerald-500", cardActive: "bg-emerald-600 ring-emerald-600 text-white",
  },
  vendor:  {
    label: "Vendor", desc: "You use their services",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
    accent: "border-amber-500", cardActive: "bg-amber-600 ring-amber-600 text-white",
  },
};

/** Returns the display type based on the user's relationship to the org.
 *  For own orgs where the user isn't the owner, show their actual role (admin/contributor/viewer). */
function effectiveType(org: ExtOrg): string {
  if (org.type === "own" && org.my_role && org.my_role !== "owner") return org.my_role;
  return org.type;
}

const AVATAR_COLORS = ["#7C3AED","#2563EB","#0284C7","#059669","#D97706","#DC2626"];

function avatarColor(name: string, override?: string | null): string {
  if (override && !override.startsWith("/")) return override; // hex color
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function relTime(d?: string): string {
  if (!d) return "—";
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days < 1) return "today";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days/7)}w ago`;
  return `${Math.floor(days/30)}mo ago`;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day:"numeric", month:"short", year:"numeric" });
}

function ProgressBar({ value }: { value?: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
      <div className="h-full rounded-full bg-brand-500" style={{ width:`${Math.min(100, value??0)}%` }} />
    </div>
  );
}

// ─── OrgAvatar ────────────────────────────────────────────────────────────────
function OrgAvatar({ name, avatarUrl, color, size = 44, className }: {
  name: string; avatarUrl?: string | null; color?: string | null; size?: number; className?: string;
}) {
  const bg = avatarColor(name, color);
  if (avatarUrl) {
    return (
      <img src={`/api/backend${avatarUrl}`} alt={name}
        className={cn("rounded-xl object-cover", className)}
        style={{ width: size, height: size }} />
    );
  }
  return (
    <div className={cn("grid place-items-center rounded-xl font-bold text-white shrink-0", className)}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.35 }}>
      {name[0]?.toUpperCase()}
    </div>
  );
}

// ─── AvatarEditor ─────────────────────────────────────────────────────────────
function AvatarEditor({ name, avatarUrl, color, onChange, onUpload, onRemove, size = 72 }: {
  name: string; avatarUrl?: string | null; color: string;
  onChange: (color: string) => void;
  onUpload?: (file: File) => void;
  onRemove?: () => void;
  size?: number;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [urlMode, setUrlMode] = React.useState(false);
  const [urlVal,  setUrlVal]  = React.useState("");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && onUpload) onUpload(f);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f && onUpload) onUpload(f);
  }

  const bg = avatarColor(name || "O", color);

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Avatar circle — clickable */}
      <div
        className="group relative cursor-pointer"
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}>
        <div className="grid place-items-center rounded-2xl font-bold text-white overflow-hidden"
          style={{ width: size, height: size, backgroundColor: avatarUrl ? "transparent" : bg }}>
          {avatarUrl
            ? <img src={`/api/backend${avatarUrl}`} alt={name} className="w-full h-full object-cover" />
            : <span style={{ fontSize: size * 0.35 }}>{(name||"O")[0]?.toUpperCase()}</span>
          }
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="h-6 w-6 text-white" />
        </div>
      </div>

      {/* Upload actions */}
      <div className="flex items-center gap-2">
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 transition-colors">
          <Upload className="h-3.5 w-3.5" /> Upload image
        </button>
        <button onClick={() => setUrlMode(v => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 transition-colors">
          <Link2 className="h-3.5 w-3.5" /> URL
        </button>
        {(avatarUrl || onRemove) && (
          <button onClick={onRemove}
            className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:bg-white/10 transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* URL input */}
      {urlMode && (
        <input value={urlVal} onChange={e => setUrlVal(e.target.value)}
          onBlur={() => { if (urlVal) onChange(urlVal); }}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-xl border-0 bg-zinc-50 px-3 py-2 text-xs ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:ring-zinc-700" />
      )}

      {/* Colour swatches */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-zinc-400">or colour:</span>
        {AVATAR_COLORS.map(c => (
          <button key={c} onClick={() => onChange(c)}
            className={cn("h-6 w-6 rounded-full ring-2 ring-offset-1 transition-transform hover:scale-110",
              color === c ? "ring-zinc-700 dark:ring-white" : "ring-transparent")}
            style={{ backgroundColor: c }} />
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp"
        className="hidden" onChange={handleFile} />
      <p className="text-[11px] text-zinc-400">PNG, JPG, SVG · Max 2MB</p>
    </div>
  );
}

// ─── New Org Panel ────────────────────────────────────────────────────────────
function NewOrgPanel({ onDone, onClose }: {
  onDone: (org: ExtOrg) => void; onClose: () => void;
}) {
  const [name,   setName]   = React.useState("");
  const [slug,   setSlug]   = React.useState("");
  const [desc,   setDesc]   = React.useState("");
  const [type,   setType]   = React.useState<OrgType>("partner");
  const [color,  setColor]  = React.useState(AVATAR_COLORS[0]);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl]   = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error,  setError]  = React.useState("");

  function autoSlug(v: string) {
    setName(v);
    if (v) setColor(avatarColor(v));
    setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
  }

  function handleFileSelect(f: File) {
    setPendingFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleCreate() {
    if (!name.trim() || !slug.trim()) return;
    setSaving(true); setError("");
    const org = await createOrg({ name: name.trim(), slug: slug.trim(), description: desc.trim() || undefined, type });
    if (!org) { setError("Failed to create org. Slug may already be taken."); setSaving(false); return; }

    // Upload logo if pending
    let avatar_url: string | null = null;
    if (pendingFile) {
      avatar_url = await uploadOrgLogo(org.id, pendingFile);
    } else {
      // Save color
      await updateOrg(org.id, { avatar_color: color });
    }

    onDone({ ...org, avatar_url, avatar_color: color, agent_count: 0, project_count: 0, online_count: 0 } as ExtOrg);
  }

  const canCreate = name.trim().length > 0 && slug.trim().length > 0;
  const TYPE_CARDS: { type: OrgType; emoji: string; label: string; desc: string; sub: string }[] = [
    { type: "partner", emoji: "🤝", label: "Partner",  desc: "Collaborate together", sub: "Co-build, shared agents" },
    { type: "client",  emoji: "👤", label: "Client",   desc: "You serve them",        sub: "Deliver projects for" },
    { type: "vendor",  emoji: "📦", label: "Vendor",   desc: "You use their services", sub: "APIs, tools, infra" },
  ];

  return (
    <div className="flex h-full w-[440px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A] animate-slide-in-right">
      {/* Sticky header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
        <div>
          <div className="font-display text-sm font-bold text-zinc-900 dark:text-white">New Organisation</div>
          <div className="mt-0.5 text-xs text-zinc-500">Register a partner, client, or vendor</div>
        </div>
        <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
        {/* STEP 1 — Identity */}
        <div>
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Step 1 — Identity</p>

          {/* Avatar editor — top & center */}
          <div className="mb-5 rounded-2xl bg-zinc-50 p-4 dark:bg-white/5">
            <AvatarEditor
              name={name}
              avatarUrl={previewUrl ? previewUrl.replace("/api/backend", "") : null}
              color={color}
              onChange={setColor}
              onUpload={handleFileSelect}
              onRemove={() => { setPendingFile(null); setPreviewUrl(null); }}
              size={72}
            />
          </div>

          {/* Name */}
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Organisation name <span className="text-red-500">*</span>
            </label>
            <Input autoFocus placeholder="e.g. DesignCo, PartnerLabs…" value={name}
              onChange={e => autoSlug(e.target.value)} />
          </div>

          {/* Slug */}
          <div className="mb-3">
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Slug <span className="text-red-500">*</span>
            </label>
            <div className="flex overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700">
              <span className="shrink-0 bg-zinc-100 px-3 py-2.5 text-sm text-zinc-400 dark:bg-zinc-800">@</span>
              <input value={slug} onChange={e => setSlug(e.target.value)}
                className="flex-1 border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100" />
            </div>
            {slug && (
              <p className="mt-1 text-[11px] text-zinc-400">
                darshan.caringgems.in/organisations/{slug}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
              placeholder="What does this org do?"
              className="w-full resize-none rounded-xl border-0 bg-zinc-50 px-3 py-2.5 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700" />
          </div>
        </div>

        {/* STEP 2 — Relationship type */}
        <div>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Step 2 — Relationship type</p>
          <p className="mb-3 text-xs text-zinc-500">What is your relationship with this organisation?</p>
          <div className="flex flex-col gap-2">
            {TYPE_CARDS.map(tc => (
              <button key={tc.type} onClick={() => setType(tc.type)}
                className={cn(
                  "flex items-start gap-3 rounded-2xl p-3.5 ring-1 transition-all text-left",
                  type === tc.type
                    ? "bg-brand-50 ring-brand-400 dark:bg-brand-500/10 dark:ring-brand-500"
                    : "bg-zinc-50 ring-zinc-200 hover:ring-zinc-300 dark:bg-white/5 dark:ring-white/10"
                )}>
                <span className="mt-0.5 text-xl">{tc.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold", type === tc.type ? "text-brand-700 dark:text-brand-300" : "text-zinc-800 dark:text-zinc-200")}>
                      {tc.label}
                    </span>
                    {type === tc.type && <Check className="h-3.5 w-3.5 text-brand-600" />}
                  </div>
                  <p className={cn("text-xs font-semibold", type === tc.type ? "text-brand-600 dark:text-brand-400" : "text-zinc-500")}>{tc.desc}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">{tc.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-500/10">{error}</p>}
      </div>

      {/* Sticky footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-zinc-200 px-5 py-4 dark:border-[#2D2A45]">
        <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
        <div className="relative group">
          <button
            onClick={handleCreate}
            disabled={!canCreate || saving}
            className={cn(
              "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all",
              canCreate && !saving
                ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
                : "bg-zinc-100 text-zinc-400 cursor-not-allowed dark:bg-white/10 dark:text-zinc-500"
            )}>
            {saving ? "Creating…" : "Create Organisation →"}
          </button>
          {!canCreate && (
            <div className="absolute bottom-full mb-2 right-0 hidden group-hover:block z-10">
              <div className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs text-white whitespace-nowrap shadow-lg">
                Enter a name to continue
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Org Detail Panel ─────────────────────────────────────────────────────────
function OrgDetailPanel({ org: initialOrg, onClose, onUpdated, onDeleted }: {
  org: ExtOrg; onClose: () => void;
  onUpdated: (o: ExtOrg) => void;
  onDeleted: (id: string) => void;
}) {
  const [org,      setOrg]      = React.useState(initialOrg);
  const [tab,      setTab]      = React.useState<PanelTab>("overview");
  const [agents,   setAgents]   = React.useState<OrgAgent[]>([]);
  const [projects, setProjects] = React.useState<OrgProject[]>([]);

  // Settings state
  const [name,    setName]    = React.useState(org.name);
  const [slug,    setSlug]    = React.useState(org.slug);
  const [desc,    setDesc]    = React.useState(org.description ?? "");
  const [type,    setType]    = React.useState(org.type);
  const [color,   setColor]   = React.useState(org.avatar_color ?? avatarColor(org.name));
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [previewUrl,  setPreviewUrl]  = React.useState<string | null>(null);
  const [saving,  setSaving]  = React.useState(false);
  const [saved,   setSaved]   = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  React.useEffect(() => {
    fetchOrgAgents(org.id).then(a => setAgents(a as OrgAgent[]));
    fetchOrgProjects(org.id).then(setProjects);
  }, [org.id]);

  async function handleSave() {
    setSaving(true);
    let avatar_url = org.avatar_url;

    // Upload logo if there's a new file
    if (pendingFile) {
      const url = await uploadOrgLogo(org.id, pendingFile);
      if (url) avatar_url = url;
    }

    const updated = await updateOrg(org.id, {
      name: name.trim(), slug: slug.trim(),
      description: desc.trim() || undefined,
      type: type as string,
      avatar_color: color,
    });
    setSaving(false);
    if (updated) {
      const next = { ...org, ...updated, avatar_url } as ExtOrg;
      setOrg(next); setPendingFile(null); setPreviewUrl(null);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      onUpdated(next);
    }
  }

  async function handleRemoveLogo() {
    await deleteOrgLogo(org.id);
    const next = { ...org, avatar_url: undefined } as ExtOrg;
    setOrg(next); setPendingFile(null); setPreviewUrl(null);
    onUpdated(next);
  }

  async function handleArchive() {
    const updated = await updateOrg(org.id, { status: "archived" });
    if (updated) { const next = { ...org, ...updated } as ExtOrg; setOrg(next); onUpdated(next); }
  }

  async function handleDelete() {
    setDeleting(true);
    const ok = await deleteOrg(org.id);
    setDeleting(false);
    if (ok) onDeleted(org.id);
    else { setConfirmDelete(false); alert("Cannot delete an org with agents assigned. Remove agents first."); }
  }

  const tm      = ORG_TYPE_META[org.type] ?? ORG_TYPE_META.partner;
  const isOwn   = org.type === "own";
  const orgStatus = (org as unknown as { status?: string }).status ?? "active";
  const isArchived = orgStatus === "archived";
  const currentAvatarUrl = previewUrl ?? org.avatar_url;
  const TABS = [
    { id: "overview" as PanelTab, label: "Overview" },
    { id: "team"     as PanelTab, label: "Team"     },
    { id: "settings" as PanelTab, label: "Settings" },
  ];
  const inp = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700";

  return (
    <div className="flex h-full w-[480px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A] animate-slide-in-right">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-zinc-200 px-4 py-3 dark:border-[#2D2A45]">
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
          <X className="h-4 w-4" />
        </button>
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={28} className="rounded-lg" />
        <span className="flex-1 font-display font-bold text-zinc-900 dark:text-white truncate">{org.name}</span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", tm.badge)}>{tm.label}</span>
        <button onClick={() => setTab("settings")}
          className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-brand-600 dark:hover:bg-white/10 transition-colors"
          title="Settings">
          <Save className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex shrink-0 border-b border-zinc-200 dark:border-[#2D2A45]">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 border-b-2 py-2.5 text-sm font-semibold transition-colors -mb-px",
              tab === t.id
                ? "border-brand-600 text-zinc-900 dark:text-white"
                : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── OVERVIEW ── */}
        {tab === "overview" && (
          <div className="flex flex-col gap-0">
            {/* Identity card */}
            <div className="p-5">
              <div className="flex items-start gap-4">
                <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={64} />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl font-extrabold text-zinc-900 dark:text-white">{org.name}</h2>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tm.badge)}>{tm.label}</span>
                    <span className="font-mono text-xs text-zinc-400">@{org.slug}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      isArchived ? "bg-zinc-100 text-zinc-500" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400")}>
                      {isArchived ? "Archived" : "Active"}
                    </span>
                  </div>
                  {org.description && <p className="mt-1.5 text-sm text-zinc-500">{org.description}</p>}
                  <p className="mt-1 text-xs text-zinc-400">Created {fmtDate((org as unknown as { created_at?: string }).created_at)}</p>
                </div>
              </div>
              {/* Quick metrics */}
              <div className="mt-4 flex gap-2">
                {[
                  { label: `${org.agent_count ?? agents.length} agents`,   icon: Bot          },
                  { label: `${org.project_count ?? projects.length} projects`, icon: FolderKanban },
                  { label: `${org.online_count ?? 0} online`,              icon: Zap          },
                ].map(({ label, icon: Icon }) => (
                  <div key={label} className="flex flex-1 items-center gap-2 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                    <Icon className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 truncate">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="h-px bg-zinc-100 dark:bg-white/5" />

            {/* Agents preview (top 3) */}
            <div className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Agents {agents.length > 0 ? `(${agents.length})` : ""}
              </p>
              {agents.slice(0, 3).map(a => {
                const isOnline = a.status === "online";
                return (
                  <div key={a.id} className="mb-2 flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2 dark:bg-white/5">
                    <div className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-zinc-800 text-xs font-bold text-white">
                      {a.name[0]?.toUpperCase()}
                      <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-1 ring-white dark:ring-[#16132A]",
                        isOnline ? "bg-emerald-400" : "bg-zinc-400")} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{a.name}</div>
                      <div className="text-[11px] text-zinc-400">{a.agent_type?.replace("ai_","") ?? "agent"}</div>
                    </div>
                    <span className={cn("text-[11px] font-semibold", isOnline ? "text-emerald-600" : "text-zinc-400")}>
                      {isOnline ? "Online" : "Offline"}
                    </span>
                  </div>
                );
              })}
              {agents.length > 3 && (
                <button onClick={() => setTab("team")}
                  className="mt-1 flex items-center gap-1 text-xs text-brand-600 hover:underline">
                  → See all {agents.length} in Team tab
                </button>
              )}
              {agents.length === 0 && (
                <p className="text-sm text-zinc-400">No agents yet. <Link href="/agents" className="text-brand-600 hover:underline">+ Add agent</Link></p>
              )}
            </div>

            <div className="h-px bg-zinc-100 dark:bg-white/5" />

            {/* Projects */}
            <div className="p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Projects {projects.length > 0 ? `(${projects.length})` : ""}
              </p>
              {projects.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {projects.map(p => (
                    <Link key={p.id} href={`/projects/${p.slug}`}
                      className="flex flex-col gap-1 rounded-xl bg-zinc-50 px-3 py-2.5 hover:bg-zinc-100 dark:bg-white/5 dark:hover:bg-white/10 transition-colors">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{p.name}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          p.status === "active"  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                          p.status === "planned" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500"
                        )}>{p.status}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <ProgressBar value={p.progress} />
                        <span className="w-8 shrink-0 text-right text-[11px] text-zinc-400">{p.progress ?? 0}%</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-zinc-400">No projects linked yet.</p>
              )}
            </div>
          </div>
        )}

        {/* ── TEAM ── */}
        {tab === "team" && (
          <div className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                All Agents {agents.length > 0 && `(${agents.length})`}
              </p>
              <Link href="/agents" className="flex items-center gap-1 text-xs text-brand-600 hover:underline">
                <Plus className="h-3 w-3" /> Add agent
              </Link>
            </div>
            {agents.length > 0 ? (
              <div className="flex flex-col gap-2">
                {agents.map(a => {
                  const isOnline = a.status === "online";
                  return (
                    <div key={a.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-3 py-2.5 dark:bg-white/5">
                      <div className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-800 text-sm font-bold text-white">
                        {a.name[0]?.toUpperCase()}
                        <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-1 ring-white dark:ring-[#16132A]",
                          isOnline ? "bg-emerald-400" : "bg-zinc-400")} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{a.name}</div>
                        <div className="text-[11px] text-zinc-400">
                          {a.agent_type?.replace("ai_","") ?? "agent"}
                          {a.model && ` · ${a.model}`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className={cn("text-[11px] font-semibold", isOnline ? "text-emerald-600" : "text-zinc-400")}>
                          {isOnline ? "🟢 Online" : "⬤ Offline"}
                        </span>
                        <Link href="/agents" className="grid h-6 w-6 place-items-center rounded text-zinc-400 hover:text-brand-600">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-12 text-center">
                <Bot className="mb-3 h-8 w-8 text-zinc-300" />
                <p className="font-medium text-zinc-500">No agents in this org yet</p>
                <Link href="/agents" className="mt-2 text-sm text-brand-600 hover:underline">+ Onboard Agent</Link>
              </div>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === "settings" && (
          <div className="flex flex-col gap-0">
            <div className="p-5 flex flex-col gap-4">
              {/* Avatar editor */}
              <div>
                <label className="mb-3 block text-xs font-semibold uppercase tracking-wide text-zinc-400">Logo</label>
                <div className="rounded-2xl bg-zinc-50 p-4 dark:bg-white/5">
                  <AvatarEditor
                    name={name}
                    avatarUrl={currentAvatarUrl ?? null}
                    color={color}
                    onChange={c => setColor(c)}
                    onUpload={f => { setPendingFile(f); setPreviewUrl(URL.createObjectURL(f)); }}
                    onRemove={handleRemoveLogo}
                    size={72}
                  />
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Name</label>
                <Input value={name} onChange={e => setName(e.target.value)} />
              </div>

              {/* Slug */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Slug</label>
                <div className="flex overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700">
                  <span className="shrink-0 bg-zinc-100 px-3 py-2 text-sm text-zinc-400 dark:bg-zinc-800">@</span>
                  <input value={slug} onChange={e => setSlug(e.target.value)}
                    className="flex-1 border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100" />
                </div>
                {slug !== org.slug && (
                  <p className="mt-1 text-[11px] text-amber-600">⚠ Changing slug will break existing links</p>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
                <textarea value={desc} onChange={e => setDesc(e.target.value)}
                  rows={2} placeholder="What does this org do?"
                  className={cn(inp, "resize-none")} />
              </div>

              {/* Type (not editable for own) */}
              {!isOwn && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Type</label>
                  <div className="flex gap-2">
                    {(["partner","client","vendor"] as const).map(t => (
                      <button key={t} onClick={() => setType(t)}
                        className={cn("flex-1 rounded-xl py-2 text-sm font-semibold ring-1 transition-colors capitalize",
                          type === t ? "bg-brand-600 text-white ring-brand-600" : "bg-zinc-50 text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10")}>
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isOwn && (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Type</label>
                  <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-white/5">
                    <span className="text-sm text-zinc-500">Own workspace — locked</span>
                  </div>
                </div>
              )}

              {/* Save button — always visible */}
              <button onClick={handleSave} disabled={saving}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all",
                  saved
                    ? "bg-emerald-600 text-white"
                    : "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
                )}>
                {saving ? "Saving…" : saved ? "✓ Saved" : (<><Save className="h-4 w-4" /> Save changes</>)}
              </button>
            </div>

            <div className="mx-5 h-px bg-zinc-100 dark:bg-white/5" />

            {/* Danger zone */}
            <div className="p-5">
              <div className="rounded-xl border border-red-200 p-4 dark:border-red-500/20">
                <p className="mb-3 text-xs font-semibold text-red-600 dark:text-red-400">Danger zone</p>
                <div className="flex flex-col gap-2">
                  {!isArchived && (
                    <button onClick={handleArchive}
                      className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 transition-colors">
                      <Archive className="h-3.5 w-3.5" /> Archive organisation
                      <span className="ml-auto text-[10px] text-amber-500 font-normal">recoverable</span>
                    </button>
                  )}
                  {confirmDelete ? (
                    <div className="flex flex-col gap-2">
                      <p className="text-xs text-red-600">Are you sure? This cannot be undone.</p>
                      <div className="flex gap-2">
                        <button onClick={handleDelete} disabled={deleting}
                          className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60">
                          {deleting ? "Deleting…" : "Yes, delete"}
                        </button>
                        <button onClick={() => setConfirmDelete(false)}
                          className="flex-1 rounded-lg ring-1 ring-zinc-200 py-1.5 text-xs font-semibold text-zinc-600 dark:ring-white/10 dark:text-zinc-400">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDelete(true)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700",
                        "hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 transition-colors",
                        (org.agent_count ?? 0) > 0 && "opacity-50 pointer-events-none"
                      )}>
                      <Trash2 className="h-3.5 w-3.5" /> Delete organisation
                      {(org.agent_count ?? 0) > 0 && (
                        <span className="ml-auto text-[10px] text-red-400">remove agents first</span>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Own Org Featured Card ────────────────────────────────────────────────────
function OwnOrgCard({ org, onView }: { org: ExtOrg; onView: () => void }) {
  const router = useRouter();
  const orgStatus = (org as unknown as { status?: string }).status ?? "active";
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-brand-200 bg-brand-50/30 p-5 dark:border-brand-500/20 dark:bg-brand-500/5"
      style={{ borderLeft: "4px solid #7C3AED" }}>
      <div className="flex items-center gap-4">
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-lg font-extrabold text-zinc-900 dark:text-white">{org.name}</h2>
            <Crown className="h-4 w-4 text-brand-500" />
            <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">Own workspace</span>
            <span className="font-mono text-xs text-zinc-400">@{org.slug}</span>
          </div>
          {org.description && <p className="mt-0.5 text-sm text-zinc-500 truncate">{org.description}</p>}
          <div className="mt-2 flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />{org.agent_count ?? 0} agents</span>
            <span className="flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" />{org.project_count ?? 0} projects</span>
            <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-emerald-500" />{org.online_count ?? 0} online</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold",
            orgStatus === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" : "bg-zinc-100 text-zinc-500")}>
            ● {orgStatus === "active" ? "Active" : orgStatus}
          </span>
          <Link href={`/organisations/${org.id}`}
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
            Manage <ChevronRight className="h-4 w-4" />
          </Link>
          {/* ⋮ menu */}
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)}
              className="grid h-8 w-8 place-items-center rounded-xl text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-[#1E1B33] dark:ring-[#2D2A45]">
                <button onClick={() => { router.push(`/organisations/${org.id}`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Settings className="h-3.5 w-3.5" /> Settings
                </button>
                <button onClick={() => { router.push(`/organisations/${org.id}?tab=members`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Users className="h-3.5 w-3.5" /> Members
                </button>
                <button onClick={() => { router.push(`/organisations/${org.id}?tab=agents`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Bot className="h-3.5 w-3.5" /> Agents
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Member Org Card (admin / contributor / viewer of someone else's own org) ──
const MEMBER_ROLE_META: Record<string, {
  border: string; bg: string; badge: string; btnCls: string; btnLabel: string; btnHref: (id: string) => string;
}> = {
  admin: {
    border: "border-blue-300 dark:border-blue-500/30",
    bg: "bg-blue-50/30 dark:bg-blue-500/5",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    btnCls: "bg-blue-600 hover:bg-blue-700",
    btnLabel: "Manage",
    btnHref: (id) => `/organisations/${id}`,
  },
  contributor: {
    border: "border-brand-200 dark:border-brand-500/20",
    bg: "bg-brand-50/20 dark:bg-brand-500/5",
    badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300",
    btnCls: "bg-brand-600 hover:bg-brand-700",
    btnLabel: "View Projects",
    btnHref: () => `/projects`,
  },
  viewer: {
    border: "border-zinc-200 dark:border-zinc-600/30",
    bg: "bg-zinc-50/30 dark:bg-white/3",
    badge: "bg-zinc-100 text-zinc-500 dark:bg-white/10 dark:text-zinc-400",
    btnCls: "bg-zinc-600 hover:bg-zinc-700",
    btnLabel: "View",
    btnHref: (id) => `/organisations/${id}`,
  },
};

function MemberOrgCard({ org }: { org: ExtOrg }) {
  const router = useRouter();
  const role = org.my_role ?? "contributor";
  const meta = MEMBER_ROLE_META[role] ?? MEMBER_ROLE_META.contributor;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const borderColor = role === "admin" ? "#2563EB" : role === "viewer" ? "#A1A1AA" : "#7C3AED";

  return (
    <div className={cn("relative mb-4 overflow-hidden rounded-2xl border p-5", meta.border, meta.bg)}
      style={{ borderLeft: `4px solid ${borderColor}` }}>
      <div className="flex items-center gap-4">
        <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-bold text-zinc-900 dark:text-white">{org.name}</h2>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", meta.badge)}>
              {role}
            </span>
            <span className="font-mono text-xs text-zinc-400">@{org.slug}</span>
            {role === "viewer" && <Lock className="h-3 w-3 text-zinc-400" />}
          </div>
          {org.description && <p className="mt-0.5 text-sm text-zinc-500 truncate">{org.description}</p>}
          <div className="mt-1.5 flex items-center gap-4 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />{org.agent_count ?? 0} agents</span>
            <span className="flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" />{org.project_count ?? 0} projects</span>
            {(org.online_count ?? 0) > 0 && (
              <span className="flex items-center gap-1"><Zap className="h-3.5 w-3.5 text-emerald-500" />{org.online_count} online</span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href={meta.btnHref(org.id)}
            className={cn("flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white transition-colors", meta.btnCls)}>
            {meta.btnLabel} <ChevronRight className="h-4 w-4" />
          </Link>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen(v => !v)}
              className="grid h-8 w-8 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-[#1E1B33] dark:ring-[#2D2A45]">
                <button onClick={() => { router.push(`/organisations/${org.id}`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Building2 className="h-3.5 w-3.5" /> View Org
                </button>
                {(role === "admin" || role === "contributor") && (
                  <button onClick={() => { router.push(`/projects`); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                    <FolderKanban className="h-3.5 w-3.5" /> Projects
                  </button>
                )}
                {role === "admin" && (
                  <>
                    <button onClick={() => { router.push(`/organisations/${org.id}?tab=members`); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                      <Users className="h-3.5 w-3.5" /> Members
                    </button>
                    <button onClick={() => { router.push(`/organisations/${org.id}?tab=agents`); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                      <Bot className="h-3.5 w-3.5" /> Agents
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── External Org Card ────────────────────────────────────────────────────────
function ExternalOrgCard({ org, onView, onArchive }: {
  org: ExtOrg; onView: () => void;
  onArchive?: () => void;
}) {
  const router = useRouter();
  const eType = effectiveType(org);
  const tm = ORG_TYPE_META[eType] ?? ORG_TYPE_META.partner;
  const orgStatus = (org as unknown as { status?: string }).status ?? "active";
  const isArchived = orgStatus === "archived";
  const accentColor =
    eType === "partner" ? "bg-sky-500" :
    eType === "client"  ? "bg-emerald-500" :
    eType === "vendor"  ? "bg-amber-500" : "bg-zinc-400";

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      onClick={() => router.push(`/organisations/${org.id}`)}
      className={cn(
        "flex flex-col rounded-2xl bg-white ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45] overflow-hidden",
        "hover:shadow-md transition-all hover:-translate-y-0.5 cursor-pointer",
        isArchived && "opacity-60"
      )}>
      {/* Top accent bar */}
      <div className={cn("h-1 w-full shrink-0", accentColor)} />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={44} />
          <div className="min-w-0 flex-1">
            <div className="font-display font-bold text-zinc-900 dark:text-white truncate">{org.name}</div>
            <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", tm.badge)}>{tm.label}</span>
              <span className="font-mono text-[10px] text-zinc-400">@{org.slug}</span>
            </div>
          </div>
          {/* ⋮ menu */}
          <div className="relative shrink-0" ref={menuRef} onClick={e => e.stopPropagation()}>
            <button onClick={() => setMenuOpen(v => !v)}
              className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 w-44 rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-[#1E1B33] dark:ring-[#2D2A45]">
                <button onClick={() => { router.push(`/organisations/${org.id}`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Settings className="h-3.5 w-3.5" /> Settings
                </button>
                <button onClick={() => { router.push(`/organisations/${org.id}?tab=members`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Users className="h-3.5 w-3.5" /> Members
                </button>
                <button onClick={() => { router.push(`/organisations/${org.id}?tab=agents`); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                  <Bot className="h-3.5 w-3.5" /> Agents
                </button>
                {!isArchived && onArchive && (
                  <>
                    <div className="my-1 h-px bg-zinc-100 dark:bg-white/5" />
                    <button onClick={() => { onArchive(); setMenuOpen(false); }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10">
                      <Archive className="h-3.5 w-3.5" /> Archive
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {org.description
          ? <p className="line-clamp-2 text-xs leading-relaxed text-zinc-500">{org.description}</p>
          : <p className="text-xs italic text-zinc-300 dark:text-zinc-600">No description</p>
        }
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span className="flex items-center gap-1"><Bot className="h-3.5 w-3.5" />{org.agent_count ?? 0} agents</span>
          <span className="flex items-center gap-1"><FolderKanban className="h-3.5 w-3.5" />{org.project_count ?? 0} projects</span>
        </div>
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className={cn("font-semibold", isArchived ? "text-zinc-400" : "text-emerald-600")}>
            ● {isArchived ? "Archived" : "Active"}
          </span>
          <span>{relTime((org as unknown as { created_at?: string }).created_at)}</span>
        </div>
        <div className="flex gap-2 border-t border-zinc-100 pt-3 dark:border-white/5" onClick={e => e.stopPropagation()}>
          <Link href={`/organisations/${org.id}`}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
            <ExternalLink className="h-3 w-3" /> View
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── External Org List Row ────────────────────────────────────────────────────
function ExternalOrgListRow({ org, onView, onArchive }: {
  org: ExtOrg; onView: () => void; onArchive?: () => void;
}) {
  const router = useRouter();
  const tm = ORG_TYPE_META[effectiveType(org)] ?? ORG_TYPE_META.partner;
  const orgStatus = (org as unknown as { status?: string }).status ?? "active";
  const isArchived = orgStatus === "archived";

  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  return (
    <div className={cn(
      "group flex items-center gap-4 border-b border-zinc-100 px-2 py-3 dark:border-[#2D2A45]",
      "hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors cursor-pointer",
      isArchived && "opacity-60"
    )} onClick={() => router.push(`/organisations/${org.id}`)}>
      <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={32} className="rounded-lg" />
      <div className="w-40 shrink-0">
        <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{org.name}</div>
        <div className="font-mono text-[10px] text-zinc-400">@{org.slug}</div>
      </div>
      <div className="w-24 shrink-0">
        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tm.badge)}>{tm.label}</span>
      </div>
      <div className="w-20 shrink-0 text-xs font-semibold">
        <span className={isArchived ? "text-zinc-400" : "text-emerald-600"}>● {isArchived ? "Archived" : "Active"}</span>
      </div>
      <div className="w-16 shrink-0 text-xs text-zinc-500">{org.agent_count ?? 0}</div>
      <div className="w-20 shrink-0 text-xs text-zinc-500">{org.project_count ?? 0}</div>
      <div className="min-w-0 flex-1 text-xs text-zinc-400 truncate">{org.description ?? "—"}</div>
      <div className="w-20 shrink-0 text-xs text-zinc-400">
        {relTime((org as unknown as { created_at?: string }).created_at)}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
        <Link href={`/organisations/${org.id}`}
          className="flex items-center gap-1 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
          View
        </Link>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(v => !v)}
            className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10 transition-colors">
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl bg-white py-1.5 shadow-xl ring-1 ring-zinc-200 dark:bg-[#1E1B33] dark:ring-[#2D2A45]">
              <button onClick={() => { router.push(`/organisations/${org.id}?tab=members`); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                <Users className="h-3.5 w-3.5" /> Members
              </button>
              <button onClick={() => { router.push(`/organisations/${org.id}?tab=agents`); setMenuOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-white/5">
                <Bot className="h-3.5 w-3.5" /> Agents
              </button>
              {!isArchived && onArchive && (
                <button onClick={() => { onArchive(); setMenuOpen(false); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-amber-600 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10">
                  <Archive className="h-3.5 w-3.5" /> Archive
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrganisationsPage() {
  const [orgs,      setOrgs]      = React.useState<ExtOrg[]>([]);
  const [loading,   setLoading]   = React.useState(true);
  const [filter,    setFilter]    = React.useState<OrgFilter>("all");
  const [view,      setView]      = React.useState<OrgView>("grid");
  const [query,     setQuery]     = React.useState("");
  const [detailOrg, setDetailOrg] = React.useState<ExtOrg | null>(null);
  const [showNew,   setShowNew]   = React.useState(false);

  async function reload() {
    const os = await fetchOrgs() as ExtOrg[];
    setOrgs(os);
    setLoading(false);
  }
  React.useEffect(() => { reload(); }, []);

  async function handleArchive(orgId: string) {
    const updated = await updateOrg(orgId, { status: "archived" });
    if (updated) {
      setOrgs(prev => prev.map(o => o.id === orgId ? { ...o, ...(updated as ExtOrg) } : o));
    }
  }

  // "Own" = orgs where you are the actual owner
  const ownOrgs      = orgs.filter(o => o.type === "own" && (o.my_role === "owner" || !o.my_role));
  // "Member" = own orgs where you're admin/contributor/viewer (someone else's org you belong to)
  const memberOrgs   = orgs.filter(o => o.type === "own" && o.my_role && o.my_role !== "owner");
  // "External" = partner/client/vendor orgs (created by you or linked externally)
  const externalOrgs = orgs.filter(o => o.type !== "own");
  const totalAgents  = orgs.reduce((s, o) => s + (o.agent_count ?? 0), 0);

  const roleFilters = new Set(["admin", "contributor", "viewer"]);
  const typeFilters = new Set(["partner", "client", "vendor", "own"]);

  const filteredMember = memberOrgs.filter(o => {
    const st = (o as unknown as { status?: string }).status ?? "active";
    if (filter === "archived" && st !== "archived") return false;
    if (roleFilters.has(filter) && o.my_role !== filter) return false;
    if (typeFilters.has(filter)) return false; // type filter → hide member orgs
    if (query) {
      const q = query.toLowerCase();
      if (![o.name, o.slug, o.description ?? ""].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const filteredExternal = externalOrgs.filter(o => {
    const st = (o as unknown as { status?: string }).status ?? "active";
    if (filter === "archived" && st !== "archived") return false;
    if (roleFilters.has(filter)) return false; // role filter → hide external orgs
    if (filter === "own") return false;
    if (typeFilters.has(filter) && o.type !== filter) return false;
    if (query) {
      const q = query.toLowerCase();
      if (![o.name, o.slug, o.description ?? ""].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  const allTabs: { id: OrgFilter; label: string; count: number }[] = [
    { id: "all",         label: "All",         count: orgs.length },
    // Ownership
    { id: "own",         label: "Own",         count: ownOrgs.length },
    // Role-based (orgs you belong to)
    { id: "admin",       label: "Admin",       count: memberOrgs.filter(o => o.my_role === "admin").length },
    { id: "contributor", label: "Contributor", count: memberOrgs.filter(o => o.my_role === "contributor").length },
    { id: "viewer",      label: "Viewer",      count: memberOrgs.filter(o => o.my_role === "viewer").length },
    // External org types
    { id: "partner",     label: "Partner",     count: externalOrgs.filter(o => o.type === "partner").length },
    { id: "client",      label: "Client",      count: externalOrgs.filter(o => o.type === "client").length },
    { id: "vendor",      label: "Vendor",      count: externalOrgs.filter(o => o.type === "vendor").length },
    { id: "archived",    label: "Archived",    count: orgs.filter(o => (o as unknown as { status?: string }).status === "archived").length },
  ];
  // Only show tabs with count > 0 (always show "All")
  const FILTER_TABS = allTabs.filter(t => t.id === "all" || t.count > 0);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="flex flex-col gap-5">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl font-bold text-zinc-900 dark:text-white">Organisations</h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                {orgs.length} orgs · {ownOrgs.length} own · {externalOrgs.length} external · {totalAgents} agents
              </p>
            </div>
            <button onClick={() => { setShowNew(true); setDetailOrg(null); }}
              className="flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
              <Plus className="h-4 w-4" /> New Organisation
            </button>
          </div>

          {/* Stats */}
          <div className="flex gap-4">
            {[
              { label: "Total Orgs",   value: orgs.length,                          icon: Building2, cls: "bg-brand-600"   },
              ...(ownOrgs.length > 0
                ? [{ label: "Own",        value: ownOrgs.length,    icon: Crown,     cls: "bg-indigo-500"  }]
                : [{ label: "Member of",  value: memberOrgs.length, icon: Users,     cls: "bg-blue-500"    }]),
              { label: "External",     value: externalOrgs.length,                  icon: Building2, cls: "bg-sky-500"     },
              { label: "Agents total", value: totalAgents,                           icon: Bot,       cls: "bg-emerald-500" },
            ].map(({ label, value, icon: Icon, cls }) => (
              <div key={label} className="flex flex-1 items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]">
                <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl", cls)}>
                  <Icon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <div className="font-display text-2xl font-extrabold leading-none text-zinc-900 dark:text-white">{value}</div>
                  <div className="mt-0.5 text-xs text-zinc-400">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Filter tabs + search — only show tabs when there's something to filter */}
          <div className="flex items-center border-b border-zinc-200 dark:border-[#2D2A45]">
            {FILTER_TABS.length > 1 && FILTER_TABS.map(tab => (
              <button key={tab.id} onClick={() => setFilter(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors -mb-px",
                  filter === tab.id
                    ? "border-brand-600 text-zinc-900 dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}>
                {tab.label}
                <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-500 dark:bg-white/10">{tab.count}</span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search orgs…"
                  className="w-44 rounded-lg bg-zinc-100 py-1.5 pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-white/10 dark:text-white" />
              </div>
              <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-white/10">
                {([["grid", LayoutGrid], ["list", List]] as const).map(([v, Icon]) => (
                  <button key={v} onClick={() => setView(v)}
                    className={cn("grid h-7 w-7 place-items-center rounded-md transition-colors",
                      view === v ? "bg-white text-zinc-800 shadow-sm dark:bg-zinc-700 dark:text-white" : "text-zinc-400 hover:text-zinc-600")}>
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="py-16 text-center text-sm text-zinc-400">Loading…</div>
          ) : (
            <div>
              {/* Own org (workspace owner) */}
              {(filter === "all" || filter === "own") && ownOrgs.map(o => (
                <OwnOrgCard key={o.id} org={o} onView={() => { setDetailOrg(o); setShowNew(false); }} />
              ))}

              {/* Member orgs (admin / contributor / viewer) */}
              {(filter === "all" || roleFilters.has(filter)) && filteredMember.length > 0 && (
                <>
                  {filter === "all" && (ownOrgs.length > 0) && (
                    <div className="mb-2 flex items-center gap-3">
                      <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                      <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">Organisations I belong to</span>
                      <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                    </div>
                  )}
                  {filteredMember.map(o => <MemberOrgCard key={o.id} org={o} />)}
                </>
              )}

              {/* External section divider */}
              {filter === "all" && filteredExternal.length > 0 && (filteredMember.length > 0 || ownOrgs.length > 0) && (
                <div className="mb-4 flex items-center gap-3">
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                  <span className="text-xs font-semibold uppercase tracking-widest text-zinc-400">External Organisations</span>
                  <div className="h-px flex-1 bg-zinc-200 dark:bg-white/10" />
                </div>
              )}

              {/* External orgs */}
              {filter !== "own" && (
                filteredExternal.length === 0 ? (
                  <div className="py-20 text-center">
                    {query ? (
                      <>
                        <Search className="mx-auto mb-3 h-8 w-8 text-zinc-300" />
                        <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No orgs match "{query}"</p>
                        <button onClick={() => setQuery("")} className="mt-2 text-sm text-brand-600 hover:underline">× Clear</button>
                      </>
                    ) : (
                      <>
                        <Building2 className="mx-auto mb-3 h-10 w-10 text-zinc-300" />
                        <p className="font-display font-bold text-zinc-700 dark:text-zinc-200">No external organisations</p>
                        <p className="mt-1 text-sm text-zinc-400">Add partner, client, or vendor organisations.</p>
                        <button onClick={() => setShowNew(true)}
                          className="mt-4 mx-auto flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors">
                          <Plus className="h-4 w-4" /> Add Organisation
                        </button>
                      </>
                    )}
                  </div>
                ) : view === "grid" ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredExternal.map(o => (
                      <ExternalOrgCard key={o.id} org={o} onView={() => { setDetailOrg(o); setShowNew(false); }} onArchive={() => handleArchive(o.id)} />
                    ))}
                    {!query && (
                      <button onClick={() => { setShowNew(true); setDetailOrg(null); }}
                        className="flex min-h-[160px] flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 text-zinc-400 hover:border-brand-400 hover:bg-brand-50/30 hover:text-brand-600 dark:border-white/10 dark:hover:border-brand-500/50 transition-all">
                        <Building2 className="h-8 w-8" />
                        <span className="text-sm font-semibold">Add Organisation</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-[#2D2A45] dark:bg-[#16132A]">
                    <div className="flex items-center gap-4 border-b border-zinc-100 bg-zinc-50 px-2 py-2 dark:border-[#2D2A45] dark:bg-[#0F0D1E]">
                      <div className="w-8" />
                      {[["w-40","Organisation"],["w-24","Type"],["w-20","Status"],["w-16","Agents"],["w-20","Projects"],["flex-1","Description"],["w-20","Added"],["w-20",""]].map(([w,l]) => (
                        <div key={l} className={cn("text-[11px] font-semibold uppercase tracking-wide text-zinc-400 shrink-0", w)}>{l}</div>
                      ))}
                    </div>
                    {filteredExternal.map(o => (
                      <ExternalOrgListRow key={o.id} org={o} onView={() => { setDetailOrg(o); setShowNew(false); }} onArchive={() => handleArchive(o.id)} />
                    ))}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right panels */}
      {detailOrg && !showNew && (
        <OrgDetailPanel
          org={detailOrg}
          onClose={() => setDetailOrg(null)}
          onUpdated={o => { setOrgs(p => p.map(x => x.id === o.id ? o : x)); setDetailOrg(o); }}
          onDeleted={id => { setOrgs(p => p.filter(x => x.id !== id)); setDetailOrg(null); }}
        />
      )}
      {showNew && (
        <NewOrgPanel
          onDone={o => { setOrgs(p => [...p, o]); setShowNew(false); setDetailOrg(o); }}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
