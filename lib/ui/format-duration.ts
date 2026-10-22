const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const TWO_WEEKS = 14 * DAY;

export type DurationUnit = "minutes" | "hours" | "days" | "weeks";

export type DurationParts = {
  count: number;
  unit: DurationUnit;
};

/** Floors so a remaining window never claims more time than is left. */
export function durationParts(totalSeconds: number): DurationParts {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  if (seconds < HOUR) return { count: Math.floor(seconds / MINUTE), unit: "minutes" };
  if (seconds < DAY) return { count: Math.floor(seconds / HOUR), unit: "hours" };
  const days = Math.floor(seconds / DAY);
  if (seconds < TWO_WEEKS || days % 7 !== 0) return { count: days, unit: "days" };
  return { count: days / 7, unit: "weeks" };
}

export type DurationLabels = {
  [Unit in DurationUnit]: (values: { count: number }) => string;
};

export function formatDuration(totalSeconds: number, labels: DurationLabels): string {
  const parts = durationParts(totalSeconds);
  return labels[parts.unit]({ count: parts.count });
}

export function wholeSecondsRemaining(until: string, now: Date): number {
  return Math.floor((new Date(until).getTime() - now.getTime()) / 1_000);
}
