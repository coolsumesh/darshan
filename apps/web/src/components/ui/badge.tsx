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
        tone === "neutral" && "bg-slate-50 text-slate-700 ring-slate-200",
        tone === "brand" && "bg-brand-50 text-brand-700 ring-brand-200",
        tone === "warning" && "bg-amber-50 text-amber-800 ring-amber-200",
        tone === "success" && "bg-emerald-50 text-emerald-800 ring-emerald-200",
        className
      )}
      {...props}
    />
  );
}
