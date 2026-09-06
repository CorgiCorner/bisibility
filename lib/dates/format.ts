/**
 * Product-wide calendar date formatting. Month names stay English; only order and
 * separators change with the reader's preference. `auto` is resolved before these
 * helpers run - they take the resolved format only.
 */

export const DATE_FORMATS = ["day_first", "month_first", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const DATE_FORMAT_PREFERENCES = ["auto", ...DATE_FORMATS] as const;
export type DateFormatPreference = (typeof DATE_FORMAT_PREFERENCES)[number];

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

type CalendarDay = {
  day: number;
  month: number;
  year: number;
};

function parseDateKey(key: string): CalendarDay {
  const match = DATE_KEY_PATTERN.exec(key);
  if (!match) throw new Error(`Invalid date key: ${key}`);
  return {
    day: Number(match[3]),
    month: Number(match[2]),
    year: Number(match[1]),
  };
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthName(month: number) {
  return MONTHS[month - 1] ?? "";
}

function toKey(parts: CalendarDay) {
  return `${String(parts.year).padStart(4, "0")}-${pad(parts.month)}-${pad(parts.day)}`;
}

function calendarFromDate(date: Date, timeZone: string): CalendarDay {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function clockFromDate(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("hour")}:${value("minute")}`;
}

function formatParts(parts: CalendarDay, format: DateFormat, withYear: boolean) {
  const month = monthName(parts.month);
  if (format === "iso") {
    return toKey(parts);
  }
  if (format === "day_first") {
    return withYear ? `${parts.day} ${month} ${parts.year}` : `${parts.day} ${month}`;
  }
  return withYear ? `${month} ${parts.day}, ${parts.year}` : `${month} ${parts.day}`;
}

export function formatDate(key: string, format: DateFormat) {
  return formatParts(parseDateKey(key), format, true);
}

export function formatDateRange(startKey: string, endKey: string, format: DateFormat) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);

  if (startKey === endKey) {
    return formatParts(start, format, false);
  }

  if (format === "iso") {
    return `${toKey(start)} - ${toKey(end)}`;
  }

  if (start.year !== end.year) {
    return `${formatParts(start, format, true)} - ${formatParts(end, format, true)}`;
  }

  if (start.month === end.month) {
    if (format === "day_first") {
      return `${start.day} - ${end.day} ${monthName(start.month)}`;
    }
    return `${monthName(start.month)} ${start.day} - ${end.day}`;
  }

  return `${formatParts(start, format, false)} - ${formatParts(end, format, false)}`;
}

export function formatDateTime(date: Date, format: DateFormat, timeZone = "UTC") {
  const day = calendarFromDate(date, timeZone);
  return `${formatParts(day, format, true)}, ${clockFromDate(date, timeZone)}`;
}

export function formatDateTimeCurrentYear(
  date: Date,
  format: DateFormat,
  now: Date,
  timeZone = "UTC",
) {
  const day = calendarFromDate(date, timeZone);
  const current = calendarFromDate(now, timeZone);
  return `${formatParts(day, format, day.year !== current.year)}, ${clockFromDate(date, timeZone)}`;
}

export function formatDayOfMonth(key: string, _format: DateFormat) {
  return String(parseDateKey(key).day);
}
