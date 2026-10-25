import {
  zonedDateInputValue,
  zonedDateTimeInputToUtc,
  zonedDateTimeInputWithOffset,
} from "./date-boundary";

function formatter(locale: string, timeZone: string) {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
}
const fields = new Set(["year", "month", "day", "hour", "minute", "second"]);
const escapePattern = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s*");

/** Editable, locale-ordered wall time; the offset preserves both occurrences of a DST fold. */
export function localizedDateTimeInputValue(date: Date, locale: string, timeZone: string) {
  const milliseconds = date.getUTCMilliseconds();
  return `${formatter(locale, timeZone).format(date)}${milliseconds ? `.${String(milliseconds).padStart(3, "0")}` : ""} ${zonedDateTimeInputWithOffset(date, timeZone).slice(-6)}`;
}

export function localizedDateTimeInputToUtc(value: string, locale: string, timeZone: string) {
  const names: string[] = [];
  const pattern = formatter(locale, timeZone)
    .formatToParts(new Date(0))
    .map((part) => {
      if (!fields.has(part.type)) return escapePattern(part.value);
      names.push(part.type);
      return part.type === "year" ? "(\\d{4})" : "(\\d{1,2})";
    })
    .join("");
  // Intl literals are escaped and every numeric capture is bounded.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const match = new RegExp(`^${pattern}(?:\\.(\\d{3}))?(?:\\s+([+-]\\d{2}:\\d{2}))?$`).exec(
    value.trim(),
  );
  if (!match) throw new RangeError("Invalid localized date-time");
  const parts = Object.fromEntries(
    names.map((name, index) => [name, match[index + 1].padStart(2, "0")]),
  );
  const iso = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${match[7] ? `.${match[7]}` : ""}${match[8] ?? ""}`;
  return zonedDateTimeInputToUtc(iso, timeZone);
}

export function localizedInputCalendarDay(value: string, locale: string, timeZone: string) {
  try {
    return zonedDateInputValue(
      new Date(localizedDateTimeInputToUtc(value, locale, timeZone)),
      timeZone,
    );
  } catch {
    return undefined;
  }
}

export function localizedInputSelectDay(
  value: string,
  day: string,
  locale: string,
  timeZone: string,
) {
  let clock = "00:00:00";
  try {
    clock = zonedDateTimeInputWithOffset(
      new Date(localizedDateTimeInputToUtc(value, locale, timeZone)),
      timeZone,
    ).slice(11, 23);
  } catch {
    /* A calendar selection repairs an invalid date draft. */
  }
  return localizedDateTimeInputValue(
    new Date(zonedDateTimeInputToUtc(`${day}T${clock}`, timeZone)),
    locale,
    timeZone,
  );
}
