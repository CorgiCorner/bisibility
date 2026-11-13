/** Calendar day in the document time zone, as YYYY-MM-DD, for comparing stored day keys. */
export function isoDayKey(timeZone: string, now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).format(now);
}
