import { type AppLocale, intlLocale } from "@/i18n/config";

const DAY = 24 * 60 * 60_000;

/** Pure client/server formatter. Bounds are instants; the end remains exclusive. */
export function formatCheckWindowLabel({
  start,
  end,
  timeZone,
  locale,
}: {
  start: Date | string;
  end: Date | string;
  timeZone: string;
  locale: AppLocale;
}) {
  const from = new Date(start);
  const to = new Date(end);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
    throw new RangeError("Invalid check summary window.");
  }
  const clock = new Intl.DateTimeFormat(intlLocale(locale), {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const zone = new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" });
  const offset = (date: Date) =>
    zone
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")
      ?.value.replace("GMT", "UTC") ?? "UTC";
  const minutes = (value: string) => {
    const match = /^UTC([+-])(\d{2}):(\d{2})$/.exec(value);
    return match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3])) : 0;
  };
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const firstOffset = offset(from);
  const lastOffset = offset(to);
  // A different nearby offset maps the same wall time to a second valid instant in a fold.
  const ambiguous = [-DAY, DAY].some((delta) => {
    const otherOffset = offset(new Date(from.getTime() + delta));
    const candidate = new Date(
      from.getTime() + (minutes(firstOffset) - minutes(otherOffset)) * 60_000,
    );
    return otherOffset !== firstOffset && local.format(candidate) === local.format(from);
  });
  const range = `${clock.format(from)}–${clock.format(to)}`;
  if (firstOffset !== lastOffset) return `${range} (${firstOffset} → ${lastOffset})`;
  return ambiguous ? `${range} (${firstOffset})` : range;
}
