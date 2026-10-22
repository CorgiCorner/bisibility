import type { useTranslations } from "next-intl";

function calendarDay(value: Date, locale: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";
  return Date.UTC(Number(part("year")), Number(part("month")) - 1, Number(part("day")));
}

/** Formats a planned run instant in the schedule's own time zone. */
export function nextRunLabel(
  value: string | null | undefined,
  timeZone: string | null | undefined,
  locale: string,
  t: ReturnType<typeof useTranslations<"projectRuns.schedules">>,
  distributed: false | "day" | "interval" = false,
) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const zone = timeZone ?? "UTC";
  try {
    new Intl.DateTimeFormat(locale, { timeZone: zone });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
  const now = new Date();
  if (distributed) {
    const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short" }).format(date);
    return t(distributed === "day" ? "nextRun.distributed" : "nextRun.distributedInterval", {
      day,
      timezone: zone,
    });
  }
  const days = Math.round(
    (calendarDay(date, locale, zone) - calendarDay(now, locale, zone)) / 86_400_000,
  );
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: zone,
  }).format(date);
  if (days === 0) return t("nextRun.today", { time });
  if (days === 1) return t("nextRun.tomorrow", { time });
  const day = new Intl.DateTimeFormat(locale, { timeZone: zone, weekday: "short" }).format(date);
  return t("nextRun.at", { day, time });
}
