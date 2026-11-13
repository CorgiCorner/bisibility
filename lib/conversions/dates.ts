const DAY_MS = 86_400_000;

export function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

export function utcDayKey(value: Date) {
  return utcDay(value).toISOString().slice(0, 10);
}

export function addUtcDays(value: Date, days: number) {
  return new Date(utcDay(value).getTime() + days * DAY_MS);
}

/** Inclusive UTC calendar days ending on `now`. */
export function trailingPeriod(now: Date, days: number) {
  const to = utcDay(now);
  return { from: addUtcDays(to, -(days - 1)), to };
}

/** The same number of days immediately before `period`. */
export function previousPeriod(period: { from: Date; to: Date }) {
  const from = utcDay(period.from);
  const to = utcDay(period.to);
  const days = Math.round((to.getTime() - from.getTime()) / DAY_MS) + 1;
  const previousTo = addUtcDays(from, -1);
  return { from: addUtcDays(previousTo, -(Math.max(days, 1) - 1)), to: previousTo };
}

export function eachUtcDay(from: Date, to: Date) {
  const start = utcDay(from);
  const end = utcDay(to);
  const days: Date[] = [];
  if (start.getTime() > end.getTime()) return days;
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 1)) {
    days.push(cursor);
  }
  return days;
}
