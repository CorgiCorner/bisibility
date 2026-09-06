import { parseCronExpression } from "@/lib/rank-check/cron";
import type { RankCheckFrequency } from "@/lib/settings/options";

type ScheduleCadenceInput = {
  cronExpression?: string | null;
  dayOfMonth?: string | null;
  frequency: RankCheckFrequency;
  timeOfDay?: string | null;
  weekday?: string | null;
};

function onlyValue(field: ReadonlySet<number> | null) {
  return field?.size === 1 ? [...field][0] : null;
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
  frequency: RankCheckFrequency,
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
      weekday:
        weekday === null
          ? null
          : (["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][
              weekday
            ] ?? null),
    };
  }

  const day = onlyValue(parsed.day);
  return { dayOfMonth: day === null ? null : ordinalDayOfMonth(day), weekday: null };
}

export function scheduleCadenceLabel(schedule: ScheduleCadenceInput) {
  if (schedule.timeOfDay == null && ["daily", "weekly", "monthly"].includes(schedule.frequency)) {
    const interval =
      schedule.frequency === "daily" ? "day" : schedule.frequency === "weekly" ? "week" : "month";
    return `Every ${interval} · no fixed time`;
  }
  const calendar = persistedScheduleCalendar(schedule.frequency, schedule.cronExpression);
  const time = schedule.timeOfDay ?? "-";
  if (schedule.frequency === "daily") return `Daily, ${time}`;
  if (schedule.frequency === "weekly") {
    const weekday = schedule.weekday ?? calendar.weekday;
    return `${weekday ? `${weekday}s` : "Weekly"}, ${time}`;
  }
  if (schedule.frequency === "monthly") {
    const dayOfMonth = schedule.dayOfMonth ?? calendar.dayOfMonth;
    return `Monthly on the ${dayOfMonth ?? "-"}, ${time}`;
  }
  if (schedule.frequency === "custom_cron") {
    return `Custom - ${schedule.cronExpression ?? "-"}`;
  }
  return schedule.frequency === "manual" ? "Manual" : "Paused";
}
