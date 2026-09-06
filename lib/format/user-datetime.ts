import {
  type DateFormatPreference as BaseDateFormatPreference,
  type DateFormat,
  formatDate as formatCalendarDate,
  formatDateTime as formatCalendarDateTime,
} from "@/lib/dates/format";
import { resolveDateFormat } from "@/lib/dates/resolve";

/** Legacy cookie values still accepted by the formatter bridge. */
export type DateFormatPreference = BaseDateFormatPreference | "eu" | "long";

export type DateTimeFormatContext = {
  dateFormat?: DateFormatPreference;
  timezone: string;
};

const DEFAULT_DATE_FORMAT = "iso" satisfies DateFormat;
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function partsFor(date: Date, timeZone: string) {
  const [key, time = "00:00"] = formatCalendarDateTime(date, "iso", timeZone).split(", ");
  const [year, month, day] = key.split("-").map(Number);
  return { day, key, month, time, year };
}

function dayKey(date: Date, timeZone: string) {
  return partsFor(date, timeZone).key;
}

function dayOrdinal(date: Date, timeZone: string) {
  const { day, month, year } = partsFor(date, timeZone);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function resolvePreference(dateFormat: DateFormatPreference): DateFormat {
  if (dateFormat === "eu") return "day_first";
  if (dateFormat === "long") return "month_first";
  return resolveDateFormat(dateFormat);
}

export function createUserDateTimeFormatter({
  dateFormat = DEFAULT_DATE_FORMAT,
  timezone,
}: DateTimeFormatContext) {
  const resolved = resolvePreference(dateFormat);

  function formatDate(date: Date) {
    return formatCalendarDate(dayKey(date, timezone), resolved);
  }

  function formatRelativeDay(date: Date, now: Date) {
    const diff = dayOrdinal(now, timezone) - dayOrdinal(date, timezone);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    return formatDate(date);
  }

  return {
    dateFormat: resolved,
    formatDate,
    formatDateTime: (date: Date) => formatCalendarDateTime(date, resolved, timezone),
    formatMonthYear: (date: Date) => {
      const { month, year } = partsFor(date, timezone);
      return `${MONTHS[month - 1] ?? ""} ${year}`;
    },
    formatRelativeDay,
    formatTime: (date: Date) => partsFor(date, timezone).time,
    timezone,
  };
}
