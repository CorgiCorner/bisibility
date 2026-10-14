import type { HistoryWindow } from "./history-contract";

function civilDate(at: Date, formatter: Intl.DateTimeFormat) {
  const parts = formatter.formatToParts(at);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

/** First instant of a local calendar date, including midnight skipped by DST. */
export function reportCalendarDayStart(day: string, timeZone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("Invalid calendar date.");
  const center = Date.parse(`${day}T00:00:00Z`);
  if (!Number.isFinite(center) || new Date(center).toISOString().slice(0, 10) !== day)
    throw new Error("Invalid calendar date.");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  let low = center - 36 * 3_600_000,
    high = center + 36 * 3_600_000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (civilDate(new Date(middle), formatter) < day) low = middle + 1;
    else high = middle;
  }
  if (civilDate(new Date(low), formatter) !== day)
    throw new Error("This calendar date does not exist in the report time zone.");
  return new Date(low);
}

/** Inclusive local dates ending at the actual watermark; the current day can be partial. */
export function keywordHistoryWindows(
  asOf: Date,
  timeZone: string,
): readonly { id: string; window: HistoryWindow }[] {
  if (!Number.isFinite(asOf.getTime())) throw new Error("Invalid history watermark.");
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const today = Date.parse(`${civilDate(asOf, formatter)}T00:00:00Z`);
  return [7, 30, 90].map((days) => {
    const firstDate = new Date(today);
    firstDate.setUTCDate(firstDate.getUTCDate() - days + 1);
    return {
      id: `${days}d`,
      window: {
        basis: "observed_at" as const,
        from: reportCalendarDayStart(firstDate.toISOString().slice(0, 10), timeZone).toISOString(),
        to: asOf.toISOString(),
      },
    };
  });
}
