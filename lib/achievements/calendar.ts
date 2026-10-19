export function validTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}
export function calendarDay(at: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function shiftDay(day: string, delta: number) {
  return new Date(Date.parse(`${day}T12:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}
export function nextMorning(day: string, timeZone: string) {
  const desired = `${shiftDay(day, 1)}T09:00:00`;
  let at = new Date(`${desired}Z`);
  for (let index = 0; index < 3; index += 1) {
    const p = new Intl.DateTimeFormat("sv-SE", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .format(at)
      .replace(" ", "T");
    const offset = Date.parse(`${desired}Z`) - Date.parse(`${p}Z`);
    at = new Date(at.getTime() + offset);
    if (!offset) break;
  }
  return at;
}
