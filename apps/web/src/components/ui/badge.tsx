import * as React from "react";
import { cn } from "@/lib/cn";

export function Badge({
  className,
  tone = "neutral",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & {
  tone?: "neutral" | "brand" | "warning" | "success";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1",
        tone === "neutral" &&
          "bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900 dark:text-slate-200 dark:ring-slate-700",
        tone === "brand" &&
          "bg-brand-50 text-brand-700 ring-brand-200 dark:bg-brand-500/15 dark:text-brand-100 dark:ring-brand-500/30",
        tone === "warning" &&
          "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-100 dark:ring-amber-500/30",
        tone === "success" &&
          "bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-emerald-500/30",
        className
      )}
      {...props}
    />
  );
}
