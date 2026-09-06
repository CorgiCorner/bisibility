import { nextCronRun } from "@/lib/rank-check/cron";
import { deterministicJitterSeconds } from "@/lib/rank-check/dispatcher-recurrence";
import {
  DAILY_INTERVAL_MS,
  stableIntervalPhaseMs,
  WEEKLY_INTERVAL_MS,
} from "@/lib/rank-check/interval-phase";

const MONTHLY_PHASE_DAYS = 28;
const HORIZON_MS = 7 * DAILY_INTERVAL_MS;

export type PlannerScheduleCadence = {
  cronExpression: string | null;
  frequency: "paused" | "manual" | "daily" | "weekly" | "monthly" | "custom_cron";
  jitterMinutes: number;
  publicId: string;
  timeOfDay: string | null;
  timezone: string;
};

export type PlannedOccurrence = {
  intervalMs: number;
  occurrenceKey: string;
  plannedFor: Date;
};

export function selectionOccurrenceKey(selectionSpec: unknown) {
  if (typeof selectionSpec !== "object" || selectionSpec === null || Array.isArray(selectionSpec)) {
    return null;
  }
  const value = (selectionSpec as Record<string, unknown>).occurrenceKey;
  return typeof value === "string" ? value : null;
}

type LocalDate = { day: number; month: number; year: number };

function localDate(date: Date, timezone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return { day: value("day"), month: value("month"), year: value("year") };
}

function dateKey(parts: LocalDate) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function addLocalDays(parts: LocalDate, days: number): LocalDate {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1, year: date.getUTCFullYear() };
}

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  return {
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    month: value("month"),
    second: value("second"),
    year: value("year"),
  };
}

function localInstant(parts: LocalDate, timeOfDay: string | null, timezone: string) {
  const [hour, minute] = (timeOfDay ?? "00:00").split(":").map(Number);
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, 0);
  let instant = target;
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const actual = zonedParts(new Date(instant), timezone);
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = target - actualUtc;
    if (correction === 0) break;
    instant += correction;
  }
  return new Date(instant);
}

function weeklyDay(scheduleId: string) {
  const phaseDays = Math.floor(
    stableIntervalPhaseMs(scheduleId, WEEKLY_INTERVAL_MS) / DAILY_INTERVAL_MS,
  );
  return (4 + phaseDays) % 7;
}

function monthlyDay(scheduleId: string) {
  return (
    Math.floor(
      stableIntervalPhaseMs(scheduleId, MONTHLY_PHASE_DAYS * DAILY_INTERVAL_MS) / DAILY_INTERVAL_MS,
    ) + 1
  );
}

function cadenceDay(schedule: PlannerScheduleCadence, parts: LocalDate) {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (schedule.frequency === "daily") return true;
  if (schedule.frequency === "weekly") return utc.getUTCDay() === weeklyDay(schedule.publicId);
  if (schedule.frequency === "monthly") return parts.day === monthlyDay(schedule.publicId);
  return false;
}

function calendarOccurrences(schedule: PlannerScheduleCadence, now: Date, horizon: Date) {
  const firstDay = localDate(now, schedule.timezone);
  const occurrences: PlannedOccurrence[] = [];
  for (let offset = 0; offset <= 38; offset += 1) {
    const parts = addLocalDays(firstDay, offset);
    if (!cadenceDay(schedule, parts)) continue;
    const plannedFor = localInstant(parts, schedule.timeOfDay, schedule.timezone);
    const intervalMs =
      schedule.frequency === "daily"
        ? DAILY_INTERVAL_MS
        : schedule.frequency === "weekly"
          ? WEEKLY_INTERVAL_MS
          : localInstant(
              { ...parts, month: parts.month + 1 },
              schedule.timeOfDay,
              schedule.timezone,
            ).getTime() - plannedFor.getTime();
    const intervalOpen = plannedFor.getTime() + intervalMs > now.getTime();
    if (!intervalOpen || plannedFor > horizon) continue;
    occurrences.push({ intervalMs, occurrenceKey: dateKey(parts), plannedFor });
  }
  return occurrences;
}

function customOccurrences(schedule: PlannerScheduleCadence, now: Date, horizon: Date) {
  if (!schedule.cronExpression) return [];
  const occurrences: PlannedOccurrence[] = [];
  let cursor = new Date(now.getTime() - 1);
  while (true) {
    const plannedFor = nextCronRun(schedule.cronExpression, cursor, schedule.timezone);
    if (plannedFor > horizon) break;
    const next = nextCronRun(schedule.cronExpression, plannedFor, schedule.timezone);
    occurrences.push({
      intervalMs: next.getTime() - plannedFor.getTime(),
      occurrenceKey: plannedFor.toISOString(),
      plannedFor,
    });
    cursor = plannedFor;
  }
  return occurrences;
}

function usesCronOccurrences(schedule: PlannerScheduleCadence) {
  return (
    schedule.frequency === "custom_cron" ||
    ((schedule.frequency === "weekly" || schedule.frequency === "monthly") &&
      schedule.cronExpression !== null)
  );
}

export function plannedOccurrences(
  schedule: PlannerScheduleCadence,
  now: Date,
  horizon = new Date(now.getTime() + HORIZON_MS),
) {
  if (schedule.frequency === "paused" || schedule.frequency === "manual") return [];
  if (usesCronOccurrences(schedule)) return customOccurrences(schedule, now, horizon);
  return calendarOccurrences(schedule, now, horizon);
}

export function plannedOccurrenceForKey(
  schedule: PlannerScheduleCadence,
  occurrenceKey: string,
): PlannedOccurrence | null {
  if (usesCronOccurrences(schedule)) {
    const plannedFor = new Date(occurrenceKey);
    if (!schedule.cronExpression || Number.isNaN(plannedFor.getTime())) return null;
    const previous = new Date(plannedFor.getTime() - 60_001);
    if (
      nextCronRun(schedule.cronExpression, previous, schedule.timezone).getTime() !==
      plannedFor.getTime()
    )
      return null;
    const next = nextCronRun(schedule.cronExpression, plannedFor, schedule.timezone);
    return { intervalMs: next.getTime() - plannedFor.getTime(), occurrenceKey, plannedFor };
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(occurrenceKey);
  if (!match) return null;
  const parts = { day: Number(match[3]), month: Number(match[2]), year: Number(match[1]) };
  if (!cadenceDay(schedule, parts)) return null;
  const plannedFor = localInstant(parts, schedule.timeOfDay, schedule.timezone);
  const intervalMs =
    schedule.frequency === "daily"
      ? DAILY_INTERVAL_MS
      : schedule.frequency === "weekly"
        ? WEEKLY_INTERVAL_MS
        : localInstant(
            { ...parts, month: parts.month + 1 },
            schedule.timeOfDay,
            schedule.timezone,
          ).getTime() - plannedFor.getTime();
  return { intervalMs, occurrenceKey, plannedFor };
}

export function itemNotBefore(
  occurrence: PlannedOccurrence,
  schedule: Pick<PlannerScheduleCadence, "jitterMinutes" | "timeOfDay">,
  keywordId: string,
  now: Date,
) {
  const phaseMs =
    schedule.timeOfDay === null ? stableIntervalPhaseMs(keywordId, occurrence.intervalMs) : 0;
  const jitterMs = deterministicJitterSeconds(keywordId, schedule.jitterMinutes) * 1_000;
  const slotOffsetMs = (phaseMs + jitterMs) % occurrence.intervalMs;
  return new Date(Math.max(now.getTime(), occurrence.plannedFor.getTime() + slotOffsetMs));
}
