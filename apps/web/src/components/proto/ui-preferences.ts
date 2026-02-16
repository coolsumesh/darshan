"use client";

import * as React from "react";

export type ThemePreference = "light" | "dark" | "system";
export type FontSizePreset = "sm" | "md" | "lg" | "xl";
export type DensityPreference = "compact" | "comfortable";

export type UIPreferences = {
  theme: ThemePreference;
  accent: "blue" | "violet" | "emerald" | "amber"; // optional-ish
  fontSize: FontSizePreset;
  highContrast: boolean;
  reducedMotion: boolean;
  showFocusIndicators: boolean;
  sidebarCollapsed: boolean;
  density: DensityPreference;
};

export const DEFAULT_PREFS: UIPreferences = {
  theme: "system",
  accent: "blue",
  fontSize: "md",
  highContrast: false,
  reducedMotion: false,
  showFocusIndicators: true,
  sidebarCollapsed: false,
  density: "comfortable",
};

const STORAGE_KEY = "darshan-ui-prefs";

function safeParse(json: string | null): Partial<UIPreferences> {
  if (!json) return {};
  try {
    return JSON.parse(json) as Partial<UIPreferences>;
  } catch {
    return {};
  }
}

export function loadPrefs(): UIPreferences {
  // Also support legacy keys already used in v2.
  const legacyTheme = (typeof localStorage !== "undefined"
    ? (localStorage.getItem("darshan-theme") as any)
    : null) as "light" | "dark" | null;
  const legacyFont = (typeof localStorage !== "undefined"
    ? (localStorage.getItem("darshan-font-size") as any)
    : null) as FontSizePreset | null;

  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  const parsed = safeParse(stored);

  const merged: UIPreferences = {
    ...DEFAULT_PREFS,
    ...parsed,
  };

  // Apply legacy overrides if the new object doesn't specify them.
  if (!parsed.theme && legacyTheme) merged.theme = legacyTheme;
  if (!parsed.fontSize && legacyFont) merged.fontSize = legacyFont;

  // Normalize
  if (!(["light", "dark", "system"] as const).includes(merged.theme)) merged.theme = "system";
  if (!(["sm", "md", "lg", "xl"] as const).includes(merged.fontSize)) merged.fontSize = "md";
  if (!(["blue", "violet", "emerald", "amber"] as const).includes(merged.accent)) merged.accent = "blue";
  if (!(["compact", "comfortable"] as const).includes(merged.density)) merged.density = "comfortable";

  return merged;
}

export function savePrefs(prefs: UIPreferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

  // Keep legacy keys in sync for compatibility with existing code paths.
  if (prefs.theme === "light" || prefs.theme === "dark") {
    localStorage.setItem("darshan-theme", prefs.theme);
  } else {
    localStorage.removeItem("darshan-theme");
  }
  localStorage.setItem("darshan-font-size", prefs.fontSize);
}

function prefersDark() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function fontPx(preset: FontSizePreset): number {
  return preset === "sm" ? 14 : preset === "lg" ? 18 : preset === "xl" ? 20 : 16;
}

function accentRgb(accent: UIPreferences["accent"]) {
  // These are used as CSS vars so we can theme a few key affordances.
  switch (accent) {
    case "violet":
      return { 500: "139 92 246", 600: "124 58 237", 700: "109 40 217" };
    case "emerald":
      return { 500: "16 185 129", 600: "5 150 105", 700: "4 120 87" };
    case "amber":
      return { 500: "245 158 11", 600: "217 119 6", 700: "180 83 9" };
    case "blue":
    default:
      return { 500: "59 130 246", 600: "37 99 235", 700: "29 78 216" };
  }
}

export function applyPrefsToDom(prefs: UIPreferences) {
  const root = document.documentElement;

  // Theme
  const resolvedTheme = prefs.theme === "system" ? (prefersDark() ? "dark" : "light") : prefs.theme;
  if (resolvedTheme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");

  // Font size (rem scaling)
  root.style.setProperty("--base-font-size", `${fontPx(prefs.fontSize)}px`);

  // Accent vars
  const acc = accentRgb(prefs.accent);
  root.style.setProperty("--accent-500", acc[500]);
  root.style.setProperty("--accent-600", acc[600]);
  root.style.setProperty("--accent-700", acc[700]);

  // A11y toggles
  root.classList.toggle("hc", !!prefs.highContrast);
  root.classList.toggle("reduce-motion", !!prefs.reducedMotion);
  root.classList.toggle("no-focus", !prefs.showFocusIndicators);

  // Layout
  root.classList.toggle("density-compact", prefs.density === "compact");
  root.classList.toggle("density-comfortable", prefs.density === "comfortable");

  // Broadcast so other components can react without reload.
  window.dispatchEvent(new CustomEvent("darshan:prefs", { detail: prefs }));
}

export function setPref<K extends keyof UIPreferences>(key: K, value: UIPreferences[K]) {
  const current = loadPrefs();
  const next = { ...current, [key]: value } as UIPreferences;
  savePrefs(next);
  applyPrefsToDom(next);
  return next;
}

export function useUIPreferences() {
  const [prefs, setPrefs] = React.useState<UIPreferences>(() => {
    try {
      return loadPrefs();
    } catch {
      return DEFAULT_PREFS;
    }
  });

  React.useEffect(() => {
    const onPrefs = (e: Event) => {
      const ce = e as CustomEvent<UIPreferences>;
      if (ce?.detail) setPrefs(ce.detail);
      else {
        try {
          setPrefs(loadPrefs());
        } catch {}
      }
    };

    window.addEventListener("darshan:prefs", onPrefs as any);
    window.addEventListener("storage", onPrefs);
    return () => {
      window.removeEventListener("darshan:prefs", onPrefs as any);
      window.removeEventListener("storage", onPrefs);
    };
  }, []);

  return {
    prefs,
    setPref: <K extends keyof UIPreferences>(key: K, value: UIPreferences[K]) => {
      const next = setPref(key, value);
      setPrefs(next);
    },
  };
}
