// API client — calls the Darshan backend at /api/v1
// Falls back to mock data if the API is unreachable (dev/offline mode).

import { type Project, type Task, type TeamMember } from "./projects";
export type { Project } from "./projects";
import { type Agent } from "./agents";
import { type ProjectChatMessage } from "@darshan/shared";

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
  return [];
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
  return undefined;
}

export async function updateProject(id: string, patch: Partial<{
  name: string; description: string; status: string; progress: number; agent_briefing: string;
}>): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return data?.ok ?? false;
}

// ── Threads ───────────────────────────────────────────────────────────────────

export type Thread = {
  thread_id: string;
  subject: string;
  project_id: string | null;
  created_by: string;
  created_slug: string;
  created_at: string;
  deleted_at: string | null;
  my_removed_at: string | null;
  status: "open" | "closed" | "archived";
  thread_type?: "conversation" | "feature" | "level_test" | "task";
  assignee_agent_id?: string | null;
  assignee_user_id?: string | null;
  assignee_name?: string | null;
  priority?: "high" | "medium" | "normal" | "low" | null;
  task_status?: "proposed" | "approved" | "in-progress" | "review" | "blocked" | null;
  completion_note?: string | null;
  done_at?: string | null;
  description?: string | null;
  last_activity?: string | null;
  has_reply_pending?: boolean;
  next_reply?: ThreadNextReply | null;
};

export type ThreadNextReply = {
  thread_id: string;
  mode: "any" | "all";
  pending_participant_ids: string[];
  pending_participants: Array<{ participant_id: string; participant_slug: string }>;
  pending_participant_slugs: string[];
  reason: string | null;
  set_by: string | null;
  set_at: string;
  expires_at: string | null;
  cleared_at: string | null;
  is_expired: boolean;
};

export type ThreadAttachment = {
  type: "image" | "video" | "audio" | "file";
  mime: string;
  size: number;
  url: string;
  filename: string;
  duration?: number | null;
};

export type ThreadMessageIntent =
  | "greeting"
  | "question"
  | "answer"
  | "suggest"
  | "work_confirmation"
  | "status_update"
  | "review_request"
  | "blocked"
  | "closure";

export type ThreadReceiptSummary = {
  total_recipients: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  all_sent: boolean;
  all_delivered: boolean;
  all_read: boolean;
};

export type ThreadMessage = {
  message_id: string;
  thread_id: string;
  reply_to: string | null;
  sender_id: string;
  sender_slug: string;
  type: string;
  body: string;
  attachments?: ThreadAttachment[];
  sent_at: string;
  intent?: ThreadMessageIntent;
  intent_confidence?: number | null;
  awaiting_on?: "user" | "agent" | "none";
  next_expected_from?: string | null;
  receipt_summary?: ThreadReceiptSummary;
};

export type ThreadFlowStep = {
  seq: number;
  event_type: string;
  from_actor: string;
  to_actor: string | null;
  message_id: string | null;
  created_at: string;
  awaiting_on: "user" | "agent" | "none";
  next_expected_from: string | null;
};

export type ThreadFlow = {
  path: ThreadFlowStep[];
  awaiting_on: "user" | "agent" | null;
  next_expected_from: string | null;
};

export type ThreadParticipant = {
  thread_id: string;
  participant_id: string;
  participant_slug: string;
  added_by: string | null;
  added_by_slug: string | null;
  joined_at: string;
  removed_at: string | null;
};

export type ThreadAccessRole = "creator" | "owner" | "participant" | "removed";

export type ThreadDetail = {
  thread: Thread;
  participants: ThreadParticipant[];
  role: ThreadAccessRole;
  flow: ThreadFlow;
};

export type ThreadReplyPolicy = {
  thread_id: string;
  mode: "all" | "restricted";
  allowed_participant_ids: string[];
  allowed_participants: Array<{ participant_id: string; participant_slug: string }>;
  next_message_limit: number | null;
  expires_at: string | null;
  updated_by: string | null;
  updated_at: string;
};

