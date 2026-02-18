"use client";

import * as React from "react";
import { fetchProjects, type ApiProject } from "@/lib/api";

type ProjectContextValue = {
  projects: ApiProject[];
  selected: ApiProject | null;
  setSelected: (p: ApiProject) => void;
  loading: boolean;
  reload: () => void;
};

const ProjectContext = React.createContext<ProjectContextValue>({
  projects: [],
  selected: null,
  setSelected: () => {},
  loading: true,
  reload: () => {},
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = React.useState<ApiProject[]>([]);
  const [selected, setSelected] = React.useState<ApiProject | null>(null);
  const [loading, setLoading] = React.useState(true);

  function load() {
    setLoading(true);
    fetchProjects("active")
      .then((res) => {
        setProjects(res.projects);
        // Default to first project ("Darshan" — seeded as project #1)
        setSelected((prev) => prev ?? res.projects[0] ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  React.useEffect(load, []);

  return (
    <ProjectContext.Provider
      value={{ projects, selected, setSelected, loading, reload: load }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  return React.useContext(ProjectContext);
}
