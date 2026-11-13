export const CHALLENGE_LENGTHS = [30, 60, 90] as const;
export type ChallengeLength = (typeof CHALLENGE_LENGTHS)[number];
export const MAX_CHALLENGE_DAYS = 730;
export const MAX_SERIES_POINTS = 90;
export const MAX_MARKERS = 24;
export const MAX_TOP_PAGES = 5;
export const MAX_LESSON_CHARS = 2_000;
export const MAX_BODY_BYTES = 64 * 1024;

export type ChallengeStage = "custom" | "day30" | "day60" | "day90";
export type ChallengePeriod = { days: number; from: string; to: string };

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(value: string) {
  if (!DATE_KEY.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function addDays(key: string, days: number) {
  if (!isDateKey(key)) throw new Error("Challenge dates use YYYY-MM-DD.");
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function eachDate(from: string, to: string) {
  const dates: string[] = [];
  let cursor = from;
  while (cursor <= to && dates.length < MAX_CHALLENGE_DAYS) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}

export function periodDays(from: string, to: string) {
  if (!isDateKey(from) || !isDateKey(to)) return NaN;
  return (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
}

export function periodFromStart(from: string, days: number): ChallengePeriod {
  if (!isDateKey(from)) throw new Error("Challenge dates use YYYY-MM-DD.");
  const length = Math.trunc(days);
  if (length < 1 || length > MAX_CHALLENGE_DAYS) {
    throw new Error("A challenge report covers 1 to 730 days.");
  }
  return { days: length, from, to: addDays(from, length - 1) };
}

export function previousPeriod(period: ChallengePeriod): ChallengePeriod {
  const to = addDays(period.from, -1);
  return { days: period.days, from: addDays(to, 1 - period.days), to };
}

export function stageForDays(days: number): ChallengeStage {
  if (days === 30) return "day30";
  if (days === 60) return "day60";
  if (days === 90) return "day90";
  return "custom";
}

/** Whole-percent change. Null when the earlier period has no clicks to compare. */
export function percentChange(current: number, previous: number) {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** A period that still includes today, or ends later, can be regenerated. */
export function challengeReportIsDraft(periodEnd: string, today: string) {
  return periodEnd >= today;
}

/** Completed challenge reports can refresh late source data against their original baseline. */
export function challengeReportCanRefresh(
  body: { period: ChallengePeriod; journey?: { checkIns?: number } },
  today: string,
  baselineSnapshotId: unknown,
) {
  return body.journey
    ? body.journey.checkIns !== undefined &&
        typeof baselineSnapshotId === "string" &&
        baselineSnapshotId.length > 0
    : challengeReportIsDraft(body.period.to, today);
}
