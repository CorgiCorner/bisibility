import { formatDateTime } from "@/lib/dates/format";

type ScheduledRunInput = {
  nextRunAt: Date;
  now: Date;
  timezone: string;
};

export type ScheduledRunPresentation = Readonly<{
  days: number;
  relative: "in_days" | "today" | "tomorrow";
}>;

type DateParts = { day: number; month: number; year: number };

function zonedParts(date: Date, timezone: string): DateParts & { time: string } {
  const [key, time = "00:00"] = formatDateTime(date, "iso", timezone).split(", ");
  const [year, month, day] = key.split("-").map(Number);
  return {
    day,
    month,
    time,
    year,
  };
}

function calendarDay(parts: DateParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

/** Keeps project-calendar semantics separate from localized presentation. */
export function scheduledRunPresentation({
  nextRunAt,
  now,
  timezone,
}: ScheduledRunInput): ScheduledRunPresentation {
  const next = zonedParts(nextRunAt, timezone);
  const current = zonedParts(now, timezone);
  const days = Math.round((calendarDay(next) - calendarDay(current)) / 86_400_000);
  return {
    days,
    relative: days === 0 ? "today" : days === 1 ? "tomorrow" : "in_days",
  };
}

export function formatScheduledRun({ nextRunAt, now, timezone }: ScheduledRunInput): string {
  const next = zonedParts(nextRunAt, timezone);
  const { days, relative } = scheduledRunPresentation({ nextRunAt, now, timezone });
  const relativeText =
    relative === "today" ? "today" : relative === "tomorrow" ? "tomorrow" : `in ${days} days`;
  return `Scheduled - runs ${relativeText} at ${next.time} (${timezone})`;
}
