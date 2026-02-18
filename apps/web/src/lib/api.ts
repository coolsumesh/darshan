/**
 * Darshan API client — thin wrapper around fetch.
 * Base URL is read from NEXT_PUBLIC_API_URL (defaults to same origin).
 */

export const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data?.error ?? `API error ${res.status}`);
  }
  return data as T;
}

// ── Agents ──────────────────────────────────────────────────────────────────

export type ApiAgent = {
  id: string;
  name: string;
  desc: string;
  status: "online" | "away" | "offline";
  last_profile_update_at: string;
};

export function fetchAgents(): Promise<{ ok: true; agents: ApiAgent[] }> {
  return apiFetch("/api/v1/agents");
}

// ── Threads ──────────────────────────────────────────────────────────────────

export type ApiThread = {
  id: string;
  title: string | null;
  visibility: string;
  created_by_user_id: string;
  updated_at: string;
  created_at: string;
  archived_at: string | null;
};

export function fetchThreads(): Promise<{ ok: true; threads: ApiThread[] }> {
  return apiFetch("/api/v1/threads");
}

export type ApiMessage = {
  id: string;
  thread_id: string;
  author_type: "human" | "agent" | "system";
  author_user_id: string | null;
  author_agent_id: string | null;
  content: string;
  created_at: string;
};

export function fetchMessages(
  threadId: string,
): Promise<{ ok: true; messages: ApiMessage[]; nextBeforeSeq: string | null }> {
  return apiFetch(`/api/v1/threads/${threadId}/messages`);
}

export function postMessage(
  threadId: string,
  content: string,
  agentIds: string[] = [],
): Promise<{ ok: true; message: ApiMessage }> {
  return apiFetch(`/api/v1/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ content, targets: { agentIds }, mode: "direct" }),
  });
}

export function createThread(
  title?: string,
  projectId?: string,
): Promise<{ ok: true; thread: ApiThread }> {
  return apiFetch("/api/v1/threads", {
    method: "POST",
    body: JSON.stringify({ title, visibility: "private", projectId }),
  });
}

// ── Projects ─────────────────────────────────────────────────────────────────

export type ApiProject = {
  id: string;
  seq: number;
  name: string;
  description: string;
  status: "active" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
  member_count: number;
};

export function fetchProjects(status?: string): Promise<{ ok: true; projects: ApiProject[] }> {
  const q = status ? `?status=${status}` : "";
  return apiFetch(`/api/v1/projects${q}`);
}

export function createProject(
  name: string,
  description?: string,
): Promise<{ ok: true; project: ApiProject }> {
  return apiFetch("/api/v1/projects", {
    method: "POST",
    body: JSON.stringify({ name, description: description ?? "" }),
  });
}

export function fetchProjectThreads(
  projectId: string,
): Promise<{ ok: true; threads: ApiThread[] }> {
  return apiFetch(`/api/v1/projects/${projectId}/threads`);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export type ApiTask = {
  id: string;
  seq: number;
  title: string;
  description: string;
  status: "proposed" | "approved" | "in_progress" | "done" | "rejected";
  proposed_by_type: "human" | "agent";
  proposed_by_user_id: string | null;
  proposed_by_agent_id: string | null;
  proposed_by_agent_name: string | null;
  claimed_by_agent_id: string | null;
  claimed_by_agent_name: string | null;
  approved_at: string | null;
  completed_at: string | null;
  project_id: string | null;
  created_at: string;
  updated_at: string;
};

export function fetchProjectTasks(
  projectId: string,
  status?: string,
): Promise<{ ok: true; tasks: ApiTask[] }> {
  const q = status ? `?status=${status}` : "";
  return apiFetch(`/api/v1/projects/${projectId}/tasks${q}`);
}

export function createTask(
  title: string,
  description?: string,
): Promise<{ ok: true; task: ApiTask }> {
  return apiFetch("/api/v1/tasks", {
    method: "POST",
    body: JSON.stringify({ title, description: description ?? "" }),
  });
}
