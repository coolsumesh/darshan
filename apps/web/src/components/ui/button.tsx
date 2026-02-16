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
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
        "disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" ? "h-9 px-3 text-sm" : "h-10 px-4 text-sm",
        variant === "primary" &&
          "bg-brand-600 text-white shadow-softSm hover:bg-brand-700",
        variant === "secondary" &&
          "bg-white text-ink shadow-softSm ring-1 ring-line hover:bg-slate-50",
        variant === "ghost" &&
          "bg-transparent text-ink hover:bg-slate-100 ring-1 ring-transparent hover:ring-line",
        variant === "danger" &&
          "bg-rose-600 text-white shadow-softSm hover:bg-rose-700",
        className
      )}
      {...props}
    />
  );
}