export type ThreadSlaState = {
  thread_id: string;
  pickup_due_at: string | null;
  progress_due_at: string | null;
  last_progress_at: string | null;
  last_event_type: string | null;
  last_event_at: string | null;
  stale_reason: string | null;
};

export type ThreadParticipantMutationResult = {
  ok: boolean;
  status: number;
  error?: string;
  participant_id?: string;
  participant_slug?: string;
};

export async function fetchThreads(
  projectId?: string | null,
  status: "open" | "closed" | "archived" | "all" = "open",
  search?: string
): Promise<Thread[]> {
  const qs = new URLSearchParams({ limit: "50", status });
  if (projectId) qs.set("project_id", projectId);
  if (search?.trim()) qs.set("search", search.trim());
  const data = await apiFetch<{ ok: boolean; threads: Thread[] }>(`/api/v1/threads?${qs}`);
  return data?.ok ? (data.threads ?? []) : [];
}

export async function fetchThread(threadId: string): Promise<ThreadDetail | null> {
  const data = await apiFetch<{ ok: boolean; thread: Thread; participants?: ThreadParticipant[]; role?: ThreadAccessRole; flow?: ThreadFlow }>(
    `/api/v1/threads/${threadId}`
  );
  if (!data?.ok || !data.thread) return null;
  return {
    thread: data.thread,
    participants: data.participants ?? [],
    role: data.role ?? "participant",
    flow: data.flow ?? { path: [], awaiting_on: null, next_expected_from: null },
  };
}

export async function fetchThreadSla(threadId: string): Promise<{ reply_policy: ThreadReplyPolicy | null; sla_state: ThreadSlaState | null } | null> {
  const data = await apiFetch<{
    ok: boolean;
    reply_policy: ThreadReplyPolicy | null;
    sla_state: ThreadSlaState | null;
  }>(`/api/v1/threads/${threadId}/sla`);
  if (!data?.ok) return null;
  return {
    reply_policy: data.reply_policy ?? null,
    sla_state: data.sla_state ?? null,
  };
}

export async function fetchThreadMessages(threadId: string, limit = 50): Promise<ThreadMessage[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const data = await apiFetch<{ ok: boolean; messages: ThreadMessage[] }>(
    `/api/v1/threads/${threadId}/messages?limit=${safeLimit}`
  );
  return data?.ok ? (data.messages ?? []) : [];
}

export async function markThreadMessageDelivered(threadId: string, messageId: string): Promise<ThreadReceiptSummary | null> {
  const data = await apiFetch<{ ok: boolean; receipt_summary?: ThreadReceiptSummary }>(
    `/api/v1/threads/${threadId}/messages/${messageId}/delivered`,
    { method: "POST" }
  );
  return data?.ok ? (data.receipt_summary ?? null) : null;
}

export async function markThreadMessageRead(threadId: string, messageId: string): Promise<ThreadReceiptSummary | null> {
  const data = await apiFetch<{ ok: boolean; receipt_summary?: ThreadReceiptSummary }>(
    `/api/v1/threads/${threadId}/messages/${messageId}/read`,
    { method: "POST" }
  );
  return data?.ok ? (data.receipt_summary ?? null) : null;
}

export async function uploadThreadAttachment(threadId: string, file: File): Promise<ThreadAttachment | null> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`/api/v1/threads/${threadId}/attachments/upload`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.ok ? (data.attachment ?? null) : null;
}

