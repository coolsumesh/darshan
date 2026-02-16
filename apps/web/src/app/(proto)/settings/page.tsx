"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  applyPrefsToDom,
  DEFAULT_PREFS,
  type DensityPreference,
  type ThemePreference,
  useUIPreferences,
} from "@/components/proto/ui-preferences";

function Segmented({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ key: string; label: string; hint?: string }>;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
        {label}
      </div>
      <div
        className="mt-2 flex w-full items-center gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-line dark:bg-slate-900/40 dark:ring-slate-800"
        role="group"
        aria-label={label}
      >
        {options.map((o) => {
          const active = value === o.key;
          return (
            <button
              key={o.key}
              type="button"
              onClick={() => onChange(o.key)}
              className={
                "inline-flex flex-1 items-center justify-center rounded-lg px-2 py-2 text-xs font-semibold transition " +
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)] " +
                (active
                  ? "bg-white text-slate-900 shadow-softSm ring-1 ring-line dark:bg-slate-950 dark:text-slate-100 dark:ring-slate-800"
                  : "text-slate-600 hover:bg-white/70 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-950/40")
              }
              aria-pressed={active}
              title={o.hint}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl bg-white p-4 ring-1 ring-line dark:bg-slate-950 dark:ring-slate-800">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </div>
        <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {description}
        </div>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "relative inline-flex h-11 w-16 shrink-0 items-center rounded-full ring-1 transition " +
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)] " +
          (checked
            ? "bg-[rgb(var(--accent-600))] ring-transparent"
            : "bg-slate-200 ring-slate-300 dark:bg-slate-800 dark:ring-slate-700")
        }
        aria-label={title}
      >
        <span
          className={
            "inline-block h-8 w-8 transform rounded-full bg-white shadow-softSm transition " +
            (checked ? "translate-x-7" : "translate-x-1")
          }
        />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { prefs, setPref } = useUIPreferences();

  // Ensure DOM is in sync if user lands directly on /settings.
  React.useEffect(() => {
    try {
      applyPrefsToDom(prefs);
    } catch {
      // no-op
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid grid-cols-12 gap-4">
      <div className="col-span-12 lg:col-span-7">
        <div className="space-y-4">
          {/* Appearance */}
          <Card>
            <CardHeader>
              <CardTitle>Appearance</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Theme + accent preferences
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <Segmented
                  label="Theme"
                  value={prefs.theme}
                  onChange={(v) => setPref("theme", v as ThemePreference)}
                  options={[
                    { key: "light", label: "Light" },
                    { key: "dark", label: "Dark" },
                    { key: "system", label: "System", hint: "Follows OS preference" },
                  ]}
                />

                <Segmented
                  label="Accent color"
                  value={prefs.accent}
                  onChange={(v) => setPref("accent", v as any)}
                  options={[
                    { key: "blue", label: "Blue" },
                    { key: "violet", label: "Violet" },
                    { key: "emerald", label: "Emerald" },
                    { key: "amber", label: "Amber" },
                  ]}
                />

                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <Badge tone="neutral">Applies immediately</Badge>
                  <span>Theme supports Light / Dark / System.</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Rem-based scaling (default: 16px)
              </div>
            </CardHeader>
            <CardContent>
              <Segmented
                label="Font size"
                value={prefs.fontSize}
                onChange={(v) => setPref("fontSize", v as any)}
                options={[
                  { key: "sm", label: "Small" },
                  { key: "md", label: "Medium" },
                  { key: "lg", label: "Large" },
                  { key: "xl", label: "XL" },
                ]}
              />
            </CardContent>
          </Card>

          {/* Accessibility */}
          <Card>
            <CardHeader>
              <CardTitle>Accessibility</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Quick adjustments for legibility and comfort
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <ToggleRow
                  title="High contrast"
                  description="Increase overall contrast (best-effort for prototype)."
                  checked={prefs.highContrast}
                  onChange={(v) => setPref("highContrast", v)}
                />
                <ToggleRow
                  title="Reduced motion"
                  description="Minimizes animations and transitions across the UI."
                  checked={prefs.reducedMotion}
                  onChange={(v) => setPref("reducedMotion", v)}
                />
                <ToggleRow
                  title="Show focus indicators"
                  description="Keeps visible focus rings for keyboard navigation."
                  checked={prefs.showFocusIndicators}
                  onChange={(v) => setPref("showFocusIndicators", v)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Layout */}
          <Card>
            <CardHeader>
              <CardTitle>Layout</CardTitle>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Sidebar behavior + density
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <ToggleRow
                  title="Sidebar collapsed by default"
                  description="Start with a compact sidebar on desktop."
                  checked={prefs.sidebarCollapsed}
                  onChange={(v) => setPref("sidebarCollapsed", v)}
                />

                <Segmented
                  label="Density"
                  value={prefs.density}
                  onChange={(v) => setPref("density", v as DensityPreference)}
                  options={[
                    { key: "comfortable", label: "Comfortable" },
                    { key: "compact", label: "Compact" },
                  ]}
                />

                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      // Reset all prefs.
                      localStorage.setItem(
                        "darshan-ui-prefs",
                        JSON.stringify(DEFAULT_PREFS)
                      );
                      applyPrefsToDom(DEFAULT_PREFS);
                    }}
                  >
                    Reset to defaults
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-5">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none text-slate-700 dark:text-slate-200 dark:prose-invert">
              <p>
                These settings are stored in localStorage and apply immediately
                (no page reload).
              </p>
              <p>
                Intended for stakeholder UX review: theme switching, typography
                scaling, and accessibility toggles.
              </p>
              <p>
                <strong>Note:</strong> Agents are expected to update USER.md / IDENTITY.md /
                MEMORY.md daily.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
