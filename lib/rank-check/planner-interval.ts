export const DEFAULT_RANK_CHECK_PLANNER_INTERVAL = "15 minutes";

/** Only familiar single-unit intervals get a numeric UI estimate. */
export function plannerIntervalMinutes(interval: string): number | null {
  const match =
    /^(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s|minutes?|m|hours?|h|days?|d)$/i.exec(
      interval.trim(),
    );
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase() ?? "";
  const factor =
    unit === "ms" || unit.startsWith("millisecond")
      ? 1 / 60_000
      : unit === "s" || unit.startsWith("second")
        ? 1 / 60
        : unit === "h" || unit.startsWith("hour")
          ? 60
          : unit === "d" || unit.startsWith("day")
            ? 1440
            : 1;
  const minutes = amount * factor;
  return Number.isFinite(minutes) && minutes > 0 && minutes <= 525600 ? Math.ceil(minutes) : null;
}
