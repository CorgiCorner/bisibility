export type CronField = ReadonlySet<number> | null;

export type ParsedCronExpression =
  | {
      ok: true;
      minute: CronField;
      hour: CronField;
      day: CronField;
      month: CronField;
      weekday: CronField;
    }
  | { ok: false };

type CronSchedule = Extract<ParsedCronExpression, { ok: true }>;

const MAX_CRON_MINUTES = 366 * 24 * 60;
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();

function nextWholeMinute(from: Date) {
  const next = new Date(from);
  next.setUTCSeconds(0, 0);

  if (next <= from) {
    next.setUTCMinutes(next.getUTCMinutes() + 1);
  }

  return next;
}

function rangeValues(start: number, end: number, step: number) {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
    throw new TypeError("Invalid cron range.");
  }

  const values: number[] = [];
  for (let value = start; value <= end; value += step) {
    values.push(value);
  }

  return values;
}

function parseToken(token: string, min: number, max: number) {
  const [range, stepRaw] = token.split("/");
  const step = stepRaw ? Number.parseInt(stepRaw, 10) : 1;

  if (!Number.isInteger(step) || step < 1) {
    throw new TypeError(`Invalid cron step: ${token}`);
  }

  if (range === "*") {
    return rangeValues(min, max, step);
  }

  if (range.includes("-")) {
    const [start, end] = range.split("-").map((value) => Number.parseInt(value, 10));
    return rangeValues(start, end, step);
  }

  const value = Number.parseInt(range, 10);
  if (!Number.isInteger(value)) {
    throw new TypeError(`Invalid cron value: ${token}`);
  }

  return [value];
}

function parseField(
  field: string,
  min: number,
  max: number,
  normalize?: (value: number) => number,
): CronField {
  if (field === "*") {
    return null;
  }

  const values = field
    .split(",")
    .flatMap((token) => parseToken(token.trim(), min, max))
    .map((value) => normalize?.(value) ?? value);

  if (values.some((value) => value < min || value > max)) {
    throw new Error(`Cron field is outside ${min}-${max}.`);
  }

  return new Set(values);
}

function parseCronOrThrow(expression: string): CronSchedule {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Cron expression must contain exactly 5 fields.");
  }

  return {
    day: parseField(parts[2], 1, 31),
    hour: parseField(parts[1], 0, 23),
    minute: parseField(parts[0], 0, 59),
    month: parseField(parts[3], 1, 12),
    ok: true,
    weekday: parseField(parts[4], 0, 7, (value) => (value === 7 ? 0 : value)),
  };
}

export function parseCronExpression(expression: string): ParsedCronExpression {
  try {
    return parseCronOrThrow(expression);
  } catch {
    return { ok: false };
  }
}

export function zonedCronParts(date: Date, timezone: string) {
  let formatter = zonedFormatters.get(timezone);
  if (!formatter) {
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

  return {
    day,
    hour: value("hour"),
    minute: value("minute"),
    month,
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

function matchesField(field: CronField, value: number) {
  return field === null || field.has(value);
}

function matchesCron(schedule: CronSchedule, date: Date, timezone: string) {
  const parts = zonedCronParts(date, timezone);

  return (
    matchesField(schedule.minute, parts.minute) &&
    matchesField(schedule.hour, parts.hour) &&
    matchesField(schedule.day, parts.day) &&
    matchesField(schedule.month, parts.month) &&
    matchesField(schedule.weekday, parts.weekday)
  );
}

export function nextCronRun(expression: string, from: Date, timezone: string) {
  const cron = parseCronOrThrow(expression);
  let cursor = nextWholeMinute(from);

  for (let checked = 0; checked < MAX_CRON_MINUTES; checked += 1) {
    if (matchesCron(cron, cursor, timezone)) {
      return cursor;
    }

    cursor = new Date(cursor.getTime() + 60_000);
  }

  throw new Error("Cron expression did not match within one year.");
}

export function monthlyCronExpression(anchor: Date | string, timezone: string) {
  const date = anchor instanceof Date ? anchor : new Date(anchor);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Monthly schedules require a valid nextCheckAt.");
  }
  const parts = zonedCronParts(date, timezone);
  return `${parts.minute} ${parts.hour} ${Math.min(parts.day, 28)} * *`;
}