export async function sendThreadMessage(
  threadId: string,
  body: string,
  attachments: ThreadAttachment[] = []
): Promise<{ ok: true; message: ThreadMessage } | { ok: false; error?: string; status?: number }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/threads/${threadId}/messages`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, attachments }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; message?: ThreadMessage; error?: string } | null;
    if (!res.ok || !data?.ok || !data.message) {
      return { ok: false, error: data?.error ?? `HTTP ${res.status}`, status: res.status };
    }
    return { ok: true, message: data.message };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function updateThreadNextReply(
  threadId: string,
  payload: {
    mode: "any" | "all";
    pending_participant_ids: string[];
    reason?: string | null;
    expires_at?: string | null;
  }
): Promise<Thread | null> {
  const data = await apiFetch<{ ok: boolean; thread: Thread }>(
    `/api/v1/threads/${threadId}/next-reply`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
  return data?.ok ? data.thread ?? null : null;
}

export async function clearThreadNextReply(threadId: string): Promise<Thread | null> {
  const data = await apiFetch<{ ok: boolean; thread: Thread }>(
    `/api/v1/threads/${threadId}/next-reply`,
    { method: "DELETE" }
  );
  return data?.ok ? data.thread ?? null : null;
}

export async function fetchThreadParticipants(threadId: string): Promise<ThreadParticipant[]> {
  const data = await apiFetch<{ ok: boolean; participants: ThreadParticipant[] }>(
    `/api/v1/threads/${threadId}/participants`
  );
  return data?.ok ? (data.participants ?? []) : [];
}

export async function addThreadParticipant(
  threadId: string,
  participantId: string
): Promise<ThreadParticipantMutationResult> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/threads/${threadId}/participants`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ participant_id: participantId }),
    });
    const data = await res.json().catch(() => null) as
      | { ok?: boolean; error?: string; participant_id?: string; participant_slug?: string }
      | null;

    return {
      ok: res.ok && !!data?.ok,
      status: res.status,
      error: data?.error,
      participant_id: data?.participant_id,
      participant_slug: data?.participant_slug,
    };
  } catch {
    return { ok: false, status: 0, error: "Network error while adding participant" };
  }
}

export async function removeThreadParticipant(
  threadId: string,
  participantId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/threads/${threadId}/participants/${participantId}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    return { ok: res.ok && !!data?.ok, error: data?.error };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export async function updateThread(
  threadId: string,
  patch: {
    subject?: string;
    thread_type?: "conversation" | "feature" | "level_test" | "task";
    status?: "open" | "closed" | "archived";
    task_status?: "proposed" | "approved" | "in-progress" | "review" | "blocked";
    completion_note?: string | null;
    assignee_agent_id?: string | null;
    assignee_user_id?: string | null;
    priority?: "high" | "medium" | "normal" | "low";
    description?: string;
  }
): Promise<Thread | null> {
  const data = await apiFetch<{ ok: boolean; thread: Thread }>(
    `/api/v1/threads/${threadId}`,
    { method: "PATCH", body: JSON.stringify(patch) }
  );
  return data?.ok ? (data.thread ?? null) : null;
}

export async function setThreadStatus(
  threadId: string,
  status: "open" | "closed" | "archived"
): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(
    `/api/v1/threads/${threadId}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  );
  return data?.ok ?? false;
}

export async function createThread(
  subject: string,
  projectId: string,
  participantIds: string[]
): Promise<Thread | null> {
  const data = await apiFetch<{ ok: boolean; thread: Thread }>(
    `/api/v1/threads`,
    { method: "POST", body: JSON.stringify({ subject, project_id: projectId, participants: participantIds }) }
  );
  return data?.ok ? data.thread ?? null : null;
}

export async function sendDirectMessage(
  toId: string,
  body: string,
  projectId: string,
  subject?: string
): Promise<{ thread_id: string; message_id: string } | null> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/threads/direct`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: toId, body, project_id: projectId, subject }),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; thread_id?: string; message_id?: string } | null;
    return res.ok && data?.ok ? { thread_id: data.thread_id!, message_id: data.message_id! } : null;
  } catch {
    return null;
  }
}

