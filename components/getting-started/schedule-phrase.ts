type ScheduledRunInput = {
  nextRunAt: Date;
  now: Date;
  timezone: string;
};

type DateParts = { day: number; month: number; year: number };

function zonedParts(date: Date, timezone: string): DateParts & { time: string } {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );
  return {
    day: Number(parts.day),
    month: Number(parts.month),
    time: `${parts.hour}:${parts.minute}`,
    year: Number(parts.year),
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
