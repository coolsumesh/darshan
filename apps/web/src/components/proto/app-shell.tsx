"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import { authLogout } from "@/lib/api";
import {
  Activity,
  Bell,
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  HelpCircle,
  FolderKanban,
  LogOut,
  Menu,
  MessageSquareText,
  Plus,
  Search,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { applyPrefsToDom, loadPrefs, useUIPreferences } from "@/components/proto/ui-preferences";

// ─── Nav config ───────────────────────────────────────────────────────────────

const PRIMARY_NAV = [
  { href: "/dashboard",     label: "Dashboard",      icon: Activity         },
  { href: "/projects",      label: "Projects",       icon: FolderKanban     },
  { href: "/agents",        label: "Agents",         icon: Bot              },
  { href: "/organisations", label: "Organisations",  icon: Building2        },
  { href: "/threads",       label: "Threads",        icon: MessageSquareText },
  { href: "/calendar",      label: "Calendar",       icon: CalendarDays     },
  { href: "/how-it-works",  label: "How it Works",   icon: BookOpen         },
] as const;

const TOOL_NAV = [
  { href: "/inspect",  label: "Inspect",     icon: Search           },
] as const;

const SETTINGS_NAV = [
  { href: "/settings", label: "Settings",    icon: Settings         },
] as const;

const DOCS_NAV = [
  { href: "/docs",          label: "Overview",      icon: FileText     },
  { href: "/docs/api",      label: "API Reference", icon: FileText     },
  { href: "/docs/agents",   label: "Agents",        icon: FileText     },
] as const;

const HELP_NAV = [
  { href: "/help/faq", label: "FAQ",         icon: HelpCircle       },
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

        <SectionLabel label="Docs" collapsed={collapsed} />
        <div className="flex flex-col gap-0.5">
          {DOCS_NAV.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>

        <SectionLabel label="Help" collapsed={collapsed} />
        <div className="flex flex-col gap-0.5">
          {HELP_NAV.map((item) => (
            <NavItem key={item.href} {...item} active={isActive(item.href)} collapsed={collapsed} />
          ))}
        </div>
      </nav>

      {/* Bottom pinned */}
      <div className={cn("shrink-0 border-t border-white/5 py-3", collapsed ? "px-2" : "px-3")}>
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
  const router = useRouter();
  const { prefs } = useUIPreferences();
  const [collapsed,     setCollapsed]     = React.useState(false);
  const [mobileOpen,    setMobileOpen]    = React.useState(false);
  const [userMenuOpen,  setUserMenuOpen]  = React.useState(false);
  const userMenuRef = React.useRef<HTMLDivElement>(null);

  // Close user menu on outside click
  React.useEffect(() => {
    function handleOutsideClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    if (userMenuOpen) document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [userMenuOpen]);

  async function handleLogout() {
    setUserMenuOpen(false);
    await authLogout();
    router.replace("/login");
  }

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
      <header
        className="relative z-40 flex h-14 shrink-0 items-center justify-between border-b border-white/8 px-4"
        style={{ backgroundColor: "#1E0A3C" }}
      >
        {/* ── Left: logo + wordmark ── */}
        <div className="flex items-center gap-3">
          {/* Mobile hamburger */}
          <button
            className="lg:hidden text-white/50 hover:text-white transition-colors"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Logo mark */}
          <div className="flex items-center gap-2.5">
            {/* Geometric logo placeholder */}
            <div className="relative grid h-8 w-8 place-items-center overflow-hidden rounded-xl" style={{ background: "linear-gradient(135deg,#7C3AED 0%,#4F46E5 100%)" }}>
              {/* Abstract "D" glyph */}
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 5h6a6 6 0 0 1 0 12H5V5z" />
              </svg>
              {/* Shimmer overlay */}
              <div className="absolute inset-0 rounded-xl" style={{ background: "linear-gradient(135deg,rgba(255,255,255,0.18) 0%,transparent 60%)" }} />
            </div>
            <div className="hidden sm:flex flex-col leading-tight">
              <span className="font-display text-[15px] font-bold tracking-tight text-white">Darshan</span>
              <span className="text-[10px] font-medium text-white/40 uppercase tracking-widest">by MithranLabs</span>
            </div>
          </div>
        </div>

        {/* ── Centre: global search ── */}
        <div className="hidden md:flex flex-1 max-w-md mx-6">
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <Search className="h-3.5 w-3.5 shrink-0" />
            <span>Search everything…</span>
            <kbd className="ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-white/30" style={{ background: "rgba(255,255,255,0.08)" }}>⌘K</kbd>
          </button>
        </div>

        {/* ── Right: actions + avatar ── */}
        <div className="flex items-center gap-1">
          {/* Search (mobile) */}
          <button className="md:hidden grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors">
            <Search className="h-4 w-4" />
          </button>

          {/* Notifications */}
          <button className="relative grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors">
            <Bell className="h-4 w-4" />
            {/* Unread dot */}
            <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brand-400" />
          </button>

          {/* Help */}
          <button className="grid h-8 w-8 place-items-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white transition-colors">
            <HelpCircle className="h-4 w-4" />
          </button>

          {/* Divider */}
          <div className="mx-2 h-5 w-px bg-white/10" />

          {/* User avatar + dropdown */}
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen((v) => !v)}
              className="flex items-center gap-2 rounded-lg px-2 py-1 transition-colors hover:bg-white/10"
            >
              <div
                className="grid h-7 w-7 place-items-center rounded-full text-xs font-bold text-white"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6366F1)" }}
              >
                S
              </div>
              <div className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-xs font-semibold text-white">Sumesh</span>
                <span className="text-[10px] text-white/40">Admin</span>
              </div>
              <ChevronDown className={cn("hidden sm:block h-3 w-3 text-white/30 transition-transform", userMenuOpen && "rotate-180")} />
            </button>

            {/* Dropdown menu */}
            {userMenuOpen && (
              <div
                className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-white/10 py-1 shadow-xl z-50"
                style={{ backgroundColor: "#1E0A3C" }}
              >
                {/* User info header */}
                <div className="px-4 py-3 border-b border-white/10">
                  <p className="text-xs font-semibold text-white">Sumesh</p>
                  <p className="text-[10px] text-white/40 mt-0.5">Admin</p>
                </div>

                {/* Logout */}
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-white/5 hover:text-red-300 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            )}
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