function mapThreadToTask(thread: Thread & Record<string, unknown>): Task {
  const rawStatus = typeof thread.task_status === "string"
    ? thread.task_status
    : thread.status === "closed"
      ? "done"
      : "proposed";
  const priority = thread.priority === "normal" ? "medium" : (thread.priority ?? "medium");

  return {
    id: thread.thread_id,
    projectId: thread.project_id ?? "",
    title: thread.subject,
    description: typeof thread.description === "string" ? thread.description : "",
    status: rawStatus as Task["status"],
    assignee: typeof thread.assignee_name === "string" ? thread.assignee_name : undefined,
    assignee_agent_id: typeof thread.assignee_agent_id === "string" ? thread.assignee_agent_id : null,
    assignee_user_id: typeof thread.assignee_user_id === "string" ? thread.assignee_user_id : null,
    priority: priority as Task["priority"],
    completion_note: typeof thread.completion_note === "string" ? thread.completion_note : undefined,
    completed_at: typeof thread.done_at === "string" ? thread.done_at : undefined,
  };
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
  const data = await apiFetch<{ ok: boolean; threads: Thread[] }>(`/api/v1/projects/${projectId}/threads?type=task`);
  if (data?.ok && data.threads) return data.threads.map((thread) => mapThreadToTask(thread as Thread & Record<string, unknown>));
  return [];
}

export async function createTask(projectId: string, payload: Partial<Task>): Promise<Task | null> {
  const priority = payload.priority === "urgent" ? "high" : payload.priority;
  const data = await apiFetch<{ ok: boolean; thread: Thread }>(`/api/v1/threads`, {
    method: "POST",
    body: JSON.stringify({
      project_id: projectId,
      subject: payload.title,
      description: payload.description,
      thread_type: "task",
      task_status: payload.status === "done" ? undefined : payload.status,
      priority,
      assignee_agent_id: payload.assignee_agent_id,
      assignee_user_id: payload.assignee_user_id,
    }),
  });
  return data?.thread ? mapThreadToTask(data.thread as Thread & Record<string, unknown>) : null;
}

export async function updateTask(projectId: string, taskId: string, patch: Partial<Task>): Promise<Task | null> {
  const body: Record<string, unknown> = {};
  if (patch.title !== undefined) body.subject = patch.title;
  if (patch.description !== undefined) body.description = patch.description;
  if (patch.status !== undefined) body.task_status = patch.status === "done" ? undefined : patch.status;
  if (patch.priority !== undefined) body.priority = patch.priority === "urgent" ? "high" : patch.priority;
  if (patch.completion_note !== undefined) body.completion_note = patch.completion_note;
  if (patch.assignee_agent_id !== undefined) {
    body.assignee_agent_id = patch.assignee_agent_id;
    body.assignee_user_id = null;
  }
  if (patch.assignee_user_id !== undefined) {
    body.assignee_user_id = patch.assignee_user_id;
    body.assignee_agent_id = null;
  }

  const data = await apiFetch<{ ok: boolean; thread: Thread }>(`/api/v1/threads/${taskId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  return data?.thread ? mapThreadToTask(data.thread as Thread & Record<string, unknown>) : null;
}

export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/threads/${taskId}`, {
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
      role: (m as unknown as { agent_role?: string }).agent_role ?? "",
      joinedAt: (m as unknown as { joined_at: string }).joined_at ?? m.joinedAt,
      agent_role: (m as unknown as { agent_role?: "coordinator" | "worker" | "reviewer" }).agent_role,
      agent_level: (m as unknown as { agent_level?: number }).agent_level,
      level_confidence: (m as unknown as { level_confidence?: "low" | "medium" | "high" }).level_confidence,
      last_evaluated_at: (m as unknown as { last_evaluated_at?: string | null }).last_evaluated_at ?? null,
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
      },
    }));
  }
  return [];
}

export async function addTeamMember(projectId: string, agentId: string, role?: string): Promise<boolean> {
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
  return [];
}

// Single agent by id
export async function fetchAgent(id: string): Promise<Agent | null> {
  const data = await apiFetch<{ ok: boolean; agent: Agent }>(`/api/v1/agents/${id}`);
  return data?.ok ? data.agent : null;
}

