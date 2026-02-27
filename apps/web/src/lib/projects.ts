export type ProjectStatus = "active" | "review" | "planned";
export type TaskStatus = "proposed" | "approved" | "in-progress" | "review" | "done";

export type Project = {
  id: string;
  slug?: string;
  name: string;
  description: string;
  status: ProjectStatus;
  lastActivity: string; // ISO date
  teamSize: number;
  progress: number; // 0-100
  my_role?: "owner" | "member" | null; // set by API for scoped users
};

export type Priority = "urgent" | "high" | "medium" | "low";

export type Task = {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  proposer?: string;        // requestor name (set from auth user on create)
  requestor_org?: string;   // org of the requestor
  assignee?: string;
  type?: string;
  estimated_sp?: number;    // kept for backwards compat, hidden from UI
  priority?: Priority;
  due_date?: string;        // ISO date "YYYY-MM-DD"
  completion_note?: string;
  completed_at?: string;
  in_progress_at?: string;  // set when status first moves to in-progress
  review_at?: string;       // set when status moves to review
};

export type TeamMember = {
  agentId: string;
  role: string;
  joinedAt: string;
};

export const PROJECTS: Project[] = [
  {
    id: "darshan",
    name: "Darshan",
    description: "Multi-agent project management platform — dashboards, sprint boards, and team coordination.",
    status: "active",
    lastActivity: "2026-02-17T14:32:00Z",
    teamSize: 3,
    progress: 42,
  },
  {
    id: "alpha",
    name: "Alpha Analytics",
    description: "Analytics pipeline for product telemetry and real-time reporting.",
    status: "active",
    lastActivity: "2026-02-16T10:20:00Z",
    teamSize: 2,
    progress: 68,
  },
  {
    id: "beta",
    name: "Beta Platform",
    description: "Platform MVP with auth, real-time data, and agent coordination.",
    status: "planned",
    lastActivity: "2026-02-10T09:15:00Z",
    teamSize: 1,
    progress: 12,
  },
];

export const TASKS: Task[] = [
  { id: "t1", projectId: "darshan", title: "Define MVP scope", description: "Finalise feature list and acceptance criteria for the MVP release.", status: "done", proposer: "Mira", assignee: "Kaito" },
  { id: "t2", projectId: "darshan", title: "Design dashboard cards", description: "Create project card component with status, progress, and team indicators.", status: "in-progress", proposer: "Anya", assignee: "Mira" },
  { id: "t3", projectId: "darshan", title: "Build Sprint Board Kanban", description: "Implement drag-and-drop Kanban columns with task cards.", status: "approved", proposer: "Kaito", assignee: "Nia" },
  { id: "t4", projectId: "darshan", title: "Team tab with Add Agent flow", description: "Inline Agent Registry panel accessible from the Team tab.", status: "proposed", proposer: "Mira" },
  { id: "t5", projectId: "alpha", title: "Ingest telemetry pipeline", description: "Set up data ingestion for product events.", status: "done", proposer: "Mira", assignee: "Anya" },
  { id: "t6", projectId: "alpha", title: "Create data schema", description: "Define normalised schema for telemetry events.", status: "in-progress", proposer: "Kaito", assignee: "Mira" },
  { id: "t7", projectId: "beta", title: "OAuth2 auth flow", description: "Implement OAuth2 login and session management.", status: "proposed", proposer: "Nia" },
];

export const TEAM_MEMBERS: Record<string, TeamMember[]> = {
  darshan: [
    { agentId: "mira", role: "Lead Engineer", joinedAt: "2026-01-10" },
    { agentId: "kaito", role: "Incident Response", joinedAt: "2026-01-20" },
    { agentId: "anya", role: "QA Engineer", joinedAt: "2026-02-01" },
  ],
  alpha: [
    { agentId: "mira", role: "Data Engineer", joinedAt: "2026-01-15" },
    { agentId: "nia", role: "Support", joinedAt: "2026-01-28" },
  ],
  beta: [
    { agentId: "kaito", role: "Platform Engineer", joinedAt: "2026-02-05" },
  ],
};

export const getProjects = (): Project[] => PROJECTS;
export const getProject = (id: string): Project | undefined => PROJECTS.find((p) => p.id === id);
export const getTasksForProject = (projectId: string): Task[] => TASKS.filter((t) => t.projectId === projectId);
export const getTeamForProject = (projectId: string): TeamMember[] => TEAM_MEMBERS[projectId] ?? [];
