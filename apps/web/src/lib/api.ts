// API client — calls the Darshan backend at /api/v1
// Falls back to mock data if the API is unreachable (dev/offline mode).

import { PROJECTS, TASKS, TEAM_MEMBERS, type Project, type Task, type TeamMember } from "./projects";
import { AGENTS, type Agent } from "./agents";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> ?? {}),
    };
    // Only set Content-Type when there is a body — Fastify v5 rejects
    // DELETE/GET requests that have Content-Type: application/json but no body.
    if (init?.body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",  // always send auth cookie
      ...init,
      headers,
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type AuthUser = { id: string; email: string; name: string; role: string; avatar_url?: string | null };

export async function authLogin(email: string, password: string): Promise<AuthUser | null> {
  const data = await apiFetch<{ ok: boolean; user: AuthUser }>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    credentials: "include",
  });
  return data?.ok ? data.user : null;
}

export async function authLogout(): Promise<void> {
  await apiFetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
}

export async function authMe(): Promise<AuthUser | null> {
  const data = await apiFetch<{ ok: boolean; user: AuthUser }>("/api/v1/auth/me", {
    credentials: "include",
  });
  return data?.ok ? data.user : null;
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const data = await apiFetch<{ ok: boolean; projects: Project[] }>("/api/v1/projects");
  if (data?.ok) return data.projects ?? [];
  // fallback (API unreachable)
  return PROJECTS;
}

export async function createProject(payload: {
  name: string; slug: string; description?: string; status?: string;
}): Promise<Project | null> {
  const data = await apiFetch<{ ok: boolean; project: Project }>("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data?.ok && data.project ? data.project : null;
}

export async function fetchProject(id: string): Promise<Project | undefined> {
  const data = await apiFetch<{ ok: boolean; project: Project }>(`/api/v1/projects/${id}`);
  if (data?.ok && data.project) return data.project;
  return PROJECTS.find((p) => p.id === id);
}

// ── Docs (Architecture + Tech Spec) ──────────────────────────────────────────

export async function fetchArchitecture(projectId: string): Promise<string | null> {
  const data = await apiFetch<{ ok: boolean; content: string }>(`/api/v1/projects/${projectId}/architecture`);
  return data?.ok ? data.content : null;
}

export async function fetchTechSpec(projectId: string): Promise<string | null> {
  const data = await apiFetch<{ ok: boolean; content: string }>(`/api/v1/projects/${projectId}/tech-spec`);
  return data?.ok ? data.content : null;
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const data = await apiFetch<{ ok: boolean; tasks: Task[] }>(`/api/v1/projects/${projectId}/tasks`);
  if (data?.ok && data.tasks) return data.tasks;
  return TASKS.filter((t) => t.projectId === projectId);
}

export async function createTask(projectId: string, payload: Partial<Task>): Promise<Task | null> {
  const data = await apiFetch<{ ok: boolean; task: Task }>(`/api/v1/projects/${projectId}/tasks`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return data?.task ?? null;
}

export async function updateTask(projectId: string, taskId: string, patch: Partial<Task>): Promise<Task | null> {
  const data = await apiFetch<{ ok: boolean; task: Task }>(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data?.task ?? null;
}

export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/projects/${projectId}/tasks/${taskId}`, {
    method: "DELETE",
  });
  return data?.ok ?? false;
}

// ── Team ──────────────────────────────────────────────────────────────────────

export type TeamMemberWithAgent = TeamMember & { agent?: Agent };

export async function fetchTeam(projectId: string): Promise<TeamMemberWithAgent[]> {
  const data = await apiFetch<{ ok: boolean; team: (TeamMember & Agent)[] }>(`/api/v1/projects/${projectId}/team`);
  if (data?.ok && data.team) {
    return data.team.map((m) => ({
      agentId: (m as unknown as { agent_id: string }).agent_id ?? m.agentId,
      role: m.role,
      joinedAt: (m as unknown as { joined_at: string }).joined_at ?? m.joinedAt,
      agent: {
        id:                   (m as unknown as { agent_id: string }).agent_id ?? m.id,
        name:                 m.name,
        desc:                 (m as unknown as { description?: string }).description ?? "",
        status:               m.status,
        lastProfileUpdateAt:  "",
        // Extended fields
        agent_type:    (m as unknown as { agent_type?: string }).agent_type,
        model:         (m as unknown as { model?: string }).model,
        provider:      (m as unknown as { provider?: string }).provider,
        capabilities:  (m as unknown as { capabilities?: string[] }).capabilities,
        ping_status:   (m as unknown as { ping_status?: string }).ping_status,
        last_ping_ms:  (m as unknown as { last_ping_ms?: number }).last_ping_ms,
        last_seen_at:  (m as unknown as { last_seen_at?: string }).last_seen_at,
        org_name:      (m as unknown as { org_name?: string }).org_name,
        org_slug:      (m as unknown as { org_slug?: string }).org_slug,
      },
    }));
  }
  // fallback
  const members = TEAM_MEMBERS[projectId] ?? [];
  return members.map((m) => ({ ...m, agent: AGENTS.find((a) => a.id === m.agentId) }));
}

export async function addTeamMember(projectId: string, agentId: string, role: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/projects/${projectId}/team`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, role }),
  });
  return data?.ok ?? false;
}

