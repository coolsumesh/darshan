import * as React from "react";
import { cn } from "@/lib/cn";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl bg-white px-3 text-sm",
        "shadow-softSm ring-1 ring-line placeholder:text-slate-400",
        "focus:outline-none focus:ring-2 focus:ring-brand-500/30",
        className
      )}
      {...props}
    />
  );
}
