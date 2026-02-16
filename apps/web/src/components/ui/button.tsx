import * as React from "react";
import { cn } from "@/lib/cn";

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
};

export function Button({
  className,
  variant = "secondary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.55)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "sm" ? "h-11 sm:h-9 px-3 text-sm" : "h-11 sm:h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-brand-600 text-white shadow-softSm hover:bg-brand-700",
        variant === "secondary" &&
          "bg-white text-ink shadow-softSm ring-1 ring-line hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-100 dark:hover:bg-slate-900",
        variant === "ghost" &&
          "bg-transparent text-ink hover:bg-slate-100 ring-1 ring-transparent hover:ring-line dark:text-slate-100 dark:hover:bg-slate-900/60",
        variant === "danger" &&
          "bg-rose-600 text-white shadow-softSm hover:bg-rose-700",
        className
      )}
      {...props}
    />
  );
}
