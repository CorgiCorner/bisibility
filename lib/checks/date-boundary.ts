const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

type DateParts = {
  day: number;
  month: number;
  year: number;
};

type DateTimeParts = DateParts & {
  hour: number;
  minute: number;
  second: number;
};

function partValue(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) {
  return Number(parts.find((part) => part.type === type)?.value);
}

function zonedDateTimeParts(date: Date, timeZone: string): DateTimeParts {
  // TIMEZONE MATH (not display): derive project-local fields for boundary calculations.
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);

  return {
    day: partValue(parts, "day"),
    hour: partValue(parts, "hour"),
    minute: partValue(parts, "minute"),
    month: partValue(parts, "month"),
    second: partValue(parts, "second"),
    year: partValue(parts, "year"),
  };
}

function localDateTimeToUtc(parts: DateTimeParts, timeZone: string) {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let instant = target;

  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedDateTimeParts(new Date(instant), timeZone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = target - actualAsUtc;
    if (correction === 0) break;
    instant += correction;
  }

  return new Date(instant);
}

function parseDateInput(value: string): DateParts {
  const match = DATE_INPUT_PATTERN.exec(value);
  if (!match) throw new Error("Choose a valid date.");
  const [, year, month, day] = match;
  const parts = { day: Number(day), month: Number(month), year: Number(year) };
  const normalized = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (
    normalized.getUTCFullYear() !== parts.year ||
    normalized.getUTCMonth() !== parts.month - 1 ||
    normalized.getUTCDate() !== parts.day
  ) {
    throw new Error("Choose a valid date.");
  }
  return parts;
}

export function zonedDateInputValue(date: Date, timeZone: string) {
  const parts = zonedDateTimeParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function checkedAtEndForDate(value: string, timeZone: string) {
  const selected = parseDateInput(value);
  const nextDay = new Date(Date.UTC(selected.year, selected.month - 1, selected.day + 1));
  const boundary = localDateTimeToUtc(
    {
      day: nextDay.getUTCDate(),
      hour: 0,
      minute: 0,
      month: nextDay.getUTCMonth() + 1,
      second: 0,
      year: nextDay.getUTCFullYear(),
    },
    timeZone,
  );

  return new Date(boundary.getTime() - 1).toISOString();
}

/** Wall time conversion rejects DST gaps instead of silently changing the requested time. */
export function zonedDateTimeInputValue(date: Date, timeZone: string) {
  const p = zonedDateTimeParts(date, timeZone);
  return `${zonedDateInputValue(date, timeZone)}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}:${String(p.second).padStart(2, "0")}`;
}
export function zonedDateTimeInputToUtc(value: string, timeZone: string) {
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{3}))?)?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    );
  if (!match) throw new RangeError("Invalid local date-time");
  const p = {
    ...parseDateInput(match[1]),
    hour: Number(match[2]),
    minute: Number(match[3]),
    second: Number(match[4] ?? 0),
  };
  if (p.hour > 23 || p.minute > 59 || p.second > 59)
    throw new RangeError("Invalid local date-time");
  const instant = match[6] ? new Date(value) : localDateTimeToUtc(p, timeZone);
  if (!Number.isFinite(instant.getTime())) throw new RangeError("Invalid local date-time");
  if (
    zonedDateTimeInputValue(instant, timeZone) !==
    `${match[1]}T${match[2]}:${match[3]}:${match[4] ?? "00"}`
  )
    throw new RangeError("Invalid local date-time");
  if (match[5] && !match[6]) instant.setUTCMilliseconds(Number(match[5]));
  return instant.toISOString();
}

/** Retains the offset so reapplying a repeated DST hour preserves the exact UTC bounds. */
export function zonedDateTimeInputWithOffset(date: Date, timeZone: string) {
  const offset =
    new Intl.DateTimeFormat("en", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")
      ?.value.replace("GMT", "") || "+00:00";
  return `${zonedDateTimeInputValue(date, timeZone)}.${String(date.getUTCMilliseconds()).padStart(3, "0")}${offset}`;
}