export async function removeTeamMember(projectId: string, agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/projects/${projectId}/team/${agentId}`, {
    method: "DELETE",
  });
  return data?.ok ?? false;
}

// ── Agents registry ───────────────────────────────────────────────────────────

export async function fetchAgents(): Promise<Agent[]> {
  const data = await apiFetch<{ ok: boolean; agents: Agent[] }>("/api/v1/agents");
  if (data?.ok) {
    if (!data.agents?.length) return [];
    return data.agents.map((a) => ({
      id: a.id,
      name: a.name,
      desc: (a as unknown as { desc?: string }).desc ?? "",
      status: a.status,
      lastProfileUpdateAt: (a as unknown as { updated_at?: string }).updated_at ?? "",
      // Extended fields
      org_id:          (a as unknown as { org_id?: string }).org_id,
      org_name:        (a as unknown as { org_name?: string }).org_name,
      org_slug:        (a as unknown as { org_slug?: string }).org_slug,
      agent_type:      (a as unknown as { agent_type?: string }).agent_type,
      model:           (a as unknown as { model?: string }).model,
      provider:        (a as unknown as { provider?: string }).provider,
      capabilities:    Array.isArray((a as unknown as { capabilities?: unknown }).capabilities) ? (a as unknown as { capabilities: string[] }).capabilities : [],
      ping_status:     (a as unknown as { ping_status?: string }).ping_status ?? "unknown",
      last_ping_at:    (a as unknown as { last_ping_at?: string }).last_ping_at,
      last_seen_at:    (a as unknown as { last_seen_at?: string }).last_seen_at,
      callback_token:  (a as unknown as { callback_token?: string }).callback_token,
      last_ping_ms:    (a as unknown as { last_ping_ms?: number }).last_ping_ms,
      open_task_count: (a as unknown as { open_task_count?: number }).open_task_count ?? 0,
    }));
  }
  return AGENTS;
}

export type Org = {
  id: string; name: string; slug: string; description?: string;
  type: "own" | "partner" | "client" | "vendor"; status: string;
  agent_count?: number; project_count?: number;
  created_at?: string; updated_at?: string;
  avatar_color?: string; avatar_url?: string;
};

export async function fetchOrgs(): Promise<Org[]> {
  const data = await apiFetch<{ ok: boolean; orgs: Org[] }>("/api/v1/orgs");
  return data?.ok ? data.orgs : [];
}

export async function pingAgent(agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/agents/${agentId}/ping`, { method: "POST" });
  return data?.ok ?? false;
}

export async function createOrg(payload: { name: string; slug: string; description?: string; type?: string }): Promise<Org | null> {
  const data = await apiFetch<{ ok: boolean; org: Org }>("/api/v1/orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data?.ok ? data.org : null;
}

export async function createOrgAgent(orgId: string, payload: {
  name: string; desc?: string; agent_type?: string;
  model?: string; provider?: string; capabilities?: string[]; endpoint_type?: string;
}): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${orgId}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data?.ok ?? false;
}

