export function utcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function viewsWindowStart(now: Date): Date {
  const day = utcDay(now);
  day.setUTCDate(day.getUTCDate() - 6);
  return day;
}
