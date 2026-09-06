import { formatDateTime } from "@/lib/dates/format";

type ScheduledRunInput = {
  nextRunAt: Date;
  now: Date;
  timezone: string;
};

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

export function formatScheduledRun({ nextRunAt, now, timezone }: ScheduledRunInput): string {
  const next = zonedParts(nextRunAt, timezone);
  const current = zonedParts(now, timezone);
  const days = Math.round((calendarDay(next) - calendarDay(current)) / 86_400_000);
  const relative = days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `Scheduled - runs ${relative} at ${next.time} (${timezone})`;
}