// All agents across the platform — for project team pickers
export async function fetchAgentsDirectory(): Promise<Agent[]> {
  const data = await apiFetch<{ ok: boolean; agents: Agent[] }>("/api/v1/agents?all=true");
  if (data?.ok && data.agents?.length) {
    return data.agents.map((a) => ({
      id: a.id, name: a.name,
      desc: (a as unknown as { desc?: string; description?: string }).desc ?? (a as unknown as { description?: string }).description ?? "",
      status: a.status,
      lastProfileUpdateAt: (a as unknown as { updated_at?: string }).updated_at ?? "",
      agent_type: (a as unknown as { agent_type?: string }).agent_type,
      model:      (a as unknown as { model?: string }).model,
      platform:   (a as unknown as { platform?: string }).platform,
      callback_token: (a as unknown as { callback_token?: string }).callback_token,
    }));
  }
  return [];
}

export type ProjectMembershipRole = "admin" | "contributor" | "viewer";
export type ProjectAccessRole = "owner" | ProjectMembershipRole;
export type OrgMembershipRole = "admin" | "contributor" | "viewer";
export type OrgUserRole = "owner" | OrgMembershipRole;

export type Org = {
  id: string; name: string; slug: string; description?: string;
  status: string;
  agent_count?: number; project_count?: number; online_count?: number;
  created_at?: string; updated_at?: string;
  avatar_color?: string; avatar_url?: string;
  my_role?: OrgUserRole;
};

export async function fetchOrgs(): Promise<Org[]> {
  const data = await apiFetch<{ ok: boolean; orgs: Org[] }>("/api/v1/orgs");
  return data?.ok ? data.orgs : [];
}

export async function pingAgent(agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/agents/${agentId}/ping`, { method: "POST" });
  return data?.ok ?? false;
}

export type AgentInboxItem = {
  id: string;
  agent_id?: string;
  type: string;
  payload?: any;
  status: "pending" | "ack" | "failed" | string;
  created_at?: string;
  acked_at?: string;
  from_agent_id?: string;
  to_agent_name?: string;
  corr_id?: string;
  reply_to_corr_id?: string;
  thread_id?: string;
};

export async function fetchAgentInbox(
  agentId: string,
  callbackToken: string,
  status: "all" | "pending" | "ack" | "failed" = "all"
): Promise<AgentInboxItem[]> {
  const q = new URLSearchParams({ token: callbackToken, status });
  const data = await apiFetch<{ ok: boolean; items: AgentInboxItem[] }>(`/api/v1/agents/${agentId}/inbox?${q.toString()}`);
  return data?.ok ? (data.items ?? []) : [];
}

export async function fetchAgentInboxSent(
  agentId: string,
  callbackToken: string,
  status: "all" | "pending" | "ack" | "failed" = "all"
): Promise<AgentInboxItem[]> {
  const q = new URLSearchParams({ token: callbackToken, status });
  const data = await apiFetch<{ ok: boolean; items: AgentInboxItem[] }>(`/api/v1/agents/${agentId}/inbox/sent?${q.toString()}`);
  return data?.ok ? (data.items ?? []) : [];
}

export async function createOrg(payload: { name: string; slug: string; description?: string }): Promise<Org | null> {
  const data = await apiFetch<{ ok: boolean; org: Org }>("/api/v1/orgs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data?.ok ? data.org : null;
}

export async function createAgent(payload: {
  name: string; desc?: string; agent_type?: string;
  model?: string; provider?: string; capabilities?: string[]; endpoint_type?: string; platform?: string;
}): Promise<{ agent_id: string; callback_token: string } | null> {
  const data = await apiFetch<{ ok: boolean; agent_id: string; callback_token: string }>("/api/v1/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return data?.ok ? { agent_id: data.agent_id, callback_token: data.callback_token } : null;
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
  model: string; provider: string; capabilities: string[]; endpoint_type: string; platform: string;
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
  owner_user_id?: string;
};

export async function fetchOrg(idOrSlug: string): Promise<OrgDetail | null> {
  const data = await apiFetch<{ ok: boolean; org: OrgDetail }>(`/api/v1/orgs/${idOrSlug}`);
  return data?.ok ? data.org : null;
}

export async function updateOrg(idOrSlug: string, payload: Partial<{
  name: string; slug: string; description: string;
  status: string; avatar_color: string;
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

export type OrgAgentWithContrib = Agent & {
  // API-returned fields not in the base Agent mock type
  agent_type?: string;
  model?: string;
  provider?: string;
  capabilities?: string[];
  ping_status?: string;
  last_seen_at?: string;
  // Contribution fields
  contributed_by_user_id?: string | null;
  contributed_by_name?: string | null;
};

export async function fetchOrgAgents(idOrSlug: string): Promise<OrgAgentWithContrib[]> {
  const data = await apiFetch<{ ok: boolean; agents: OrgAgentWithContrib[] }>(`/api/v1/orgs/${idOrSlug}/agents`);
  return data?.ok ? data.agents : [];
}

export async function contributeAgentToOrg(orgId: string, agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${orgId}/agent-contributions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  return data?.ok ?? false;
}

export async function withdrawAgentFromOrg(orgId: string, agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/orgs/${orgId}/agent-contributions/${agentId}`, {
    method: "DELETE",
  });
  return data?.ok ?? false;
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
  agent_id: string;
  name: string;
  status: string;
  agent_type?: string;
  model?: string;
  avatar_url?: string;
  contributed_by?: string | null;
  contributed_by_name?: string | null;
  contributed_by_avatar?: string | null;
  created_at: string;
};

