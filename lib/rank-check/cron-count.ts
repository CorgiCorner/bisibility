import { parseCronExpression } from "./cron";
import * as cronZone from "./cron-zone";

type CronFields = Exclude<ReturnType<typeof parseCronExpression>, { ok: false }>;
type Civil = { day: number; month: number; year: number };

function matchesField(field: ReadonlySet<number> | null, value: number) {
  return field === null || field.has(value);
}

/** Day-of-month and day-of-week must both match, the same AND rule as `matchesCron`. */
function civilDayMatches(cron: CronFields, parts: Civil) {
  if (!matchesField(cron.month, parts.month) || !matchesField(cron.day, parts.day)) return false;
  const weekday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
  return matchesField(cron.weekday, weekday);
}

function civilAfter(parts: Civil, last: Civil) {
  if (parts.year !== last.year) return parts.year > last.year;
  if (parts.month !== last.month) return parts.month > last.month;
  return parts.day > last.day;
}

function sameCivil(left: Civil, right: Civil) {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

function nextCivilDay(parts: Civil): Civil {
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day) + 86_400_000);
  return { day: next.getUTCDate(), month: next.getUTCMonth() + 1, year: next.getUTCFullYear() };
}

function offsetHolds(timezone: string, parts: Civil, hour: number, minute: number, offset: number) {
  const actual = cronZone.readCronZone(
    new Date(Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute) - offset),
    timezone,
  );
  return (
    actual.year === parts.year &&
    actual.month === parts.month &&
    actual.day === parts.day &&
    actual.hour === hour &&
    actual.minute === minute
  );
}

function civilOffsetMs(timezone: string, parts: Civil, hour: number, minute: number) {
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  return asUtc - zonedInstant({ ...parts, hour, minute }, timezone).getTime();
}

export function zonedInstant(
  parts: { day: number; hour: number; minute: number; month: number; year: number },
  timezone: string,
) {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);
  let instant = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = cronZone.readCronZone(new Date(instant), timezone);
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      0,
    );
    const correction = target - actualUtc;
    if (correction === 0) break;
    instant += correction;
  }
  return new Date(instant);
}

/** Same field-wise AND rule as the private runtime matcher. */
export function matchesCron(schedule: CronFields, date: Date, timezone: string) {
  const parts = cronZone.readCronZone(date, timezone);
  return (
    matchesField(schedule.minute, parts.minute) &&
    matchesField(schedule.hour, parts.hour) &&
    matchesField(schedule.day, parts.day) &&
    matchesField(schedule.month, parts.month) &&
    matchesField(schedule.weekday, parts.weekday)
  );
}

export function cronHasCalendarRestriction(expression: string | null | undefined) {
  if (!expression) return false;
  const parsed = parseCronExpression(expression);
  if (!parsed.ok) return false;
  return parsed.day !== null || parsed.month !== null;
}

function sorted(values: Iterable<number>) {
  return [...values].sort((left, right) => left - right);
}

/** Occurrences in [start, end). Null when the expression is invalid or every minute matches. */
export function countCronRuns(
  expression: string,
  start: Date,
  end: Date,
  timezone: string,
): number | null {
  const parsed = parseCronExpression(expression);
  if (!parsed.ok || parsed.minute === null) return null;
  const minutes = sorted(parsed.minute);
  if (!parsed.hour && !parsed.day && !parsed.month && !parsed.weekday && timezone === "UTC") {
    let count = 0;
    for (const minute of minutes) {
      let slot = Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth(),
        start.getUTCDate(),
        start.getUTCHours(),
        minute,
        0,
      );
      if (slot < start.getTime()) slot += 60 * 60 * 1000;
      while (slot < end.getTime()) {
        count += 1;
        slot += 60 * 60 * 1000;
      }
    }
    return count;
  }
  if (end <= start) return 0;
  const hours = parsed.hour ? sorted(parsed.hour) : Array.from({ length: 24 }, (_, hour) => hour);
  const startMs = start.getTime();
  const endMs = end.getTime();
  const last = cronZone.readCronZone(new Date(endMs - 1), timezone);
  let count = 0;
  let offset = Number.NaN;
  let parts = cronZone.readCronZone(start, timezone);
  const first = { day: parts.day, month: parts.month, year: parts.year };
  // 1461 days reaches every leap day. A shorter window still stops at its last civil day.
  const dayLimit = Math.min(1500, Math.ceil((endMs - startMs) / 86_400_000) + 3);
  for (let guard = 0; guard < dayLimit && !civilAfter(parts, last); guard += 1) {
    if (civilDayMatches(parsed, parts)) {
      let midnightHolds = Number.isFinite(offset) && offsetHolds(timezone, parts, 0, 0, offset);
      if (!midnightHolds) {
        offset = civilOffsetMs(timezone, parts, 0, 0);
        midnightHolds = offsetHolds(timezone, parts, 0, 0, offset);
      }
      const stable = midnightHolds && offsetHolds(timezone, parts, 23, 59, offset);
      const dayBase = Date.UTC(parts.year, parts.month - 1, parts.day) - offset;
      const bounded = sameCivil(parts, first) || sameCivil(parts, last);
      const day = stable
        ? bounded
          ? countBoundedDay(hours, minutes, dayBase, startMs, endMs)
          : { count: hours.length * minutes.length, reachedEnd: false }
        : countTransitionDay(parsed, parts, hours, minutes, timezone, startMs, endMs);
      count += day.count;
      if (day.reachedEnd) break;
    }
    const next = nextCivilDay(parts);
    parts = { ...parts, ...next };
  }
  return count;
}

function countBoundedDay(
  hours: readonly number[],
  minutes: readonly number[],
  dayBase: number,
  startMs: number,
  endMs: number,
) {
  let count = 0;
  let reachedEnd = false;
  for (const hour of hours) {
    for (const minute of minutes) {
      const millis = dayBase + hour * 3_600_000 + minute * 60_000;
      if (millis >= endMs) {
        reachedEnd = true;
        break;
      }
      if (millis >= startMs) count += 1;
    }
    if (reachedEnd) break;
  }
  return { count, reachedEnd };
}

function countTransitionDay(
  cron: CronFields,
  parts: Civil,
  hours: readonly number[],
  minutes: readonly number[],
  timezone: string,
  startMs: number,
  endMs: number,
) {
  // A fall-back local time exists twice. Resolving one instant undercounts that minute by one.
  const seen = new Set<number>();
  let count = 0;
  let reachedEnd = false;
  for (const hour of hours) {
    for (const minute of minutes) {
      const millis = zonedInstant({ ...parts, hour, minute }, timezone).getTime();
      if (millis >= endMs) {
        reachedEnd = true;
        continue;
      }
      if (millis < startMs || seen.has(millis)) continue;
      if (!matchesCron(cron, new Date(millis), timezone)) continue;
      seen.add(millis);
      count += 1;
    }
  }
  return { count, reachedEnd };
}
