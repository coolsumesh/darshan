import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 sm:h-10 w-full rounded-xl bg-white px-3 text-sm text-slate-900",
        "shadow-softSm ring-1 ring-line placeholder:text-slate-400",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent-500)/0.45)]",
        "dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-400",
        className
      )}
      {...props}
    />
  );
}
