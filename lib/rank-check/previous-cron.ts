import { CronExpressionParser } from "cron-parser";
import { parseCanonicalCron } from "./canonical-cron-syntax";
import { zonedCronParts } from "./cron";

export const previousCronRun = (expression: string, from: Date, timezone: string) =>
  canonicalAnchor(expression, from, timezone, true);
export const nextCanonicalCronRun = (expression: string, from: Date, timezone: string) =>
  canonicalAnchor(expression, from, timezone, false);

/** Read-only projection; worker cron and pinned migration semantics stay unchanged. */
function canonicalAnchor(expression: string, from: Date, timezone: string, reverse: boolean) {
  const cron = parseCanonicalCron(expression);
  if (!cron.ok) return null;
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  // The normalizer's OR may accept February Mondays plus day 31. Canonical AND
  // has no anchor: return unavailable before the candidate parser rejects day 31.
  const days = cron.day,
    months = cron.month;
  if (
    days &&
    months &&
    ![...months].some((month) => [...days].some((day) => day <= daysInMonth[month - 1]))
  )
    return null;
  const matches = (date: Date) => {
    const parts = zonedCronParts(date, timezone);
    return (["minute", "hour", "day", "month", "weekday"] as const).every(
      (key) => cron[key] === null || cron[key].has(parts[key]),
    );
  };
  const fields = expression.trim().split(/\s+/);
  // Removing DOW when both are constrained yields a superset of canonical AND,
  // with fewer candidates than the library's DOM/DOW OR. Verify every candidate.
  if (cron.day !== null && cron.weekday !== null) fields[4] = "*";
  const boundary = new Date(from);
  boundary.setUTCFullYear(boundary.getUTCFullYear() + (reverse ? -400 : 400));
  let candidates: ReturnType<typeof CronExpressionParser.parse>;
  try {
    candidates = CronExpressionParser.parse(fields.join(" "), {
      currentDate: reverse ? new Date(from.getTime() + 1) : from,
      ...(reverse ? { startDate: boundary } : { endDate: boundary }),
      tz: timezone,
    });
  } catch {
    return null;
  }
  // The Gregorian calendar repeats after 400 years. One candidate per minute is
  // the complete-cycle upper bound, not a smaller arbitrary validity cutoff.
  const maximum = Math.ceil(Math.abs(from.getTime() - boundary.getTime()) / 60_000) + 1;
  for (let count = 0; count < maximum; count += 1) {
    let candidate: Date;
    try {
      candidate = (reverse ? candidates.prev() : candidates.next()).toDate();
    } catch (error) {
      if (error instanceof Error && error.message === "Out of the time span range") return null;
      throw error;
    }
    if (!matches(candidate)) continue;
    // Refine around the candidate with the canonical kernel so a repeated local
    // hour uses the latest/earliest real UTC instant for the requested direction.
    const edge = reverse
      ? Math.min(from.getTime(), candidate.getTime() + 48 * 3600_000)
      : Math.max(from.getTime() + 1, candidate.getTime() - 48 * 3600_000);
    let cursor = new Date(
      (reverse ? Math.floor(edge / 60_000) : Math.ceil(edge / 60_000)) * 60_000,
    );
    while (reverse ? cursor >= candidate : cursor <= candidate) {
      if (matches(cursor)) return cursor;
      cursor = new Date(cursor.getTime() + (reverse ? -60_000 : 60_000));
    }
  }
  return null;
}
