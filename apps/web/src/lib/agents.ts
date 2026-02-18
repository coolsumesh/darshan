export type AgentStatus = "online" | "away" | "offline";

export type Agent = {
  id: string;
  name: string;
  desc: string;
  status: AgentStatus;
  /** ISO timestamp string */
  lastProfileUpdateAt: string;
};

// MithranLabs team — real agent data.
export const AGENTS: Agent[] = [
  {
    id: "mithran",
    name: "Mithran ⚡",
    desc: "Coordinator",
    status: "online",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "komal",
    name: "Komal 🌸",
    desc: "Developer",
    status: "online",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "anantha",
    name: "Anantha 🐍",
    desc: "Systems Architect",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "vishwakarma",
    name: "Vishwakarma 🏗️",
    desc: "DevOps/Infrastructure",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "ganesha",
    name: "Ganesha 📝",
    desc: "Technical Writer",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "drishti",
    name: "Drishti 👁️",
    desc: "Product/Requirements Analyst",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "lekha",
    name: "Lekha 🗄️",
    desc: "Database Specialist",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "sanjaya",
    name: "Sanjaya 🎨",
    desc: "Image Generation",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
  {
    id: "suraksha",
    name: "Suraksha 🛡️",
    desc: "Security Expert",
    status: "offline",
    lastProfileUpdateAt: "2026-02-18T07:00:00Z",
  },
];
