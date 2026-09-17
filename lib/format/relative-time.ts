export type RelativePastFact =
  | { kind: "justNow" }
  | { count: number; kind: "minutesAgo" | "hoursAgo" | "daysAgo" }
  | { kind: "yesterday" };

export function relativePastFact(date: Date, now: Date): RelativePastFact {
  const minutes = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return { kind: "justNow" };
  if (minutes < 60) return { count: minutes, kind: "minutesAgo" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { count: hours, kind: "hoursAgo" };
  const days = Math.floor(hours / 24);
  return days === 1 ? { kind: "yesterday" } : { count: days, kind: "daysAgo" };
}

/**
 * Compatibility formatter for test and non-rendering callers. Product boundaries
 * render the semantic fact through their scoped catalogs instead.
 */
export function relativePast(date: Date, now: Date) {
  const fact = relativePastFact(date, now);
  if (fact.kind === "justNow") return "just now";
  if (fact.kind === "yesterday") return "yesterday";
  if (fact.kind === "minutesAgo") return `${fact.count}m ago`;
  if (fact.kind === "hoursAgo") return `${fact.count}h ago`;
  return `${fact.count}d ago`;
}

export function relativeFuture(date: Date | null, now: Date) {
  if (!date) return "Not scheduled";
  const minutes = Math.ceil((date.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "due now";
  if (minutes < 60) return `in ${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  return hours < 24 ? `in ${hours}h` : `in ${Math.ceil(hours / 24)}d`;
}
