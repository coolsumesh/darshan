import { cn } from "@/lib/cn";

export function Separator({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-line", className)} {...props} />;
}
