export type RankCheckRunSkip = {
  plannedFor: string;
  schedule: string;
};

export function rankCheckRunSkipFor(action: string, after: unknown): RankCheckRunSkip | undefined {
  if (
    action !== "rank_check_run.skip" ||
    !after ||
    typeof after !== "object" ||
    Array.isArray(after)
  ) {
    return undefined;
  }
  const { plannedFor, schedule } = after as { plannedFor?: unknown; schedule?: unknown };
  return typeof plannedFor === "string" && typeof schedule === "string" && schedule.trim()
    ? { plannedFor, schedule }
    : undefined;
}
