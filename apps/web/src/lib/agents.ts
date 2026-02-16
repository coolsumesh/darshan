export type AgentStatus = "online" | "away" | "offline";

export type Agent = {
  id: string;
  name: string;
  desc: string;
  status: AgentStatus;
  /** ISO timestamp string */
  lastProfileUpdateAt: string;
};

// Prototype-friendly mock data (no backend).
export const AGENTS: Agent[] = [
  {
    id: "mira",
    name: "Mira",
    desc: "Ops triage",
    status: "online",
    lastProfileUpdateAt: "2026-02-16T07:10:00Z",
  },
  {
    id: "nia",
    name: "Nia",
    desc: "Support",
    status: "away",
    lastProfileUpdateAt: "2026-02-15T22:30:00Z",
  },
  {
    id: "kaito",
    name: "Kaito",
    desc: "Incident response",
    status: "offline",
    lastProfileUpdateAt: "2026-02-12T09:00:00Z",
  },
  {
    id: "anya",
    name: "Anya",
    desc: "QA",
    status: "online",
    lastProfileUpdateAt: "2026-02-16T05:45:00Z",
  },
];