export type AgentProject = {
  id: string; name: string; slug: string; status: string;
  role?: string; assigned_at?: string;
};

export async function fetchAgentProjects(agentId: string): Promise<AgentProject[]> {
  const data = await apiFetch<{ ok: boolean; projects: AgentProject[] }>(`/api/v1/agents/${agentId}/projects`);
  return data?.ok ? data.projects : [];
}

export async function updateAgent(agentId: string, payload: Partial<{
  name: string; desc: string; agent_type: string;
  model: string; provider: string; capabilities: string[]; endpoint_type: string;
}>): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  return data?.ok ?? false;
}

export async function deleteAgent(agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/agents/${agentId}`, { method: "DELETE" });
  return data?.ok ?? false;
}

export type OrgDetail = Org & {
  online_count?: number;
  avatar_color?: string;
  status?: string;
  description?: string;
  created_at?: string;
  updated_at?: string;
  owner_user_id?: string;
  my_role?: "owner" | "admin" | "member";
};

export async function fetchOrg(idOrSlug: string): Promise<OrgDetail | null> {
  const data = await apiFetch<{ ok: boolean; org: OrgDetail }>(`/api/v1/orgs/${idOrSlug}`);
  return data?.ok ? data.org : null;
}

export async function updateOrg(idOrSlug: string, payload: Partial<{
  name: string; slug: string; description: string;
  type: string; status: string; avatar_color: string;
}>): Promise<OrgDetail | null> {
  const data = await apiFetch<{ ok: boolean; org: OrgDetail }>(`/api/v1/orgs/${idOrSlug}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data?.ok ? data.org : null;
}

export async function deleteOrg(idOrSlug: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${idOrSlug}`, { method: "DELETE" });
  return data?.ok ?? false;
}

export async function fetchOrgProjects(idOrSlug: string): Promise<{ id: string; name: string; slug: string; status: string; progress?: number }[]> {
  const data = await apiFetch<{ ok: boolean; projects: { id: string; name: string; slug: string; status: string; progress?: number }[] }>(`/api/v1/orgs/${idOrSlug}/projects`);
  return data?.ok ? data.projects : [];
}

export async function fetchOrgAgents(idOrSlug: string): Promise<Agent[]> {
  const data = await apiFetch<{ ok: boolean; agents: Agent[] }>(`/api/v1/orgs/${idOrSlug}/agents`);
  return data?.ok ? data.agents : [];
}

export async function uploadOrgLogo(idOrSlug: string, file: File): Promise<string | null> {
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(`/api/backend/api/v1/orgs/${idOrSlug}/logo`, { method: "POST", body: form });
    const data = await res.json() as { ok: boolean; avatar_url?: string };
    return data?.ok ? data.avatar_url ?? null : null;
  } catch { return null; }
}

export async function deleteOrgLogo(idOrSlug: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${idOrSlug}/logo`, { method: "DELETE" });
  return data?.ok ?? false;
}

export type OrgMember = {
  id: string;
  role: "owner" | "admin" | "member";
  agent_id: string;
  name: string;
  status: string;
  agent_type?: string;
  model?: string;
  avatar_url?: string;
  created_at: string;
};

export async function fetchOrgMembers(idOrSlug: string): Promise<OrgMember[]> {
  const data = await apiFetch<{ ok: boolean; members: OrgMember[] }>(`/api/v1/orgs/${idOrSlug}/members`);
  return data?.ok ? data.members : [];
}

export async function addOrgMember(idOrSlug: string, agentId: string, role: string): Promise<OrgMember | null> {
  const data = await apiFetch<{ ok: boolean; member: OrgMember }>(`/api/v1/orgs/${idOrSlug}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId, role }),
  });
  return data?.ok ? data.member : null;
}

export async function updateOrgMemberRole(idOrSlug: string, agentId: string, role: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${idOrSlug}/members/${agentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  return data?.ok ?? false;
}

export async function removeOrgMember(idOrSlug: string, agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${idOrSlug}/members/${agentId}`, {
    method: "DELETE",
  });
  return data?.ok ?? false;
}

