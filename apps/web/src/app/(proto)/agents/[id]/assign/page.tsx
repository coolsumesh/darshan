"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, FolderKanban, Check, X } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  fetchAgent, fetchOrgs, fetchOrgAgents,
  contributeAgentToOrg, withdrawAgentFromOrg,
  fetchProjects, fetchAgentProjects,
  addTeamMember, removeTeamMember,
  type Org, type AgentProject,
} from "@/lib/api";
import type { Agent } from "@/lib/agents";
import type { Project } from "@/lib/projects";

// ─── Status dot ───────────────────────────────────────────────────────────────
function statusDot(status?: string) {
  if (status === "online")  return "bg-emerald-500";
  if (status === "offline") return "bg-zinc-400";
  return "bg-amber-400";
}

// ─── Assign Agent Page ────────────────────────────────────────────────────────
export default function AssignAgentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [agent,            setAgent]            = React.useState<Agent | null>(null);
  const [orgs,             setOrgs]             = React.useState<Org[]>([]);
  const [contributedOrgIds, setContributedOrgIds] = React.useState<Set<string>>(new Set());
  const [projects,         setProjects]         = React.useState<Project[]>([]);
  const [assignedProjectIds, setAssignedProjectIds] = React.useState<Set<string>>(new Set());
  const [loading,          setLoading]          = React.useState(true);
  const [togglingOrg,      setTogglingOrg]      = React.useState<string | null>(null);
  const [togglingProject,  setTogglingProject]  = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const [agentData, allOrgs, allProjects, agentProjectList] = await Promise.all([
          fetchAgent(id),
          fetchOrgs(),
          fetchProjects(),
          fetchAgentProjects(id),
        ]);
        if (cancelled) return;

        setAgent(agentData);
        setOrgs(allOrgs);
        setProjects(allProjects);
        setAssignedProjectIds(new Set(agentProjectList.map((p: AgentProject) => p.id)));

        // Check contribution status per org
        const contributed = new Set<string>();
        await Promise.all(allOrgs.map(async org => {
          const agents = await fetchOrgAgents(org.id);
          if (!cancelled && agents.some(a => a.id === id)) contributed.add(org.id);
        }));
        if (!cancelled) setContributedOrgIds(contributed);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [id]);

  async function toggleOrg(orgId: string) {
    setTogglingOrg(orgId);
    try {
      if (contributedOrgIds.has(orgId)) {
        await withdrawAgentFromOrg(orgId, id);
        setContributedOrgIds(prev => { const s = new Set(prev); s.delete(orgId); return s; });
      } else {
        await contributeAgentToOrg(orgId, id);
        setContributedOrgIds(prev => new Set([...prev, orgId]));
      }
    } finally {
      setTogglingOrg(null);
    }
  }

  async function toggleProject(projectId: string) {
    setTogglingProject(projectId);
    try {
      if (assignedProjectIds.has(projectId)) {
        await removeTeamMember(projectId, id);
        setAssignedProjectIds(prev => { const s = new Set(prev); s.delete(projectId); return s; });
      } else {
        await addTeamMember(projectId, id);
        setAssignedProjectIds(prev => new Set([...prev, projectId]));
      }
    } finally {
      setTogglingProject(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-sm text-zinc-400">Loading…</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <p className="text-sm text-zinc-400">Agent not found.</p>
        <button onClick={() => router.back()} className="text-xs text-brand-600 hover:underline">← Back</button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-10 max-w-2xl">

      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10 transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-zinc-800 text-sm font-bold text-white">
            {agent.name[0]?.toUpperCase()}
            <span className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-[#16132A]", statusDot(agent.status))} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-bold text-zinc-900 dark:text-white truncate">{agent.name}</h1>
            <p className="text-xs text-zinc-400">Assign to Organisations &amp; Projects</p>
          </div>
        </div>
      </div>

      {/* Organisations */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Organisations
            <span className="ml-1.5 text-xs font-normal text-zinc-400">({contributedOrgIds.size} contributed)</span>
          </h2>
        </div>
        {orgs.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-400 dark:bg-white/5">
            You are not a member of any organisation.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {orgs.map(org => {
              const contributed = contributedOrgIds.has(org.id);
              const toggling    = togglingOrg === org.id;
              return (
                <div key={org.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-[#2D2A45] dark:bg-[#16132A]">
                  <div
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                    style={{ backgroundColor: org.avatar_color ?? "#7C3AED" }}>
                    {org.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{org.name}</p>
                    <p className="text-[11px] text-zinc-400 capitalize">{org.my_role ?? "member"}</p>
                  </div>
                  <button
                    onClick={() => toggleOrg(org.id)}
                    disabled={toggling}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:opacity-60",
                      contributed
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10"
                    )}>
                    {toggling ? (
                      <span>…</span>
                    ) : contributed ? (
                      <><Check className="h-3 w-3" /> Contributed</>
                    ) : (
                      "Contribute"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Projects */}
      <section>
        <div className="mb-3 flex items-center gap-2">
          <FolderKanban className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">
            Projects
            <span className="ml-1.5 text-xs font-normal text-zinc-400">({assignedProjectIds.size} assigned)</span>
          </h2>
        </div>
        {projects.length === 0 ? (
          <p className="rounded-xl bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-400 dark:bg-white/5">
            No projects found.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {projects.map(project => {
              const assigned  = assignedProjectIds.has(project.id);
              const toggling  = togglingProject === project.id;
              const statusColor =
                project.status === "active"  ? "bg-emerald-500" :
                project.status === "planned" ? "bg-amber-400" : "bg-zinc-400";
              return (
                <div key={project.id}
                  className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 dark:border-[#2D2A45] dark:bg-[#16132A]">
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-700 text-xs font-bold text-white">
                    {project.name[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white truncate">{project.name}</p>
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", statusColor)} />
                    </div>
                    <p className="text-[11px] text-zinc-400 capitalize">{project.status}</p>
                  </div>
                  <button
                    onClick={() => toggleProject(project.id)}
                    disabled={toggling}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-colors disabled:opacity-60",
                      assigned
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-red-50 hover:text-red-600 hover:ring-red-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30"
                        : "bg-zinc-100 text-zinc-600 ring-zinc-200 hover:bg-brand-50 hover:text-brand-700 hover:ring-brand-200 dark:bg-white/10 dark:text-zinc-400 dark:ring-white/10"
                    )}>
                    {toggling ? (
                      <span>…</span>
                    ) : assigned ? (
                      <><Check className="h-3 w-3" /> Assigned</>
                    ) : (
                      "Assign"
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>

    </div>
  );
}
