export function formatRelativeTime(
  from: Date | string,
  now: Date = new Date()
): string {
  const fromDate = typeof from === "string" ? new Date(from) : from;
  const diffMs = now.getTime() - fromDate.getTime();

  // Guard against invalid dates.
  if (Number.isNaN(fromDate.getTime())) return "—";

  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  const rtf = (value: number, unit: "second" | "minute" | "hour" | "day") => {
    const suffix = value < 0 ? "from now" : "ago";
    const n = Math.abs(value);
    const label = unit === "day" ? "d" : unit === "hour" ? "h" : unit === "minute" ? "m" : "s";
    return `${n}${label} ${suffix}`;
  };

  if (absSec < 60) return rtf(diffSec, "second");

  const diffMin = Math.round(diffSec / 60);
  const absMin = Math.abs(diffMin);
  if (absMin < 60) return rtf(diffMin, "minute");

  const diffHr = Math.round(diffMin / 60);
  const absHr = Math.abs(diffHr);
  if (absHr < 48) return rtf(diffHr, "hour");

  const diffDay = Math.round(diffHr / 24);
  return rtf(diffDay, "day");
}

export function formatDateShort(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  // Example: 2026-02-16
  return date.toISOString().slice(0, 10);
}
