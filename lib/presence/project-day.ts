export function projectDate(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function dayStart(day: string, timeZone: string) {
  const center = new Date(`${day}T00:00:00Z`).getTime();
  let low = center - 48 * 3600000;
  let high = center + 48 * 3600000;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (projectDate(new Date(middle), timeZone) < day) low = middle;
    else high = middle;
  }
  return new Date(high);
}

/** First instant of a calendar day in the project time zone. */
export function projectDayStart(day: string, timeZone: string) {
  return dayStart(day, timeZone);
}

export function projectDay(now: Date, timeZone: string) {
  const date = projectDate(now, timeZone);
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);
  return { date, gte: dayStart(date, timeZone), lt: dayStart(next, timeZone) };
}