export type Invite = {
  id: string; token: string; label?: string;
  org_id: string; org_name: string; org_slug: string;
  expires_at: string; accepted_at?: string; created_at: string;
  accepted_by?: string;
  invite_url?: string;
};

export async function fetchInvites(): Promise<Invite[]> {
  const data = await apiFetch<{ ok: boolean; invites: Invite[] }>("/api/v1/invites");
  return data?.ok ? data.invites.map((i) => ({
    ...i,
    invite_url: `https://darshan.caringgems.in/invite/${i.token}`,
  })) : [];
}

export async function createInvite(
  orgId: string, label?: string
): Promise<{ token: string; invite_url: string; expires_at: string } | null> {
  const data = await apiFetch<{ ok: boolean; token: string; invite_url: string; expires_at: string }>(
    `/api/v1/orgs/${orgId}/invites`,
    { method: "POST", body: JSON.stringify({ label }) }
  );
  return data?.ok ? data : null;
}

// ── Project user members (human collaborators) ────────────────────────────────

export type UserMember = {
  id: string;
  user_id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
  joined_at: string;
  avatar_url?: string;
  invited_by_name?: string;
};

export async function fetchUserMembers(projectId: string): Promise<UserMember[]> {
  const data = await apiFetch<{ ok: boolean; members: UserMember[] }>(`/api/v1/projects/${projectId}/user-members`);
  return data?.ok ? data.members : [];
}

export async function addUserMember(
  projectId: string, email: string, role: string
): Promise<UserMember | null> {
  const data = await apiFetch<{ ok: boolean; member: UserMember }>(`/api/v1/projects/${projectId}/user-members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return data?.ok ? data.member : null;
}

export async function removeUserMember(projectId: string, userId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/projects/${projectId}/user-members/${userId}`, {
    method: "DELETE",
  });
  return data?.ok ?? false;
}

// ── Project invite links ───────────────────────────────────────────────────────

export type ProjectInvite = {
  id: string;
  token: string;
  role: "admin" | "member";
  project_id: string;
  project_name: string;
  project_slug: string;
  invited_by_name?: string;
  invitee_email?: string;
  expires_at: string;
  accepted_at?: string;
  declined_at?: string;
  accepted_by_name?: string;
  invite_url: string;
  invite_type: "project";
};

export type OrgInvite = {
  id: string;
  token: string;
  role: "owner" | "admin" | "member";
  org_id: string;
  org_name: string;
  org_slug: string;
  invited_by_name?: string;
  invitee_email: string;
  expires_at: string;
  accepted_at?: string;
  declined_at?: string;
  invite_url: string;
  invite_type: "org";
};

export type AnyInvite = ProjectInvite | OrgInvite;

/** Pending invites (project + org) addressed to the current user's email */
export async function fetchMyInvites(): Promise<AnyInvite[]> {
  const data = await apiFetch<{ ok: boolean; invites: AnyInvite[] }>("/api/v1/me/invites");
  return data?.ok ? data.invites : [];
}

/** Preview an invite by token (public) */
export async function fetchInviteByToken(token: string): Promise<ProjectInvite | null> {
  const data = await apiFetch<{ ok: boolean; invite: ProjectInvite }>(`/api/v1/invites/project/${token}`);
  return data?.ok ? data.invite : null;
}

/** Accept an invite */
export async function acceptProjectInvite(token: string): Promise<{ project_slug: string; project_name: string } | null> {
  const data = await apiFetch<{ ok: boolean; project_slug: string; project_name: string }>(
    `/api/v1/invites/project/${token}/accept`, { method: "POST" }
  );
  return data?.ok ? { project_slug: data.project_slug, project_name: data.project_name } : null;
}

