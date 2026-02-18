/**
 * Darshan API client — thin wrapper around fetch.
 * Base URL is read from NEXT_PUBLIC_API_URL (defaults to same origin).
 */

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

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
  author_type: string;
  author_user_id: string | null;
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
): Promise<{ ok: true; thread: ApiThread }> {
  return apiFetch("/api/v1/threads", {
    method: "POST",
    body: JSON.stringify({ title, visibility: "private" }),
  });
}
