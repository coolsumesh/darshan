"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Activity,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  FolderKanban,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { applyPrefsToDom, loadPrefs, useUIPreferences } from "@/components/proto/ui-preferences";

// ─── Nav config ───────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/dashboard", label: "Dashboard",  icon: Activity         },
  { href: "/projects",  label: "Projects",   icon: FolderKanban     },
  { href: "/agents",    label: "Agents",     icon: Bot              },
  { href: "/threads",   label: "Threads",    icon: MessageSquareText },
  { href: "/calendar",  label: "Calendar",   icon: CalendarDays     },
] as const;

const TOOL_NAV = [
  { href: "/inspect",  label: "Inspect",     icon: Search           },
] as const;

const SETTINGS_NAV = [
  { href: "/settings", label: "Settings",    icon: Settings         },
] as const;

// ─── Nav primitives ───────────────────────────────────────────────────────────

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg text-sm transition-colors duration-100",
        collapsed ? "h-9 w-9 justify-center" : "h-9 px-3",
        active
          ? "bg-[rgba(124,58,237,0.20)] text-[#C4B5FD]"
          : "text-[#9B93B8] hover:bg-white/5 hover:text-white"
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          active ? "text-[#A78BFA]" : "text-[#6B6385] group-hover:text-[#A78BFA]"
        )}
      />
      {!collapsed && <span className="truncate font-medium">{label}</span>}
    </Link>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-2 h-px bg-white/5" />;
  return (
    <p className="mb-1 mt-5 px-3 text-[10px] font-semibold uppercase tracking-widest text-[#4A4468]">
      {label}
    </p>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({
  pathname,
  collapsed,
  setCollapsed,
}: {
  pathname: string;
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
}) {
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <aside
      className={cn(
        "flex flex-col overflow-hidden bg-brand-950 transition-all duration-200 ease-in-out",
        collapsed ? "w-14" : "w-60"
      )}
    >
      {/* Logo strip — matches topbar height */}
      <div
        className={cn(
          "flex h-12 shrink-0 items-center border-b border-white/5",
          collapsed ? "justify-center" : "gap-2 px-4"
        )}
      >
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-brand-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        {!collapsed && (
          <span className="font-display text-sm font-semibold text-white">Darshan</span>
        )}
      </div>

      {/* Scrollable nav */}
      <nav
        className={cn("flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-3")}
        aria-label="Primary navigation"
      >
        <div className="flex flex-col gap-0.5">
          {PRIMARY_NAV.map((item) => (
            <NavItem
              key={item.href}
              {...item}
              active={isActive(item.href, item.href === "/dashboard")}
              collapsed={collapsed}
            />
          ))}
        </div>

        <SectionLabel label="Tools" collapsed={collapsed} />
        <div className="flex flex-col gap-0.5">
          {TOOL_NAV.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        <SectionLabel label="Settings" collapsed={collapsed} />
        <div className="flex flex-col gap-0.5">
          {SETTINGS_NAV.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href, true)} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* Bottom pinned */}
      <div className={cn("shrink-0 border-t border-white/5 py-3", collapsed ? "px-2" : "px-3")}>
        <NavItem href="/help" label="Help" icon={HelpCircle} active={false} collapsed={collapsed} />

        {!collapsed && (
          <div className="mt-2 flex items-center gap-2.5 rounded-lg px-3 py-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">
              S
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-white">Sumesh</div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="text-[10px] text-[#4A4468]">Online</span>
              </div>
            </div>
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-[#4A4468] transition-colors hover:bg-white/5 hover:text-white"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span className="text-xs font-medium">Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { prefs } = useUIPreferences();
  const [collapsed,   setCollapsed]   = React.useState(false);
  const [mobileOpen,  setMobileOpen]  = React.useState(false);

  React.useEffect(() => {
    try { applyPrefsToDom(prefs); } catch { /* no-op */ }
  }, [prefs]);

  React.useEffect(() => {
    try {
      const initial = loadPrefs().sidebarCollapsed;
      setCollapsed(!!initial);
    } catch { /* no-op */ }
  }, []);

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  function handleCollapse(v: boolean) {
    setCollapsed(v);
    try {
      const stored = loadPrefs();
      const updated = { ...stored, sidebarCollapsed: v };
      localStorage.setItem("darshan-ui-prefs", JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent("darshan:prefs", { detail: updated }));
    } catch { /* no-op */ }
  }

  return (
    <div className="flex h-full flex-col bg-zinc-50 dark:bg-[#0C0A12]">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-40" />

      {/* ── Topbar ─────────────────────────────────────────────── */}
      <header className="relative z-40 flex h-12 shrink-0 items-center justify-between border-b border-white/5 bg-brand-950 px-4">
        {/* Left */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden text-white/50 hover:text-white transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo (desktop) */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <span className="font-display text-sm font-semibold text-white">Darshan</span>
          </div>

          {/* Breadcrumb */}
          <div className="hidden lg:flex items-center gap-1.5 text-white/40">
            <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            <span className="text-xs font-medium text-white/60">MithranLabs</span>
          </div>
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-white/15">
            <Plus className="h-3.5 w-3.5" />
            Invite
          </button>
          <div className="grid h-7 w-7 place-items-center rounded-full bg-brand-700 text-xs font-bold text-white">
            S
          </div>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 overflow-hidden">

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
            />
            <div className="absolute inset-y-0 left-0 flex">
              <Sidebar pathname={pathname} collapsed={false} setCollapsed={() => setMobileOpen(false)} />
            </div>
          </div>
        )}

        {/* Desktop sidebar */}
        <div className="hidden lg:flex">
          <Sidebar pathname={pathname} collapsed={collapsed} setCollapsed={handleCollapse} />
        </div>

        {/* Main content area */}
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto" role="main">
          <div className="flex-1 px-6 pt-4 pb-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
