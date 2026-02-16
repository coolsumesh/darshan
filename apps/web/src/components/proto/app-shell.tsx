"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";
import {
  Activity,
  Bot,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Menu,
  MessageSquareText,
  MoreHorizontal,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import ThemeToggle from "@/components/proto/theme-toggle";
import FontSizeToggle from "@/components/proto/font-size-toggle";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/threads", label: "Threads", icon: MessageSquareText },
  { href: "/attendance", label: "Attendance", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

type NeedsAttentionType = "error" | "approval" | "unanswered";

type NeedsAttentionItem = {
  type: NeedsAttentionType;
  source: string;
  text: string;
  time: string; // relative
  unread?: boolean;
};

const NEEDS_ATTENTION: NeedsAttentionItem[] = [
  {
    type: "error",
    source: "Calendar",
    text: "calendar_fetch exceeded 4.8s p95. Suggest retry or fallback provider.",
    time: "2m",
    unread: true,
  },
  {
    type: "approval",
    source: "Operator Queue",
    text: "Thread #1842 is blocked on deploy confirmation.",
    time: "11m",
    unread: true,
  },
  {
    type: "unanswered",
    source: "Support",
    text: "Customer asked for a one-off report; no response recorded yet.",
    time: "23m",
  },
  {
    type: "error",
    source: "Pipeline",
    text: "Attendance-normalizer drift flagged. Recommend manual verification step.",
    time: "41m",
  },
];

function Tabs({
  value,
  onChange,
  counts,
}: {
  value: "all" | NeedsAttentionType;
  onChange: (v: "all" | NeedsAttentionType) => void;
  counts: Record<"all" | NeedsAttentionType, number>;
}) {
  const tabs: Array<{ key: "all" | NeedsAttentionType; label: string }> = [
    { key: "all", label: "All" },
    { key: "error", label: "Errors" },
    { key: "approval", label: "Approvals" },
    { key: "unanswered", label: "Unanswered" },
  ];

  return (
    <div
      className="flex w-full items-center gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-line dark:bg-slate-900/40 dark:ring-slate-800"
      role="tablist"
      aria-label="Needs attention filters"
    >
      {tabs.map((t) => {
        const active = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={cn(
              "inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              active
                ? "bg-white text-slate-900 shadow-softSm ring-1 ring-line dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800"
                : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-950/40"
            )}
          >
            <span className="truncate">{t.label}</span>
            <span
              className={cn(
                "grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[11px]",
                active
                  ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  : "bg-slate-200/70 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200"
              )}
              aria-label={`${counts[t.key]} items`}
            >
              {counts[t.key]}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function NeedsAttentionQueue({ collapsed }: { collapsed: boolean }) {
  const [tab, setTab] = React.useState<"all" | NeedsAttentionType>("all");

  const filtered = React.useMemo(() => {
    if (tab === "all") return NEEDS_ATTENTION;
    return NEEDS_ATTENTION.filter((n) => n.type === tab);
  }, [tab]);

  const counts = React.useMemo(() => {
    const base: Record<"all" | NeedsAttentionType, number> = {
      all: NEEDS_ATTENTION.length,
      error: 0,
      approval: 0,
      unanswered: 0,
    };
    for (const n of NEEDS_ATTENTION) base[n.type] += 1;
    return base;
  }, []);

  if (collapsed) {
    // Compact indicator block.
    const unread = NEEDS_ATTENTION.some((n) => n.unread);
    return (
      <div
        className="grid place-items-center rounded-xl p-3 ring-1 ring-line dark:ring-slate-800"
        aria-label="Needs attention"
      >
        <div
          className={cn(
            "h-3 w-3 rounded-full",
            unread ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
          )}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          Needs Attention
        </div>
        <Badge tone="warning">{NEEDS_ATTENTION.length}</Badge>
      </div>

      <Tabs value={tab} onChange={setTab} counts={counts} />

      <div className="mt-3 overflow-hidden rounded-2xl bg-white ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
        {filtered.map((n, idx) => {
          const avatarLetter = n.source.slice(0, 1).toUpperCase();
          return (
            <div
              key={`${n.source}-${idx}`}
              className={cn(
                "group flex items-start gap-3 px-3 py-3 transition",
                "hover:bg-slate-50 dark:hover:bg-slate-900/40",
                idx !== filtered.length - 1 &&
                  "border-b border-line/70 dark:border-slate-800"
              )}
            >
              {/* Unread dot */}
              <div className="mt-3 h-2 w-2 shrink-0">
                {n.unread ? (
                  <div
                    className="h-2 w-2 rounded-full bg-brand-600"
                    aria-label="Unread"
                  />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-transparent" />
                )}
              </div>

              {/* Avatar */}
              <div
                className={cn(
                  "mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1",
                  "bg-slate-900 text-white ring-slate-900 dark:bg-slate-800 dark:ring-slate-700"
                )}
                aria-hidden
              >
                <span className="text-xs font-semibold">{avatarLetter}</span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {n.source}
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-600 dark:text-slate-300">
                      {n.text}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-start gap-2">
                    <div className="pt-0.5 text-xs text-slate-400 dark:text-slate-400">
                      {n.time}
                    </div>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-transparent",
                        "text-slate-500 hover:bg-slate-100 hover:text-slate-700 hover:ring-line",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                        "dark:text-slate-300 dark:hover:bg-slate-900/60 dark:hover:text-slate-100 dark:hover:ring-slate-800"
                      )}
                      aria-label={`More actions for ${n.source}`}
                      title="More"
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                  </div>
                </div>

                <div className="mt-2">
                  <Badge
                    tone={
                      n.type === "error"
                        ? "warning"
                        : n.type === "approval"
                          ? "brand"
                          : "neutral"
                    }
                  >
                    {n.type === "error"
                      ? "Error"
                      : n.type === "approval"
                        ? "Approval"
                        : "Unanswered"}
                  </Badge>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No items in this tab.
          </div>
        )}
      </div>

      <div className="mt-3">
        <Button className="w-full" variant="ghost">
          View queue
        </Button>
      </div>
    </div>
  );
}

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
        "flex h-full flex-col rounded-2xl bg-white shadow-soft ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800",
        collapsed ? "w-[80px]" : "w-[320px]"
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-line p-4 dark:border-slate-800">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-600 text-white shadow-softSm">
            <Sparkles className="h-5 w-5" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Darshan
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Ops Console
              </div>
            </div>
          )}
        </div>

        {showCollapse && setCollapsed && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              "inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-line",
              "text-slate-500 hover:bg-slate-50 hover:text-slate-700",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              "dark:ring-slate-800 dark:hover:bg-slate-900/60 dark:text-slate-300 dark:hover:text-slate-100"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      <div className={cn("p-4", collapsed && "px-3")}>
        {!collapsed && (
          <div className="mb-3">
            <Input placeholder="Search threads, agents…" aria-label="Search" />
          </div>
        )}

        <nav className="space-y-1" aria-label="Primary">
          {NAV.map((item) => {
            const active = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition",
                  "hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  "dark:hover:bg-slate-900/40",
                  active &&
                    "bg-brand-50 text-brand-700 ring-1 ring-brand-100 dark:bg-brand-500/10 dark:text-brand-100 dark:ring-brand-500/20"
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4",
                    active
                      ? "text-brand-700 dark:text-brand-100"
                      : "text-slate-500 group-hover:text-slate-700 dark:text-slate-300 dark:group-hover:text-slate-100"
                  )}
                />
                {!collapsed && (
                  <span className={cn("font-medium", active && "text-brand-700")}>{item.label}</span>
                )}
                {!collapsed && item.href === "/dashboard" && (
                  <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    6
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className={cn("mt-auto border-t border-line p-4", collapsed && "px-3", "dark:border-slate-800")}>
        <NeedsAttentionQueue collapsed={collapsed} />
      </div>
    </aside>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);

  // Close mobile drawer on navigation.
  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

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
          <div className="absolute inset-y-0 left-0 w-[92vw] max-w-[360px] p-4">
            <Sidebar pathname={pathname} collapsed={false} showCollapse={false} />
          </div>
        </div>
      )}

      <div className="relative mx-auto flex h-full w-full max-w-[1600px] gap-4 p-4">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <Sidebar
            pathname={pathname}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            showCollapse
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-softSm ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className={cn(
                  "inline-flex h-11 w-11 items-center justify-center rounded-xl ring-1 ring-line",
                  "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
                  "lg:hidden",
                  "dark:ring-slate-800 dark:hover:bg-slate-900/60 dark:text-slate-300 dark:hover:text-slate-100"
                )}
                aria-label="Open navigation"
              >
                <Menu className="h-4 w-4" aria-hidden />
              </button>

              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Operator Console
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Live thread triage • 12 active agents
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <FontSizeToggle />
              <ThemeToggle />
              <Button variant="secondary" size="sm">
                New thread
              </Button>
              <Button variant="primary" size="sm">
                Deploy
              </Button>
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
