type ZoneParts = {
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: number;
  year: number;
};

// Bulk comparisons revisit the same civil days across distinct cron expressions.
const zoneReadings = new Map<string, ZoneParts>();
const MAX_ZONE_READINGS = 4096;
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

/** Zone read used by the count walk. Tests spy on this export. */
export function readCronZone(date: Date, timezone: string) {
  const key = `${timezone}:${date.getTime()}`;
  const cached = zoneReadings.get(key);
  if (cached) return { ...cached };
  let formatter = zonedFormatters.get(timezone);
  if (!formatter) {
    // SCHEDULE MATH (not display): read wall-clock fields in the configured timezone.
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
    });
    zonedFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(date);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const result = {
    day,
    hour: value("hour"),
    minute: value("minute"),
    month,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
    year,
  };
  if (zoneReadings.size >= MAX_ZONE_READINGS) {
    const oldest = zoneReadings.keys().next();
    if (!oldest.done) zoneReadings.delete(oldest.value);
  }
  zoneReadings.set(key, result);
  return { ...result };
}
