function skippedOccurrenceEventName(after: unknown): string {
  if (!after || typeof after !== "object" || Array.isArray(after)) {
    return "Skipped a planned occurrence";
  }
  const { plannedFor, schedule } = after as { plannedFor?: unknown; schedule?: unknown };
  if (typeof schedule !== "string" || typeof plannedFor !== "string") {
    return "Skipped a planned occurrence";
  }
  const date = new Date(plannedFor);
  if (Number.isNaN(date.getTime())) return "Skipped a planned occurrence";
  const plannedLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
  return `Skipped the ${schedule} occurrence planned for ${plannedLabel}`;
}

export function auditEventName(action: string, after: unknown): string {
  if (action === "rank_check_run.skip") return skippedOccurrenceEventName(after);
  const words = action.replace(/[._]/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
