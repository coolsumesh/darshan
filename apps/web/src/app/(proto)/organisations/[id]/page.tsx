"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  Archive, Bot, Building2, ChevronRight, ExternalLink, FolderKanban,
  Lock, Plus, Save, Shield, Trash2, Upload, Users, X, Camera, Link2,
  Crown, Check, Mail, Clock,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchOrg, updateOrg, deleteOrg, uploadOrgLogo, deleteOrgLogo,
  fetchOrgAgents, fetchOrgProjects, fetchOrgMembers, addOrgMember,
  updateOrgMemberRole, removeOrgMember, fetchAgents,
  fetchOrgUserMembers, removeOrgUserMember,
  inviteOrgUser, fetchPendingOrgInvites, revokeOrgInvite,
  type OrgDetail, type OrgMember, type OrgUserMember, type PendingOrgInvite,
} from "@/lib/api";
import type { Agent } from "@/lib/agents";

// ─── Constants ────────────────────────────────────────────────────────────────
const MITHRAN_AGENT_ID = "00000000-0000-0000-0000-000000000101";
const AVATAR_COLORS = ["#7C3AED", "#2563EB", "#0284C7", "#059669", "#D97706", "#DC2626"];

const ORG_TYPE_META: Record<string, {
  label: string; badge: string; accent: string;
}> = {
  own:     { label: "Own workspace", badge: "bg-brand-100 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300", accent: "border-brand-500" },
  partner: { label: "Partner",       badge: "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300",         accent: "border-sky-500"   },
  client:  { label: "Client",        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400", accent: "border-emerald-500" },
  vendor:  { label: "Vendor",        badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400", accent: "border-amber-500"  },
};

const ROLE_BADGE: Record<string, string> = {
  owner:  "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300",
  admin:  "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
  member: "bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-400",
};

type TabId = "general" | "members" | "agents" | "projects";

// ─── Helper types ─────────────────────────────────────────────────────────────
type OrgAgent = {
  id: string; name: string; status: string; agent_type?: string;
  model?: string; ping_status?: string; avatar_url?: string;
};
type OrgProject = {
  id: string; name: string; slug: string; status: string; progress?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function avatarColor(name: string, override?: string | null): string {
  if (override && !override.startsWith("/")) return override;
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function ProgressBar({ value }: { value?: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/10">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, value ?? 0)}%` }} />
    </div>
  );
}

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

// ─── Agent Avatar (initials) ──────────────────────────────────────────────────
function AgentAvatar({ name, size = 36 }: { name: string; size?: number }) {
  const bg = avatarColor(name);
  return (
    <div className="grid place-items-center rounded-xl font-bold text-white shrink-0"
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.38 }}>
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
  const [urlVal, setUrlVal] = React.useState("");

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
      <div className="group relative cursor-pointer" onClick={() => fileRef.current?.click()}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
        <div className="grid place-items-center rounded-2xl font-bold text-white overflow-hidden"
          style={{ width: size, height: size, backgroundColor: avatarUrl ? "transparent" : bg }}>
          {avatarUrl
            ? <img src={`/api/backend${avatarUrl}`} alt={name} className="w-full h-full object-cover" />
            : <span style={{ fontSize: size * 0.35 }}>{(name || "O")[0]?.toUpperCase()}</span>
          }
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
          <Camera className="h-6 w-6 text-white" />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 transition-colors">
          <Upload className="h-3.5 w-3.5" /> Upload image
        </button>
        <button onClick={() => setUrlMode(v => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-400 transition-colors">
          <Link2 className="h-3.5 w-3.5" /> URL
        </button>
        {onRemove && (
          <button onClick={onRemove}
            className="flex items-center gap-1 rounded-lg bg-zinc-100 px-2.5 py-1.5 text-xs font-semibold text-red-500 hover:bg-red-50 dark:bg-white/10 transition-colors">
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
      {urlMode && (
        <input value={urlVal} onChange={e => setUrlVal(e.target.value)}
          onBlur={() => { if (urlVal) onChange(urlVal); }}
          placeholder="https://example.com/logo.png"
          className="w-full rounded-xl border-0 bg-zinc-50 px-3 py-2 text-xs ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:ring-zinc-700" />
      )}
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

// ─── Agent Picker Modal ───────────────────────────────────────────────────────
function AgentPickerModal({ title, excludeIds, onPick, onClose }: {
  title: string;
  excludeIds: string[];
  onPick: (agent: Agent, role?: string) => void;
  onClose: () => void;
}) {
  const [agents, setAgents] = React.useState<Agent[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedRole, setSelectedRole] = React.useState("member");

  React.useEffect(() => {
    fetchAgents().then(all => setAgents(all.filter(a => !excludeIds.includes(a.id))));
  }, []);

  const filtered = agents.filter(a =>
    !query || a.name.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[480px] max-h-[600px] flex flex-col rounded-2xl bg-white shadow-2xl dark:bg-[#16132A] ring-1 ring-zinc-200 dark:ring-[#2D2A45]">
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-[#2D2A45] px-5 py-4">
          <div className="font-display font-bold text-zinc-900 dark:text-white">{title}</div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-zinc-400 hover:bg-zinc-100 dark:hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 border-b border-zinc-100 dark:border-[#2D2A45] flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search agents…"
            autoFocus
            className="flex-1 rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200 focus:outline-none focus:ring-brand-400/40 dark:bg-zinc-900 dark:ring-zinc-700 dark:text-zinc-100" />
          <select value={selectedRole} onChange={e => setSelectedRole(e.target.value)}
            className="rounded-xl bg-zinc-50 px-3 py-2 text-sm ring-1 ring-zinc-200 focus:outline-none dark:bg-zinc-900 dark:ring-zinc-700 dark:text-zinc-100">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
            <option value="owner">Owner</option>
          </select>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {filtered.length === 0 && (
            <p className="py-8 text-center text-sm text-zinc-400">No agents available</p>
          )}
          {filtered.map(a => (
            <button key={a.id} onClick={() => onPick(a, selectedRole)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-white/5 transition-colors">
              <AgentAvatar name={a.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-zinc-900 dark:text-white">{a.name}</div>
                <div className="text-[11px] text-zinc-400">
                  {(a as unknown as { agent_type?: string }).agent_type?.replace("ai_", "") ?? "agent"}
                  {(a as unknown as { model?: string }).model && ` · ${(a as unknown as { model?: string }).model}`}
                </div>
              </div>
              <span className={cn("text-[11px] font-semibold",
                a.status === "online" ? "text-emerald-600" : "text-zinc-400")}>
                ● {a.status === "online" ? "Online" : "Offline"}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Tab: General ─────────────────────────────────────────────────────────────
function GeneralTab({ org, canEdit, onUpdated, onDeleted }: {
  org: OrgDetail;
  canEdit: boolean;
  onUpdated: (o: OrgDetail) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = React.useState(org.name);
  const [slug, setSlug] = React.useState(org.slug);
  const [desc, setDesc] = React.useState(org.description ?? "");
  const [type, setType] = React.useState(org.type);
  const [color, setColor] = React.useState(org.avatar_color ?? avatarColor(org.name));
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const inp = "w-full rounded-xl border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 ring-1 ring-zinc-200 focus:outline-none focus:ring-2 focus:ring-brand-400/40 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-zinc-700 disabled:opacity-60";

  const currentAvatarUrl = previewUrl ?? org.avatar_url;
  const isArchived = (org as unknown as { status?: string }).status === "archived";
  const isOwn = org.type === "own";

  async function handleSave() {
    setSaving(true);
    let avatar_url = org.avatar_url;
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
      const next = { ...org, ...updated, avatar_url } as OrgDetail;
      setPendingFile(null); setPreviewUrl(null);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      onUpdated(next);
    }
  }

  async function handleRemoveLogo() {
    await deleteOrgLogo(org.id);
    onUpdated({ ...org, avatar_url: undefined } as OrgDetail);
  }

  async function handleArchive() {
    const updated = await updateOrg(org.id, { status: "archived" });
    if (updated) onUpdated({ ...org, ...updated } as OrgDetail);
  }

  async function handleDelete() {
    setDeleting(true);
    const ok = await deleteOrg(org.id);
    setDeleting(false);
    if (ok) onDeleted();
    else { setConfirmDelete(false); alert("Cannot delete an org with agents assigned. Remove agents first."); }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Logo */}
      <div className="rounded-2xl bg-zinc-50 p-5 dark:bg-white/5">
        <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-400">Logo & Branding</p>
        {canEdit ? (
          <AvatarEditor
            name={name}
            avatarUrl={currentAvatarUrl ?? null}
            color={color}
            onChange={setColor}
            onUpload={f => { setPendingFile(f); setPreviewUrl(URL.createObjectURL(f)); }}
            onRemove={handleRemoveLogo}
          />
        ) : (
          <div className="flex justify-center">
            <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={80} />
          </div>
        )}
      </div>

      {/* Fields */}
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Name</label>
          <Input value={name} onChange={e => setName(e.target.value)} disabled={!canEdit} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Slug</label>
          <div className="flex overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700">
            <span className="shrink-0 bg-zinc-100 px-3 py-2 text-sm text-zinc-400 dark:bg-zinc-800">@</span>
            <input value={slug} onChange={e => setSlug(e.target.value)} disabled={!canEdit}
              className="flex-1 border-0 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 outline-none dark:bg-zinc-900 dark:text-zinc-100 disabled:opacity-60" />
          </div>
          {canEdit && slug !== org.slug && (
            <p className="mt-1 text-[11px] text-amber-600">⚠ Changing slug will break existing links</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Description</label>
          <textarea value={desc} onChange={e => setDesc(e.target.value)} disabled={!canEdit}
            rows={3} placeholder="What does this org do?"
            className={cn(inp, "resize-none")} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-zinc-700 dark:text-zinc-300">Type</label>
          {canEdit && !isOwn ? (
            <div className="flex gap-2">
              {(["partner", "client", "vendor"] as const).map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn("flex-1 rounded-xl py-2 text-sm font-semibold ring-1 transition-colors capitalize",
                    type === t ? "bg-brand-600 text-white ring-brand-600" : "bg-zinc-50 text-zinc-600 ring-zinc-200 hover:bg-zinc-100 dark:bg-white/5 dark:text-zinc-400 dark:ring-white/10")}>
                  {t}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2.5 dark:bg-white/5">
              <span className="text-sm text-zinc-500 capitalize">{org.type} {isOwn ? "— locked" : ""}</span>
            </div>
          )}
        </div>
      </div>

      {/* Save */}
      {canEdit && (
        <button onClick={handleSave} disabled={saving}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition-all",
            saved ? "bg-emerald-600 text-white"
              : "bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60"
          )}>
          {saving ? "Saving…" : saved ? <><Check className="h-4 w-4" /> Saved</> : <><Save className="h-4 w-4" /> Save changes</>}
        </button>
      )}

      {/* Danger zone */}
      {canEdit && (
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
                className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-400 transition-colors">
                <Trash2 className="h-3.5 w-3.5" /> Delete organisation
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Members ─────────────────────────────────────────────────────────────
function MembersTab({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [members,        setMembers]        = React.useState<OrgMember[]>([]);
  const [users,          setUsers]          = React.useState<OrgUserMember[]>([]);
  const [pendingInvites, setPendingInvites] = React.useState<PendingOrgInvite[]>([]);
  const [loading,        setLoading]        = React.useState(true);
  const [showPicker,     setShowPicker]     = React.useState(false);
  const [emailInput,     setEmailInput]     = React.useState("");
  const [emailError,     setEmailError]     = React.useState("");
  const [invitingUser,   setInvitingUser]   = React.useState(false);
  const [inviteSent,     setInviteSent]     = React.useState("");
  const [inviteUnknown,  setInviteUnknown]  = React.useState(false);

  async function reload() {
    setLoading(true);
    const [m, u, p] = await Promise.all([
      fetchOrgMembers(orgId),
      fetchOrgUserMembers(orgId),
      fetchPendingOrgInvites(orgId),
    ]);
    setMembers(m);
    setUsers(u);
    setPendingInvites(p);
    setLoading(false);
  }

  React.useEffect(() => { reload(); }, [orgId]);

  async function handleInviteUser() {
    const email = emailInput.trim();
    if (!email) return;
    setInvitingUser(true);
    setEmailError("");
    setInviteSent("");
    setInviteUnknown(false);
    const result = await inviteOrgUser(orgId, email);
    if (result) {
      setPendingInvites(prev => [result.invite, ...prev.filter(i => i.invitee_email !== result.invite.invitee_email)]);
      setInviteSent(email);
      setInviteUnknown(!result.registered);
      setEmailInput("");
    } else {
      setEmailError("Failed to send invite. Please try again.");
    }
    setInvitingUser(false);
  }

  async function handleRevokeInvite(inviteId: string) {
    await revokeOrgInvite(orgId, inviteId);
    setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
  }

  async function handleRemoveUser(userId: string) {
    await removeOrgUserMember(orgId, userId);
    setUsers(prev => prev.filter(u => u.user_id !== userId));
  }

  async function handleRoleChange(agentId: string, role: string) {
    await updateOrgMemberRole(orgId, agentId, role);
    setMembers(prev => prev.map(m => m.agent_id === agentId ? { ...m, role: role as OrgMember["role"] } : m));
  }

  async function handleRemove(agentId: string) {
    await removeOrgMember(orgId, agentId);
    setMembers(prev => prev.filter(m => m.agent_id !== agentId));
  }

  async function handleAdd(agent: Agent, role?: string) {
    const member = await addOrgMember(orgId, agent.id, role ?? "member");
    if (member) {
      setMembers(prev => [...prev, { ...member, name: agent.name, status: agent.status }]);
    }
    setShowPicker(false);
  }

  const existingIds = members.map(m => m.agent_id);

  if (loading) return <div className="py-12 text-center text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="flex flex-col gap-6">

      {/* ── People (human users) ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            People ({users.length})
          </p>
        </div>

        {users.length === 0 && !canEdit ? (
          <p className="text-sm text-zinc-400">No people added yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt={u.name} referrerPolicy="no-referrer"
                    className="h-9 w-9 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-bold text-white">
                    {u.name[0]?.toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white">{u.name}</div>
                  <div className="text-[11px] text-zinc-400">{u.email}</div>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", ROLE_BADGE[u.role])}>
                  {u.role}
                </span>
                {canEdit && (
                  <button onClick={() => handleRemoveUser(u.user_id)}
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors"
                    title="Remove from org">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {canEdit && (
              <div className="flex flex-col gap-1.5">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={emailInput}
                    onChange={e => { setEmailInput(e.target.value); setEmailError(""); setInviteSent(""); setInviteUnknown(false); }}
                    onKeyDown={e => e.key === "Enter" && handleInviteUser()}
                    placeholder="Invite person by email…"
                    disabled={invitingUser}
                    className="flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-white/10 dark:bg-white/5 dark:text-white disabled:opacity-50"
                  />
                  <button onClick={handleInviteUser} disabled={invitingUser || !emailInput.trim()}
                    className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40 transition-colors">
                    <Mail className="h-3.5 w-3.5" />
                    {invitingUser ? "Sending…" : "Invite"}
                  </button>
                </div>
                {emailError && <p className="text-xs text-red-500">{emailError}</p>}
                {inviteSent && !inviteUnknown && (
                  <p className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" /> Invite sent to {inviteSent}
                  </p>
                )}
                {inviteSent && inviteUnknown && (
                  <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                    <Clock className="h-3.5 w-3.5" /> Invite saved — {inviteSent} doesn&apos;t have a Darshan account yet. They&apos;ll see it when they sign up.
                  </p>
                )}
              </div>
            )}

            {/* Pending invites */}
            {pendingInvites.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  <Clock className="h-3 w-3" /> Pending invites ({pendingInvites.length})
                </p>
                {pendingInvites.map(inv => (
                  <div key={inv.id} className="flex items-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 py-2.5 dark:border-white/10 dark:bg-white/3">
                    <Mail className="h-4 w-4 shrink-0 text-zinc-400" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-zinc-700 dark:text-zinc-300 truncate">{inv.invitee_email}</div>
                      <div className="text-[11px] text-zinc-400">
                        Invited · expires {new Date(inv.expires_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </div>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", ROLE_BADGE[inv.role])}>
                      {inv.role}
                    </span>
                    {canEdit && (
                      <button onClick={() => handleRevokeInvite(inv.id)}
                        title="Revoke invite"
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="h-px bg-zinc-100 dark:bg-white/5" />

      {/* ── AI Agents ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
            AI Agents ({members.length})
          </p>
          {canEdit && (
            <button onClick={() => setShowPicker(true)}
              className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Add Agent
            </button>
          )}
        </div>

      {members.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <Users className="mb-3 h-8 w-8 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-500">No members yet</p>
          {canEdit && (
            <button onClick={() => setShowPicker(true)}
              className="mt-3 text-sm text-brand-600 hover:underline">+ Add first member</button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {members.map(m => {
            const isHuman = m.agent_type === "human";
            return (
            <div key={m.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
              <AgentAvatar name={m.name} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-semibold text-zinc-900 dark:text-white">{m.name}</span>
                  <span className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                    isHuman
                      ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                      : "bg-violet-100 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300"
                  )}>
                    {isHuman ? "👤 Human" : "🤖 AI Agent"}
                  </span>
                </div>
                <div className="text-[11px] text-zinc-400 mt-0.5">
                  {m.model ? m.model : isHuman ? "Team member" : "AI Agent"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canEdit ? (
                  <select
                    value={m.role}
                    onChange={e => handleRoleChange(m.agent_id, e.target.value)}
                    className="rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 focus:outline-none dark:bg-white/10 dark:text-zinc-300 cursor-pointer">
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                  </select>
                ) : (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", ROLE_BADGE[m.role])}>
                    {m.role === "owner" && <Crown className="inline h-3 w-3 mr-0.5" />}
                    {m.role}
                  </span>
                )}
                {canEdit && (
                  <button onClick={() => handleRemove(m.agent_id)}
                    className="grid h-6 w-6 place-items-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ); })}
        </div>
      )}

      {showPicker && (
        <AgentPickerModal
          title="Add Member"
          excludeIds={existingIds}
          onPick={handleAdd}
          onClose={() => setShowPicker(false)}
        />
      )}
      </div>
    </div>
  );
}

// ─── Tab: Agents ──────────────────────────────────────────────────────────────
function AgentsTab({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const [agents, setAgents] = React.useState<OrgAgent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [showPicker, setShowPicker] = React.useState(false);

  async function reload() {
    setLoading(true);
    const a = await fetchOrgAgents(orgId);
    setAgents(a as OrgAgent[]);
    setLoading(false);
  }

  React.useEffect(() => { reload(); }, [orgId]);

  const existingIds = agents.map(a => a.id);

  if (loading) return <div className="py-12 text-center text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Agents ({agents.length})
        </p>
        {canEdit && (
          <Link href="/agents"
            className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Agent
          </Link>
        )}
      </div>

      {agents.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <Bot className="mb-3 h-8 w-8 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-500">No agents yet</p>
          <Link href="/agents" className="mt-3 text-sm text-brand-600 hover:underline">+ Onboard agent</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {agents.map(a => {
            const isOnline = a.status === "online";
            return (
              <div key={a.id} className="flex items-center gap-3 rounded-xl bg-zinc-50 px-4 py-3 dark:bg-white/5">
                <div className="relative">
                  <AgentAvatar name={a.name} size={36} />
                  <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-1 ring-white dark:ring-[#16132A]",
                    isOnline ? "bg-emerald-400" : "bg-zinc-400")} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-zinc-900 dark:text-white">{a.name}</div>
                  <div className="text-[11px] text-zinc-400">
                    {a.agent_type?.replace("ai_", "") ?? "agent"}
                    {a.model && ` · ${a.model}`}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("text-[11px] font-semibold", isOnline ? "text-emerald-600" : "text-zinc-400")}>
                    {isOnline ? "🟢 Online" : "⬤ Offline"}
                  </span>
                  <Link href="/agents"
                    className="grid h-6 w-6 place-items-center rounded-lg text-zinc-400 hover:text-brand-600 transition-colors">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Projects ────────────────────────────────────────────────────────────
function ProjectsTab({ orgId }: { orgId: string }) {
  const [projects, setProjects] = React.useState<OrgProject[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetchOrgProjects(orgId).then(p => { setProjects(p); setLoading(false); });
  }, [orgId]);

  if (loading) return <div className="py-12 text-center text-sm text-zinc-400">Loading…</div>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        Projects ({projects.length})
      </p>
      {projects.length === 0 ? (
        <div className="flex flex-col items-center py-12">
          <FolderKanban className="mb-3 h-8 w-8 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-500">No projects linked yet</p>
          <Link href="/projects" className="mt-3 text-sm text-brand-600 hover:underline">View all projects</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map(p => (
            <Link key={p.id} href={`/projects/${p.slug}`}
              className="flex flex-col gap-2 rounded-xl bg-zinc-50 px-4 py-3 hover:bg-zinc-100 dark:bg-white/5 dark:hover:bg-white/10 transition-colors">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{p.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                    p.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400" :
                    p.status === "planned" ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-500")}>
                    {p.status}
                  </span>
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ProgressBar value={p.progress} />
                <span className="w-8 shrink-0 text-right text-[11px] text-zinc-400">{p.progress ?? 0}%</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OrgSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const orgId = params.id as string;
  const initialTab = (searchParams.get("tab") as TabId) ?? "general";

  const [org, setOrg] = React.useState<OrgDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [currentRole, setCurrentRole] = React.useState<"owner" | "admin" | "member">("member");
  const [activeTab, setActiveTab] = React.useState<TabId>(initialTab);

  const canEdit = currentRole === "owner" || currentRole === "admin";

  React.useEffect(() => {
    async function load() {
      const orgData = await fetchOrg(orgId);
      setOrg(orgData);
      setCurrentRole(orgData?.my_role ?? "member");
      setLoading(false);
    }
    load();
  }, [orgId]);

  const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: "general",  label: "General",  icon: Building2   },
    { id: "members",  label: "Members",  icon: Users       },
    { id: "agents",   label: "Agents",   icon: Bot         },
    { id: "projects", label: "Projects", icon: FolderKanban },
  ];

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-sm text-zinc-400">Loading…</div>
      </div>
    );
  }

  if (!org) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <Building2 className="h-10 w-10 text-zinc-300" />
        <p className="text-zinc-500">Organisation not found</p>
        <Link href="/organisations" className="text-sm text-brand-600 hover:underline">← Back to Organisations</Link>
      </div>
    );
  }

  const tm = ORG_TYPE_META[org.type] ?? ORG_TYPE_META.partner;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 flex flex-col gap-6">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link href="/organisations" className="hover:text-zinc-900 dark:hover:text-white transition-colors">
            Organisations
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-zinc-900 dark:text-white">{org.name}</span>
        </div>

        {/* Header card */}
        <div className="flex items-center gap-4 rounded-2xl bg-white p-5 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]">
          <OrgAvatar name={org.name} avatarUrl={org.avatar_url} color={org.avatar_color} size={56} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-xl font-extrabold text-zinc-900 dark:text-white">{org.name}</h1>
              {org.type === "own" && <Crown className="h-4 w-4 text-brand-500" />}
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", tm.badge)}>{tm.label}</span>
              {!canEdit && (
                <span className="flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-semibold text-zinc-500 dark:bg-white/10">
                  <Lock className="h-3 w-3" /> Read-only
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-xs text-zinc-400">@{org.slug}</span>
              <span className={cn("text-xs font-semibold capitalize",
                currentRole === "owner" ? "text-purple-600 dark:text-purple-400" :
                currentRole === "admin" ? "text-blue-600 dark:text-blue-400" : "text-zinc-400")}>
                {currentRole === "owner" && "👑"} {currentRole}
              </span>
            </div>
            {org.description && <p className="mt-1 text-sm text-zinc-500 truncate">{org.description}</p>}
          </div>
        </div>

        {/* Read-only warning */}
        {!canEdit && (
          <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
            <Shield className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
              You have read-only access to this organisation.
            </p>
          </div>
        )}

        {/* Tab bar */}
        <div className="flex border-b border-zinc-200 dark:border-[#2D2A45]">
          {TABS.map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors -mb-px",
                  activeTab === tab.id
                    ? "border-brand-600 text-zinc-900 dark:text-white"
                    : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                )}>
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="rounded-2xl bg-white p-6 ring-1 ring-zinc-200 shadow-sm dark:bg-[#16132A] dark:ring-[#2D2A45]">
          {activeTab === "general" && (
            <GeneralTab
              org={org}
              canEdit={canEdit}
              onUpdated={o => setOrg(o)}
              onDeleted={() => router.push("/organisations")}
            />
          )}
          {activeTab === "members" && (
            <MembersTab orgId={org.id} canEdit={canEdit} />
          )}
          {activeTab === "agents" && (
            <AgentsTab orgId={org.id} canEdit={canEdit} />
          )}
          {activeTab === "projects" && (
            <ProjectsTab orgId={org.id} />
          )}
        </div>
      </div>
    </div>
  );
}
