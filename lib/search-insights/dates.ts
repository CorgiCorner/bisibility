import { type DateFormat, formatDate, formatDateRange, formatDateTime } from "@/lib/dates/format";
import type { SearchInsightsComparisonMode } from "@/lib/search-insights/constants";

const DAY_MS = 24 * 60 * 60 * 1_000;
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

// Search Console buckets every day in Pacific time, so the module presents one zone everywhere.
const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const pacificDayFormatter = new Intl.DateTimeFormat("en-CA", {
  day: "2-digit",
  month: "2-digit",
  timeZone: PACIFIC_TIME_ZONE,
  year: "numeric",
});

export type DateWindow = {
  end: string;
  start: string;
};

export type FinalizedWindow = {
  current: DateWindow;
  previous: DateWindow;
};

function parseDateKey(key: string) {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

// Reads the UTC fields, which is where a date-only column round-trips to.
export function dateKey(value: Date) {
  const year = String(value.getUTCFullYear()).padStart(4, "0");
  const month = String(value.getUTCMonth() + 1).padStart(2, "0");
  const day = String(value.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// UTC midnight is what a date-only column expects on write. The round trip rejects a
// well-shaped but non-existent day, which Date.UTC would otherwise roll into the next month.
export function dateFromKey(key: string) {
  const { day, month, year } = parseDateKey(key);
  const value = new Date(Date.UTC(year, month - 1, day));
  if (dateKey(value) !== key) throw new Error(`Invalid date key: ${key}`);
  return value;
}

export function pacificToday(now: Date) {
  const parts = new Map(
    pacificDayFormatter.formatToParts(now).map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
}

export function pacificQuotaDayRange(now: Date) {
  const key = pacificToday(now);
  const noonUtc = new Date(`${key}T12:00:00.000Z`);
  const parts = new Map(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: PACIFIC_TIME_ZONE,
      timeZoneName: "longOffset",
    })
      .formatToParts(noonUtc)
      .map((part) => [part.type, part.value]),
  );
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(parts.get("timeZoneName") ?? "");
  if (!match) throw new Error("Pacific timezone offset is unavailable.");
  const offsetMinutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === "+" ? 1 : -1);
  const start = new Date(dateFromKey(key).getTime() - offsetMinutes * 60_000);
  const nextKey = addDays(key, 1);
  const nextNoon = new Date(`${nextKey}T12:00:00.000Z`);
  const nextParts = new Map(
    new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone: PACIFIC_TIME_ZONE,
      timeZoneName: "longOffset",
    })
      .formatToParts(nextNoon)
      .map((part) => [part.type, part.value]),
  );
  const nextMatch = /^GMT([+-])(\d{2}):(\d{2})$/.exec(nextParts.get("timeZoneName") ?? "");
  if (!nextMatch) throw new Error("Pacific timezone offset is unavailable.");
  const nextOffset =
    (Number(nextMatch[2]) * 60 + Number(nextMatch[3])) * (nextMatch[1] === "+" ? 1 : -1);
  return { start, end: new Date(dateFromKey(nextKey).getTime() - nextOffset * 60_000) };
}

export function addDays(key: string, days: number) {
  return dateKey(new Date(dateFromKey(key).getTime() + days * DAY_MS));
}

// Whole days from `from` to `to`; negative when `to` is the earlier day.
export function diffDays(from: string, to: string) {
  return Math.round((dateFromKey(to).getTime() - dateFromKey(from).getTime()) / DAY_MS);
}

// Clamps to the last day of the target month, so 31 March minus one month is 28 February.
export function monthsBefore(key: string, months: number) {
  const { day, month, year } = parseDateKey(key);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const daysInMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, daysInMonth));
  return dateKey(target);
}

// The current block ends on the newest finalized day; the previous block is the one before it.
export function finalizedWindow(
  finalizedThrough: string,
  days: number,
  comparison: SearchInsightsComparisonMode = "previous_period",
): FinalizedWindow {
  const currentStart = addDays(finalizedThrough, -(days - 1));
  if (comparison === "year_over_year") {
    return {
      current: { end: finalizedThrough, start: currentStart },
      previous: { end: monthsBefore(finalizedThrough, 12), start: monthsBefore(currentStart, 12) },
    };
  }
  const previousEnd = addDays(currentStart, -1);
  return {
    current: { end: finalizedThrough, start: currentStart },
    previous: { end: previousEnd, start: addDays(previousEnd, -(days - 1)) },
  };
}

export function formatPacificTimestampValue(value: Date, format: DateFormat = "month_first") {
  const key = pacificToday(value);
  const datePart = format === "iso" ? formatDate(key, format) : formatDateRange(key, key, format);
  const full = formatDateTime(value, "iso", PACIFIC_TIME_ZONE);
  const time = full.slice(full.lastIndexOf(", ") + 2);
  return `${datePart}, ${time}`;
}

export function formatPacificTimestamp(value: Date, format: DateFormat = "month_first") {
  return `${formatPacificTimestampValue(value, format)} Pacific`;
}

export function formatDateLabel(key: string, format: DateFormat = "month_first") {
  return formatDate(key, format);
}

export function formatDateRangeLabel(window: DateWindow, format: DateFormat = "month_first") {
  return formatDateRange(window.start, window.end, format);
}
