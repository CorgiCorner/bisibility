import { parseCronExpression } from "@/lib/rank-check/cron";
import type { RankCheckFrequency } from "@/lib/settings/options";

type ScheduleCadenceInput = {
  cronExpression?: string | null;
  dayOfMonth?: string | null;
  frequency: RankCheckFrequency | string;
  timeOfDay?: string | null;
  weekday?: string | null;
};

export type ScheduleCadenceLabels = {
  custom: (expression: string) => string;
  daily: (time: string) => string;
  every: (interval: "day" | "month" | "week") => string;
  manual: () => string;
  monthly: (day: string, time: string) => string;
  paused: () => string;
  weekly: (day: string, time: string) => string;
  weekday: (day: (typeof scheduleWeekdayNames)[number]) => string;
};

export const scheduleWeekdayNames = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function onlyValue(field: ReadonlySet<number> | null) {
  return field?.size === 1 ? [...field][0] : null;
}

function isScheduleWeekdayName(value: string): value is (typeof scheduleWeekdayNames)[number] {
  return scheduleWeekdayNames.some((weekday) => weekday === value);
}

export function ordinalDayOfMonth(value: number) {
  const suffix =
    value % 10 === 1 && value % 100 !== 11
      ? "st"
      : value % 10 === 2 && value % 100 !== 12
        ? "nd"
        : value % 10 === 3 && value % 100 !== 13
          ? "rd"
          : "th";
  return `${value}${suffix}`;
}

export function persistedScheduleCalendar(
  frequency: RankCheckFrequency | string,
  cronExpression: string | null | undefined,
) {
  if (!cronExpression || (frequency !== "weekly" && frequency !== "monthly")) {
    return { dayOfMonth: null, weekday: null };
  }

  const parsed = parseCronExpression(cronExpression);
  if (!parsed.ok) return { dayOfMonth: null, weekday: null };
  if (frequency === "weekly") {
    const weekday = onlyValue(parsed.weekday);
    return {
      dayOfMonth: null,
      weekday: weekday === null ? null : (scheduleWeekdayNames[weekday] ?? null),
    };
  }

  const day = onlyValue(parsed.day);
  return { dayOfMonth: day === null ? null : ordinalDayOfMonth(day), weekday: null };
}

export function scheduleCadenceLabel(
  schedule: ScheduleCadenceInput,
  labels: ScheduleCadenceLabels,
) {
  if (schedule.timeOfDay == null && ["daily", "weekly", "monthly"].includes(schedule.frequency)) {
    const interval =
      schedule.frequency === "daily" ? "day" : schedule.frequency === "weekly" ? "week" : "month";
    return labels.every(interval);
  }
  const calendar = persistedScheduleCalendar(schedule.frequency, schedule.cronExpression);
  const time = schedule.timeOfDay ?? "-";
  if (schedule.frequency === "daily") return labels.daily(time);
  if (schedule.frequency === "weekly") {
    const weekday = schedule.weekday ?? calendar.weekday;
    return labels.weekly(
      weekday && isScheduleWeekdayName(weekday) ? labels.weekday(weekday) : "",
      time,
    );
  }
  if (schedule.frequency === "monthly") {
    const dayOfMonth = schedule.dayOfMonth ?? calendar.dayOfMonth;
    return labels.monthly(dayOfMonth ?? "-", time);
  }
  if (schedule.frequency === "custom_cron") {
    return labels.custom(schedule.cronExpression ?? "-");
  }
  return schedule.frequency === "manual" ? labels.manual() : labels.paused();
}