/** Decline an invite */
export async function declineProjectInvite(token: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/invites/project/${token}/decline`, { method: "POST" });
  return data?.ok ?? false;
}

/** Generate an invite link for a project (admin+) */
export async function createProjectInvite(
  projectId: string, email?: string, role?: string
): Promise<ProjectInvite | null> {
  const data = await apiFetch<{ ok: boolean; invite: ProjectInvite }>(`/api/v1/projects/${projectId}/invites`, {
    method: "POST",
    body: JSON.stringify({ email: email || undefined, role: role || "member" }),
  });
  return data?.ok ? data.invite : null;
}

/** List invites for a project (admin+) */
export async function fetchProjectInvites(projectId: string): Promise<ProjectInvite[]> {
  const data = await apiFetch<{ ok: boolean; invites: ProjectInvite[] }>(`/api/v1/projects/${projectId}/invites`);
  return data?.ok ? data.invites : [];
}

/** Revoke an invite (admin+) */
export async function revokeProjectInvite(projectId: string, inviteId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/projects/${projectId}/invites/${inviteId}`, { method: "DELETE" });
  return data?.ok ?? false;
}

// ── Org User Members ──────────────────────────────────────────────────────────

export type OrgUserMember = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: "owner" | "admin" | "member";
  created_at: string;
};

export async function fetchOrgUserMembers(idOrSlug: string): Promise<OrgUserMember[]> {
  const data = await apiFetch<{ ok: boolean; users: OrgUserMember[] }>(`/api/v1/orgs/${idOrSlug}/users`);
  return data?.ok ? data.users : [];
}

export async function addOrgUserMember(idOrSlug: string, email: string, role = "member"): Promise<OrgUserMember | null> {
  const data = await apiFetch<{ ok: boolean; user: OrgUserMember }>(`/api/v1/orgs/${idOrSlug}/users`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return data?.ok ? data.user : null;
}

export async function removeOrgUserMember(idOrSlug: string, userId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${idOrSlug}/users/${userId}`, { method: "DELETE" });
  return data?.ok ?? false;
}

// ── Org user invites (email-based, notification flow) ─────────────────────────

export type PendingOrgInvite = {
  id: string;
  token: string;
  invitee_email: string;
  role: "owner" | "admin" | "member";
  expires_at: string;
  created_at: string;
  invited_by_name?: string;
};

/** Invite a user to an org by email — creates invite record, shows in their bell */
export async function inviteOrgUser(
  idOrSlug: string, email: string, role = "member"
): Promise<PendingOrgInvite | null> {
  const data = await apiFetch<{ ok: boolean; invite: PendingOrgInvite }>(
    `/api/v1/orgs/${idOrSlug}/user-invites`,
    { method: "POST", body: JSON.stringify({ email, role }) }
  );
  return data?.ok ? data.invite : null;
}

/** List pending (unaccepted) org user invites — for admin view */
export async function fetchPendingOrgInvites(idOrSlug: string): Promise<PendingOrgInvite[]> {
  const data = await apiFetch<{ ok: boolean; invites: PendingOrgInvite[] }>(
    `/api/v1/orgs/${idOrSlug}/user-invites`
  );
  return data?.ok ? data.invites : [];
}

/** Revoke a pending org invite */
export async function revokeOrgInvite(idOrSlug: string, inviteId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(
    `/api/v1/orgs/${idOrSlug}/user-invites/${inviteId}`,
    { method: "DELETE" }
  );
  return data?.ok ?? false;
}

/** Accept an org invite — adds user to org_user_members */
export async function acceptOrgInvite(token: string): Promise<{ org_name: string; org_id: string } | null> {
  const data = await apiFetch<{ ok: boolean; org_name: string; org_id: string }>(
    `/api/v1/invites/org/${token}/accept`, { method: "POST" }
  );
  return data?.ok ? { org_name: data.org_name, org_id: data.org_id } : null;
}

/** Decline an org invite */
export async function declineOrgInvite(token: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/invites/org/${token}/decline`, { method: "POST" });
  return data?.ok ?? false;
}

// ── Task Activity ──────────────────────────────────────────────────────────────

export type TaskActivity = {
  id: string;
  actor_name: string;
  actor_type: "human" | "agent" | "system";
  action: "created" | "status_changed" | "assigned";
  from_value: string | null;
  to_value: string | null;
  created_at: string;
};

export async function fetchTaskActivity(projectId: string, taskId: string): Promise<TaskActivity[]> {
  const data = await apiFetch<{ ok: boolean; activity: TaskActivity[] }>(
    `/api/v1/projects/${projectId}/tasks/${taskId}/activity`
  );
  return data?.ok ? data.activity : [];
}
