export type { ProviderRateLimitScope } from "./rate-limit-error";

const pacific = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wallTime(instant: Date) {
  const parts = pacific.formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

/** The next calendar midnight in Pacific time, including DST offset changes. */
export function nextPacificMidnight(now: Date): Date {
  const local = wallTime(now);
  const target = Date.UTC(local.year, local.month - 1, local.day + 1);
  let candidate = target;
  // Re-evaluate the offset at the target date, not at now, across DST transitions.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const wall = wallTime(new Date(candidate));
    const represented = Date.UTC(
      wall.year,
      wall.month - 1,
      wall.day,
      wall.hour,
      wall.minute,
      wall.second,
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

/** Calendar date used by the shared inspection counter. */
export function pacificDate(now: Date): string {
  const local = wallTime(now);
  return `${local.year}-${String(local.month).padStart(2, "0")}-${String(local.day).padStart(2, "0")}`;
}

export function pacificDay(now: Date) {
  const lt = nextPacificMidnight(now);
  // Noon on the previous local day is always before today's midnight, including DST.
  const gte = nextPacificMidnight(new Date(lt.getTime() - 36 * 60 * 60 * 1000));
  return { gte, lt };
}
