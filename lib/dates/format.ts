/**
 * Legacy compatibility formatters below retain English month names. Reader-facing
 * UI must use the explicit locale-aware display helpers instead. `auto` is
 * resolved before either contract runs.
 */

export const DATE_FORMATS = ["day_first", "month_first", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const DATE_FORMAT_PREFERENCES = ["auto", ...DATE_FORMATS] as const;
export type DateFormatPreference = (typeof DATE_FORMAT_PREFERENCES)[number];

/** Explicit rendering context for reader-facing calendar dates. */
export type DateDisplayContext = {
  dateFormat: DateFormat;
  locale: string;
  timeZone: string;
};

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
  // This en-US formatter extracts stable numeric fields only. It never provides reader-facing copy.
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
  // This en-US formatter extracts stable 24-hour numeric fields only.
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

function clockWithSecondsFromDate(date: Date, timeZone: string) {
  // This en-US formatter extracts stable 24-hour numeric fields only.
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    second: "2-digit",
    timeZone,
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("hour")}:${value("minute")}:${value("second")}`;
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

function utcDate(parts: CalendarDay) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function isEnglish(locale: string) {
  return locale === "en" || locale.startsWith("en-");
}

/**
 * English-only field extraction. Every other locale receives its own pattern from
 * `Intl.DateTimeFormat` directly, so its field order and connectives ("de", 年月日) survive.
 */
function displayDateParts(parts: CalendarDay, locale: string) {
  const dateParts = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).formatToParts(utcDate(parts));

  const value = (type: Intl.DateTimeFormatPartTypes) =>
    dateParts.find((part) => part.type === type)?.value ?? "";

  return { day: value("day"), month: value("month"), year: value("year") };
}

function formatDisplayParts(parts: CalendarDay, context: DateDisplayContext, withYear: boolean) {
  if (context.dateFormat === "iso") return toKey(parts);

  // A non-English locale owns its own field order and its own literals ("6 de septiembre de
  // 2026", "2026年9月6日"). Re-emitting the fields around a hardcoded comma produced
  // "septiembre 6, 2026" and "wrzesnia 6, 2026", so Intl formats the whole string instead and
  // the month_first/day_first preference applies to English only.
  if (!isEnglish(context.locale)) {
    const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", timeZone: "UTC" };
    if (withYear) options.year = "numeric";
    return new Intl.DateTimeFormat(context.locale, options).format(utcDate(parts));
  }

  const display = displayDateParts(parts, context.locale);
  if (context.dateFormat === "day_first") {
    return withYear
      ? `${display.day} ${display.month} ${display.year}`
      : `${display.day} ${display.month}`;
  }
  return withYear
    ? `${display.month} ${display.day}, ${display.year}`
    : `${display.month} ${display.day}`;
}

export function formatDate(key: string, format: DateFormat) {
  return formatParts(parseDateKey(key), format, true);
}

/**
 * Formats an ISO calendar-day key for a reader. This never applies a timezone
 * to the key, so a persisted day cannot cross a calendar boundary.
 */
export function formatDisplayDate(key: string, context: DateDisplayContext) {
  return formatDisplayParts(parseDateKey(key), context, true);
}

/** Formats a calendar-month key without converting it through the viewer timezone. */
export function formatDisplayMonthYear(key: string, context: DateDisplayContext) {
  const parts = parseDateKey(key);
  if (context.dateFormat === "iso") return toKey(parts).slice(0, 7);
  return new Intl.DateTimeFormat(context.locale, {
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(utcDate(parts));
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

/** Formats a compact reader-facing range while retaining the selected date order. */
export function formatDisplayDateRange(
  startKey: string,
  endKey: string,
  context: DateDisplayContext,
) {
  const start = parseDateKey(startKey);
  const end = parseDateKey(endKey);

  if (startKey === endKey) return formatDisplayParts(start, context, false);
  if (context.dateFormat === "iso") return `${toKey(start)} - ${toKey(end)}`;
  if (start.year !== end.year) {
    return `${formatDisplayParts(start, context, true)} - ${formatDisplayParts(end, context, true)}`;
  }

  // Only English compacts a same-month range: another locale's month name carries grammar
  // ("de septiembre", 9月) that cannot be lifted out of one of the two dates.
  if (start.month === end.month && isEnglish(context.locale)) {
    const startDisplay = displayDateParts(start, context.locale);
    const endDisplay = displayDateParts(end, context.locale);
    return context.dateFormat === "day_first"
      ? `${startDisplay.day} - ${endDisplay.day} ${startDisplay.month}`
      : `${startDisplay.month} ${startDisplay.day} - ${endDisplay.day}`;
  }

  return `${formatDisplayParts(start, context, false)} - ${formatDisplayParts(end, context, false)}`;
}

export function formatDateTime(date: Date, format: DateFormat, timeZone = "UTC") {
  const day = calendarFromDate(date, timeZone);
  return `${formatParts(day, format, true)}, ${clockFromDate(date, timeZone)}`;
}

/** Formats an instant in its explicit timezone with reader locale and 24-hour clock. */
export function formatDisplayDateTime(date: Date, context: DateDisplayContext) {
  const day = calendarFromDate(date, context.timeZone);
  return `${formatDisplayParts(day, context, true)}, ${clockFromDate(date, context.timeZone)}`;
}

/** Formats an instant with seconds in its explicit reader locale and timezone. */
export function formatDisplayDateTimeWithSeconds(date: Date, context: DateDisplayContext) {
  const day = calendarFromDate(date, context.timeZone);
  return `${formatDisplayParts(day, context, true)}, ${clockWithSecondsFromDate(date, context.timeZone)}`;
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

export function formatDisplayDateTimeCurrentYear(
  date: Date,
  now: Date,
  context: DateDisplayContext,
) {
  const day = calendarFromDate(date, context.timeZone);
  const current = calendarFromDate(now, context.timeZone);
  return `${formatDisplayParts(day, context, day.year !== current.year)}, ${clockFromDate(
    date,
    context.timeZone,
  )}`;
}

/** Formats a date as a locale-native relative calendar day in the explicit timezone. */
export function formatDisplayRelativeDay(date: Date, now: Date, context: DateDisplayContext) {
  const day = calendarFromDate(date, context.timeZone);
  const current = calendarFromDate(now, context.timeZone);
  const difference = Math.round((utcDate(day).getTime() - utcDate(current).getTime()) / 86_400_000);
  return new Intl.RelativeTimeFormat(context.locale, { numeric: "auto" }).format(difference, "day");
}

export function formatDayOfMonth(key: string, _format: DateFormat) {
  return String(parseDateKey(key).day);
}
