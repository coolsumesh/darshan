// API client — calls the Darshan backend at /api/v1
// Falls back to mock data if the API is unreachable (dev/offline mode).

import { PROJECTS, TASKS, TEAM_MEMBERS, type Project, type Task, type TeamMember } from "./projects";
import { AGENTS, type Agent } from "./agents";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api/backend";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    if (!res.ok) return null;
    return res.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── Projects ──────────────────────────────────────────────────────────────────

export async function fetchProjects(): Promise<Project[]> {
  const data = await apiFetch<{ ok: boolean; projects: Project[] }>("/api/v1/projects");
  if (data?.ok && data.projects?.length) return data.projects;
  // fallback
  return PROJECTS;
}

export async function fetchProject(id: string): Promise<Project | undefined> {
  const data = await apiFetch<{ ok: boolean; project: Project }>(`/api/v1/projects/${id}`);
  if (data?.ok && data.project) return data.project;
  return PROJECTS.find((p) => p.id === id);
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

// ── Team ──────────────────────────────────────────────────────────────────────

export type TeamMemberWithAgent = TeamMember & { agent?: Agent };

export async function fetchTeam(projectId: string): Promise<TeamMemberWithAgent[]> {
  const data = await apiFetch<{ ok: boolean; team: (TeamMember & Agent)[] }>(`/api/v1/projects/${projectId}/team`);
  if (data?.ok && data.team) {
    return data.team.map((m) => ({
      agentId: m.agentId ?? (m as unknown as { agent_id: string }).agent_id,
      role: m.role,
      joinedAt: m.joinedAt ?? (m as unknown as { joined_at: string }).joined_at,
      agent: { id: m.id, name: m.name, desc: (m as unknown as { desc?: string }).desc ?? "", status: m.status, lastProfileUpdateAt: "" },
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
  if (data?.ok && data.agents?.length) {
    return data.agents.map((a) => ({
      id: a.id,
      name: a.name,
      desc: (a as unknown as { desc?: string }).desc ?? "",
      status: a.status,
      lastProfileUpdateAt: (a as unknown as { updated_at?: string }).updated_at ?? "",
    }));
  }
  return AGENTS;
}
