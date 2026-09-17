import { type DateDisplayContext, formatDisplayDate } from "@/lib/dates/format";

export type TimelineDateTimeFormatter = {
  formatDate: (date: Date) => string;
  formatRelativeDay: (date: Date, now: Date) => "today" | "yesterday" | null;
  formatTime: (date: Date) => string;
};

function calendarDayKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function calendarDayOrdinal(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

export function createTimelineDateTimeFormatter(
  context: DateDisplayContext,
): TimelineDateTimeFormatter {
  const timeFormatter = new Intl.DateTimeFormat(context.locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: context.timeZone,
  });

  return {
    formatDate: (date) => formatDisplayDate(calendarDayKey(date, context.timeZone), context),
    formatRelativeDay: (date, now) => {
      const difference =
        calendarDayOrdinal(calendarDayKey(now, context.timeZone)) -
        calendarDayOrdinal(calendarDayKey(date, context.timeZone));
      if (difference === 0) return "today";
      if (difference === 1) return "yesterday";
      return null;
    },
    formatTime: (date) => timeFormatter.format(date),
  };
}