export async function fetchOrgMembers(idOrSlug: string): Promise<OrgMember[]> {
  const data = await apiFetch<{ ok: boolean; members: OrgMember[] }>(`/api/v1/orgs/${idOrSlug}/members`);
  return data?.ok ? data.members : [];
}

export async function addOrgMember(idOrSlug: string, agentId: string): Promise<OrgMember | null> {
  const data = await apiFetch<{ ok: boolean; member: OrgMember }>(`/api/v1/orgs/${idOrSlug}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agent_id: agentId }),
  });
  return data?.ok ? data.member : null;
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
  role: ProjectMembershipRole;
  joined_at: string;
  avatar_url?: string;
  invited_by_name?: string;
};

export async function fetchUserMembers(projectId: string): Promise<UserMember[]> {
  const data = await apiFetch<{ ok: boolean; members: UserMember[] }>(`/api/v1/projects/${projectId}/user-members`);
  return data?.ok ? data.members : [];
}

export async function addUserMember(
  projectId: string, email: string, role: ProjectMembershipRole
): Promise<ProjectInvite | null> {
  const data = await apiFetch<{ ok: boolean; invite: ProjectInvite }>(`/api/v1/projects/${projectId}/user-members`, {
    method: "POST",
    body: JSON.stringify({ email, role }),
  });
  return data?.ok ? data.invite : null;
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
  role: ProjectMembershipRole;
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
  role: OrgMembershipRole;
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
  projectId: string, email?: string, role?: ProjectMembershipRole
): Promise<ProjectInvite | null> {
  const data = await apiFetch<{ ok: boolean; invite: ProjectInvite }>(`/api/v1/projects/${projectId}/invites`, {
    method: "POST",
    body: JSON.stringify({ email: email || undefined, role: role || "contributor" }),
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

export type OrgUserMemberAgent = {
  id: string; name: string; status: string; model?: string | null; ping_status?: string | null;
};

export type OrgUserMember = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  avatar_url?: string | null;
  role: OrgMembershipRole;
  created_at: string;
  agents?: OrgUserMemberAgent[] | null;
};

export async function fetchOrgUserMembers(idOrSlug: string): Promise<OrgUserMember[]> {
  const data = await apiFetch<{ ok: boolean; users: OrgUserMember[] }>(`/api/v1/orgs/${idOrSlug}/users`);
  return data?.ok ? data.users : [];
}

export async function addOrgUserMember(idOrSlug: string, email: string, role = "contributor"): Promise<OrgUserMember | null> {
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
  role: OrgMembershipRole;
  expires_at: string;
  created_at: string;
  invited_by_name?: string;
};

/** Invite a user to an org by email — creates invite record, shows in their bell.
 *  Returns `registered: false` if the email has no Darshan account yet (invite still created). */
export async function inviteOrgUser(
  idOrSlug: string, email: string, role = "contributor"
): Promise<{ invite: PendingOrgInvite; registered: boolean } | null> {
  const data = await apiFetch<{ ok: boolean; invite: PendingOrgInvite; registered: boolean }>(
    `/api/v1/orgs/${idOrSlug}/user-invites`,
    { method: "POST", body: JSON.stringify({ email, role }) }
  );
  return data?.ok ? { invite: data.invite, registered: data.registered } : null;
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
  const data = await apiFetch<{ ok: boolean; messages: ThreadMessage[] }>(
    `/api/v1/threads/${taskId}/messages?types=event`
  );
  if (!data?.ok) return [];
  return (data.messages ?? []).map((message) => ({
    id: message.message_id,
    actor_name: message.sender_slug,
    actor_type: "system",
    action: "status_changed",
    from_value: null,
    to_value: message.body,
    created_at: message.sent_at,
  }));
}

// ── Project group chat (MVP) ─────────────────────────────────────────────────

export type ProjectChatMessageItem = ProjectChatMessage;

export async function fetchProjectChatMessages(projectId: string, limit = 100): Promise<ProjectChatMessageItem[]> {
  const data = await apiFetch<{ ok: boolean; messages: ProjectChatMessageItem[] }>(
    `/api/v1/projects/${projectId}/chat/messages?limit=${limit}`
  );
  return data?.ok ? data.messages : [];
}

export async function sendProjectChatMessage(projectId: string, content: string): Promise<ProjectChatMessageItem | null> {
  const data = await apiFetch<{ ok: boolean; message: ProjectChatMessageItem }>(
    `/api/v1/projects/${projectId}/chat/messages`,
    { method: "POST", body: JSON.stringify({ content }) }
  );
  return data?.ok ? data.message : null;
}

// ── Agent chat (MVP) ─────────────────────────────────────────────────────────

export type OnlineAgent = {
  id: string;
  name: string;
  description?: string | null;
  model?: string | null;
  provider?: string | null;
  agent_type?: string | null;
  status: "online" | "offline";
  last_ping_at?: string | null;
  last_seen_at?: string | null;
};

export type ChatMessage = {
  id: string;
  thread_id: string;
  author_type: "human" | "agent" | string;
  author_user_id?: string | null;
  author_agent_id?: string | null;
  content: string;
  seq?: string | number;
  created_at: string;
};

export async function fetchOnlineAgents(): Promise<OnlineAgent[]> {
  const data = await apiFetch<{ ok: boolean; agents: OnlineAgent[] }>("/api/v1/agents/online");
  return data?.ok ? data.agents : [];
}

export async function openAgentChat(agentId: string): Promise<string | null> {
  const data = await apiFetch<{ ok: boolean; thread_id: string }>(`/api/v1/agents/${agentId}/chat`);
  return data?.ok ? data.thread_id : null;
}

export async function fetchAgentChatMessages(agentId: string, limit = 100): Promise<{ threadId: string | null; messages: ChatMessage[] }> {
  const data = await apiFetch<{ ok: boolean; thread_id: string; messages: ChatMessage[] }>(`/api/v1/agents/${agentId}/chat/messages?limit=${limit}`);
  if (!data?.ok) return { threadId: null, messages: [] };
  return { threadId: data.thread_id, messages: data.messages ?? [] };
}

export async function sendAgentChatMessage(agentId: string, content: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(`/api/v1/agents/${agentId}/chat/messages`, {
    method: "POST",
    body: JSON.stringify({ content }),
  });
  return data?.ok ?? false;
}

// ── Agent Levels ──────────────────────────────────────────────────────────────

export type LevelDefinition = {
  project_id?: string | null;
  level?: number;
  level_id: number;
  name?: string;
  label: string;
  description: string;
  gate?: string | null;
};

export type AgentProjectLevel = {
  id: string;
  agent_id: string;
  project_id: string;
  current_level: number;
  agent_name: string;
  agent_slug: string;
  level_name?: string | null;
  level_label: string;
  level_description?: string | null;
  can_receive_tasks?: boolean | null;
  max_parallel_tasks?: number | null;
  requires_approval?: boolean | null;
  updated_at: string;
};

export type LevelEvent = {
  id: string;
  project_id: string;
  agent_id: string;
  from_level: number;
  to_level: number;
  from_label: string;
  to_label: string;
  from_name?: string | null;
  to_name?: string | null;
  changed_by: string;
  changed_by_type: string;
  reason: string | null;
  created_at: string;
};

export type LevelProof = {
  id: string;
  event_id: string;
  proof_type: string;
  ref_id: string;
  notes?: string | null;
  created_at?: string;
};

export async function fetchLevelDefinitions(projectId: string): Promise<LevelDefinition[]> {
  const qs = new URLSearchParams({ project_id: projectId });
  const data = await apiFetch<{ ok: boolean; definitions: LevelDefinition[] }>(
    `/api/v1/agent-levels/definitions?${qs.toString()}`
  );
  return data?.ok ? data.definitions : [];
}

export async function fetchProjectAgentLevels(projectId: string): Promise<AgentProjectLevel[]> {
  const data = await apiFetch<{ ok: boolean; levels: AgentProjectLevel[] }>(
    `/api/v1/projects/${projectId}/agent-levels`
  );
  return data?.ok ? data.levels : [];
}

export async function fetchAgentLevelDetail(
  projectId: string,
  agentId: string
): Promise<{ current: AgentProjectLevel | null; events: LevelEvent[]; proofs: LevelProof[] }> {
  const data = await apiFetch<{
    ok: boolean;
    current: AgentProjectLevel | null;
    events: LevelEvent[];
    proofs: LevelProof[];
  }>(`/api/v1/projects/${projectId}/agent-levels/${agentId}`);
  return data?.ok
    ? { current: data.current, events: data.events, proofs: data.proofs }
    : { current: null, events: [], proofs: [] };
}

export async function setAgentLevel(
  projectId: string,
  agentId: string,
  level: number,
  reason: string,
  proofs: Array<{ proof_type: "task" | "conversation" | "a2a_thread"; ref_id: string; notes?: string }>
): Promise<{ ok: boolean; event_id?: string }> {
  const data = await apiFetch<{ ok: boolean; event_id: string }>(
    `/api/v1/projects/${projectId}/agent-levels/${agentId}`,
    {
      method: "POST",
      body: JSON.stringify({ level, reason, proofs }),
    }
  );
  return data ?? { ok: false };
}

export async function deleteAgentLevel(projectId: string, agentId: string): Promise<boolean> {
  const data = await apiFetch<{ ok: boolean }>(
    `/api/v1/projects/${projectId}/agent-levels/${agentId}`,
    { method: "DELETE" }
  );
  return data?.ok ?? false;
}

// ── LLM Usage ─────────────────────────────────────────────────────────────────

export type UsageEvent = {
  id: string;
  session_key: string;
  thread_id: string | null;
  agent_id: string | null;
  model: string;
  tokens_delta: number;
  tokens_total: number;
  context_tokens: number | null;
  recorded_at: string;
};

export type UsageSummary = {
  events: UsageEvent[];
  total_tokens: number;
  total_events: number;
  by_model: Record<string, number>;
};

export async function fetchUsage(params?: {
  thread_id?: string;
  agent_id?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<UsageSummary> {
  const qs = new URLSearchParams();
  if (params?.thread_id) qs.set("thread_id", params.thread_id);
  if (params?.agent_id)  qs.set("agent_id",  params.agent_id);
  if (params?.from)      qs.set("from",       params.from);
  if (params?.to)        qs.set("to",         params.to);
  if (params?.limit)     qs.set("limit",      String(params.limit));
  const q = qs.toString();
  const data = await apiFetch<{ ok: boolean } & UsageSummary>(`/api/v1/usage${q ? "?" + q : ""}`);
  return data?.ok
    ? { events: data.events, total_tokens: data.total_tokens, total_events: data.total_events, by_model: data.by_model }
    : { events: [], total_tokens: 0, total_events: 0, by_model: {} };
}
