import {
  type DateFormatPreference as BaseDateFormatPreference,
  type DateFormat,
  formatDateTime as formatCalendarDateTime,
  formatDisplayDate,
  formatDisplayDateTime,
} from "@/lib/dates/format";
import { resolveDateFormat } from "@/lib/dates/resolve";

/** Legacy cookie values still accepted by the formatter bridge. */
export type DateFormatPreference = BaseDateFormatPreference | "eu" | "long";

export type DateTimeFormatContext = {
  dateFormat?: DateFormatPreference;
  locale?: string;
  timezone: string;
};

const DEFAULT_DATE_FORMAT = "iso" satisfies DateFormat;

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
  locale = "en-US",
  timezone,
}: DateTimeFormatContext) {
  const resolved = resolvePreference(dateFormat);

  function formatDate(date: Date) {
    return formatDisplayDate(dayKey(date, timezone), {
      dateFormat: resolved,
      locale,
      timeZone: "UTC",
    });
  }

  function formatRelativeDay(date: Date, now: Date) {
    const diff = dayOrdinal(now, timezone) - dayOrdinal(date, timezone);
    if (diff === 0 || diff === 1) {
      const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(
        diff === 0 ? 0 : -1,
        "day",
      );
      return `${relative.at(0)?.toLocaleUpperCase(locale) ?? ""}${relative.slice(1)}`;
    }
    return formatDate(date);
  }

  return {
    dateFormat: resolved,
    formatDate,
    formatDateTime: (date: Date) =>
      formatDisplayDateTime(date, { dateFormat: resolved, locale, timeZone: timezone }),
    formatMonthYear: (date: Date) => {
      const { month, year } = partsFor(date, timezone);
      return new Intl.DateTimeFormat(locale, {
        month: "long",
        timeZone: "UTC",
        year: "numeric",
      }).format(new Date(Date.UTC(year, month - 1, 1)));
    },
    formatRelativeDay,
    formatTime: (date: Date) => partsFor(date, timezone).time,
    timezone,
  };
}
