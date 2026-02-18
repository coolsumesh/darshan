"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  LayoutDashboard,
  Menu,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/cn";
import ThemeToggle from "@/components/proto/theme-toggle";
import FontSizeToggle from "@/components/proto/font-size-toggle";
import { applyPrefsToDom, loadPrefs, useUIPreferences } from "@/components/proto/ui-preferences";
import { useProject } from "@/lib/project-context";

function ProjectSwitcher({ collapsed }: { collapsed: boolean }) {
  const { projects, selected, setSelected, loading } = useProject();

  if (loading) {
    return (
      <div className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
    );
  }

  if (projects.length === 0) return null;

  if (collapsed) {
    return (
      <div
        className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:ring-brand-500/20"
        title={selected?.name ?? "Project"}
        aria-label="Selected project"
      >
        <span className="text-xs font-bold text-brand-700 dark:text-brand-300">
          {selected?.name?.slice(0, 1) ?? "P"}
        </span>
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="sr-only" htmlFor="project-switcher">
        Active project
      </label>
      <select
        id="project-switcher"
        className={cn(
          "w-full appearance-none rounded-xl border border-line bg-brand-50 px-3 py-2.5",
          "text-sm font-semibold text-brand-700 focus:outline-none",
          "focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
          "dark:border-brand-500/20 dark:bg-brand-500/10 dark:text-brand-300"
        )}
        value={selected?.id ?? ""}
        onChange={(e) => {
          const p = projects.find((x) => x.id === e.target.value);
          if (p) setSelected(p);
        }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center">
        <ChevronRight className="h-3 w-3 rotate-90 text-brand-500" aria-hidden />
      </div>
    </div>
  );
}

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/agents", label: "Agent Registry", icon: Users },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function Sidebar({
  pathname,
  collapsed,
  setCollapsed,
  showCollapse,
}: {
  pathname: string;
  collapsed: boolean;
  setCollapsed?: (v: boolean) => void;
  showCollapse: boolean;
}) {
  return (
    <aside
      className={cn(
        "flex h-full flex-col rounded-2xl bg-white shadow-soft ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800 transition-all",
        collapsed ? "w-[68px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between gap-2 border-b border-line p-3 dark:border-slate-800">
        <div className={cn("flex items-center gap-2", collapsed && "justify-center w-full")}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-softSm">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">Darshan</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">MithranLabs</div>
            </div>
          )}
        </div>
        {showCollapse && setCollapsed && !collapsed && (
          <button
            type="button"
            onClick={() => {
              setCollapsed(true);
              try {
                const stored = loadPrefs();
                localStorage.setItem("darshan-ui-prefs", JSON.stringify({ ...stored, sidebarCollapsed: true }));
              } catch {}
            }}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900/40 dark:hover:text-slate-200"
            aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Project switcher */}
      <div className={cn("px-2 pt-2", collapsed && "flex justify-center")}>
        <ProjectSwitcher collapsed={collapsed} />
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-auto p-2 space-y-0.5" aria-label="Primary">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                "hover:bg-slate-50 dark:hover:bg-slate-900/40",
                collapsed && "justify-center px-0",
                active
                  ? "bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-500/20"
                  : "text-slate-600 dark:text-slate-300"
              )}
              title={collapsed ? item.label : undefined}
            >
              <Icon className={cn("h-4 w-4 shrink-0", active ? "text-brand-600 dark:text-brand-300" : "text-slate-400")} />
              {!collapsed && <span className="font-medium truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Expand button when collapsed */}
      {showCollapse && setCollapsed && collapsed && (
        <div className="border-t border-line p-2 dark:border-slate-800">
          <button
            type="button"
            onClick={() => {
              setCollapsed(false);
              try {
                const stored = loadPrefs();
                localStorage.setItem("darshan-ui-prefs", JSON.stringify({ ...stored, sidebarCollapsed: false }));
              } catch {}
            }}
            className="flex w-full items-center justify-center rounded-xl p-2 text-slate-400 hover:bg-slate-50 hover:text-slate-700 dark:hover:bg-slate-900/40"
            aria-label="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </aside>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { prefs } = useUIPreferences();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  React.useEffect(() => {
    try { applyPrefsToDom(prefs); } catch {}
  }, [prefs]);

  React.useEffect(() => {
    try { setCollapsed(!!loadPrefs().sidebarCollapsed); } catch {}
  }, []);

  React.useEffect(() => { setMobileOpen(false); }, [pathname]);

  // Page label for header
  const currentNav = NAV.find((n) => n.href === pathname);

  return (
    <div className="h-full">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-60" />

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/30 backdrop-blur-[2px]"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[80vw] max-w-[280px] p-4">
            <Sidebar pathname={pathname} collapsed={false} showCollapse={false} />
          </div>
        </div>
      )}

      <div className="relative mx-auto flex h-full w-full max-w-[1600px] gap-4 p-4">
        {/* Desktop sidebar */}
        <div className="hidden lg:block shrink-0">
          <Sidebar pathname={pathname} collapsed={collapsed} setCollapsed={setCollapsed} showCollapse />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Header */}
          <header className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-softSm ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-line text-slate-500 hover:bg-slate-50 lg:hidden dark:ring-slate-800 dark:hover:bg-slate-900/60"
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {currentNav?.label ?? "Darshan"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">MithranLabs · Agent Platform</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <FontSizeToggle />
              <ThemeToggle />
            </div>
          </header>

          <main className="min-h-0 flex-1" role="main">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
