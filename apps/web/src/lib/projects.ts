type Project = {
  id: string;
  name: string;
  description: string;
  status: 'active'|'review'|'planned';
  lastActivity: string; // ISO date
  teamSize: number;
  progress: number; // 0-100
};

type Task = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'proposed'|'approved'|'in-progress'|'done';
  proposer?: string;
  assignee?: string;
};

type TeamMember = {
  agentId: string;
  role: string;
  joinedAt: string;
};

export const PROJECTS: Project[] = [
  {
    id: 'darshan',
    name: 'Darshan',
    description: 'Unified data platform for Darshan project dashboards and Kanban boards',
    status: 'active',
    lastActivity: '2026-02-17T14:32:00Z',
    teamSize: 6,
    progress: 42,
  },
  {
    id: 'alpha',
    name: 'Alpha Analytics',
    description: 'Analytics pipeline for product telemetry',
    status: 'active',
    lastActivity: '2026-02-16T10:20:00Z',
    teamSize: 4,
    progress: 68,
  },
  {
    id: 'beta',
    name: 'Beta Platform',
    description: 'Platform MVP with auth and real-time data',
    status: 'planned',
    lastActivity: '2026-02-10T09:15:00Z',
    teamSize: 3,
    progress: 12,
  }
];

export const TASKS: Task[] = [
  { id: 't1', projectId: 'darshan', title: 'Define MVP scope', status: 'done', proposer: 'Ava', assignee: 'Kai' },
  { id: 't2', projectId: 'darshan', title: 'Design dashboard cards', status: 'in-progress', proposer: 'Juno', assignee: 'Lia' },
  { id: 't3', projectId: 'darshan', title: 'Setup Kanban columns', status: 'proposed', proposer: 'Rye' },
  { id: 't4', projectId: 'alpha', title: 'Ingest telemetry', status: 'done', proposer: 'Mia' },
  { id: 't5', projectId: 'alpha', title: 'Create data schema', status: 'in-progress', proposer: 'Sam' },
  { id: 't6', projectId: 'beta', title: 'OAuth flow', status: 'proposed', proposer: 'Noa' }
];

export const TEAM_MEMBERS: Record<string, TeamMember[]> = {
  darshan: [
    { agentId: 'u1', role: 'Product', joinedAt: '2024-11-01' },
    { agentId: 'u2', role: 'Engineer', joinedAt: '2025-01-20' },
    { agentId: 'u3', role: 'Designer', joinedAt: '2025-03-12' },
  ],
  alpha: [
    { agentId: 'u4', role: 'Engineer', joinedAt: '2025-04-05' },
  ],
  beta: [
    { agentId: 'u5', role: 'Engineer', joinedAt: '2025-06-23' },
  ],
};

export const getProjects = (): Project[] => PROJECTS;
export const getTasksForProject = (projectId: string): Task[] => TASKS.filter(t => t.projectId === projectId);
export const getTeamForProject = (projectId: string): TeamMember[] => TEAM_MEMBERS[projectId] ?? [];
