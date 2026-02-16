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
  MessageSquareText,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Activity },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/threads", label: "Threads", icon: MessageSquareText },
  { href: "/attendance", label: "Attendance", icon: CalendarClock },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const NEEDS_ATTENTION = [
  {
    title: "Tool error: calendar_fetch timed out",
    meta: "Agent: Mira • 2m ago",
    tone: "warning" as const,
  },
  {
    title: "Thread stalled: awaiting operator approval",
    meta: "Thread #1842 • 11m ago",
    tone: "neutral" as const,
  },
  {
    title: "Low confidence: identity match",
    meta: "Agent: Darshan • 23m ago",
    tone: "warning" as const,
  },
];

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="h-full bg-bg">
      <div className="pointer-events-none fixed inset-0 bg-grid opacity-60" />

      <div className="relative mx-auto flex h-full w-full max-w-[1600px] gap-4 p-4">
        <aside
          className={cn(
            "flex h-full flex-col rounded-2xl bg-white shadow-soft ring-1 ring-line",
            collapsed ? "w-[72px]" : "w-[320px]"
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <div className={cn("flex items-center gap-3", collapsed && "justify-center")}
            >
              <div className="grid h-10 w-10 place-items-center rounded-2xl bg-brand-600 text-white shadow-softSm">
                <Sparkles className="h-5 w-5" />
              </div>
              {!collapsed && (
                <div className="leading-tight">
                  <div className="text-sm font-semibold">Darshan</div>
                  <div className="text-xs text-muted">Ops Console</div>
                </div>
              )}
            </div>

            <button
              onClick={() => setCollapsed((v) => !v)}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-line",
                "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              )}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>

          <div className={cn("p-4", collapsed && "px-3")}>
            {!collapsed && (
              <div className="mb-3">
                <Input placeholder="Search threads, agents…" />
              </div>
            )}

            <nav className="space-y-1">
              {NAV.map((item) => {
                const active = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                      "hover:bg-slate-50",
                      active && "bg-brand-50 text-brand-700 ring-1 ring-brand-100"
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4",
                        active ? "text-brand-700" : "text-slate-500 group-hover:text-slate-700"
                      )}
                    />
                    {!collapsed && (
                      <span className={cn("font-medium", active && "text-brand-700")}>
                        {item.label}
                      </span>
                    )}
                    {!collapsed && item.href === "/dashboard" && (
                      <span className="ml-auto inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-slate-100 px-2 text-xs text-slate-600">
                        6
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className={cn("mt-auto border-t border-line p-4", collapsed && "px-3")}>
            {!collapsed && (
              <div className="mb-3 flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700">Needs Attention</div>
                <Badge tone="warning">{NEEDS_ATTENTION.length}</Badge>
              </div>
            )}

            <div className="space-y-2">
              {NEEDS_ATTENTION.map((q, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "rounded-xl p-3 ring-1 ring-line transition hover:bg-slate-50",
                    collapsed && "p-2"
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "mt-1 h-2.5 w-2.5 rounded-full",
                        q.tone === "warning" ? "bg-amber-400" : "bg-slate-300"
                      )}
                    />
                    {!collapsed && (
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-800">
                          {q.title}
                        </div>
                        <div className="truncate text-[11px] text-muted">{q.meta}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!collapsed && (
              <div className="mt-3">
                <Button className="w-full" variant="ghost">
                  View queue
                </Button>
              </div>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <header className="flex items-center justify-between rounded-2xl bg-white p-4 shadow-softSm ring-1 ring-line">
            <div>
              <div className="text-sm font-semibold">Operator Console</div>
              <div className="text-xs text-muted">
                Live thread triage • 12 active agents
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm">
                New thread
              </Button>
              <Button variant="primary" size="sm">
                Deploy
              </Button>
            </div>
          </header>

          <div className="min-h-0 flex-1">{children}</div>
        </div>
      </div>
    </div>
  );
}
