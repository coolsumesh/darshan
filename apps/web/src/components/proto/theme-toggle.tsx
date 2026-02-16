"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export default function ThemeToggle({
  className,
  size = "sm",
}: {
  className?: string;
  size?: "sm" | "md";
}) {
  const [theme, setTheme] = React.useState<Theme>("light");

  React.useEffect(() => {
    try {
      const stored = (localStorage.getItem("darshan-theme") as Theme | null) ?? null;
      const prefersDark =
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches;
      const t: Theme = stored ?? (prefersDark ? "dark" : "light");
      setTheme(t);
      applyTheme(t);
    } catch {
      // no-op
    }
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem("darshan-theme", next);
    } catch {
      // no-op
    }
    applyTheme(next);
  }

  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  return (
    <Button
      type="button"
      variant="secondary"
      size={size}
      onClick={toggle}
      aria-label={label}
      aria-pressed={theme === "dark"}
      className={className}
    >
      {theme === "dark" ? (
        <Sun className="h-4 w-4" aria-hidden />
      ) : (
        <Moon className="h-4 w-4" aria-hidden />
      )}
      <span className="hidden sm:inline">Theme</span>
    </Button>
  );
}
