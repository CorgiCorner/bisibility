import type { HistoryDayGroup, HistoryRow } from "./contract";

/** Calendar day in an IANA time zone. `en-CA` yields YYYY-MM-DD. */
export function historyDayKey(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(new Date(iso));
}

export function shiftHistoryDay(day: string, delta: number): string {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

export function groupHistoryByDay(
  rows: readonly HistoryRow[],
  timeZone: string,
  now: Date,
): HistoryDayGroup[] {
  const today = historyDayKey(now.toISOString(), timeZone);
  const yesterday = shiftHistoryDay(today, -1);
  const groups: HistoryDayGroup[] = [];
  for (const row of rows) {
    const day = historyDayKey(row.occurredAt, timeZone);
    const label = day === today ? "today" : day === yesterday ? "yesterday" : "date";
    const last = groups.at(-1);
    if (last?.day === day) last.rows.push(row);
    else groups.push({ day, label, rows: [row] });
  }
  return groups;
}
