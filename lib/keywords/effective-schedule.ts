import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { isScheduledFrequency, SCHEDULED_FREQUENCIES } from "@/lib/rank-check/schedule-frequency";

export { SCHEDULED_FREQUENCIES };

export type ScheduleInput = {
  cronExpression?: string | null;
  frequency: string;
  jitterMinutes?: number | null;
  nextCheckAt?: Date | string | null;
  next_check_at?: Date | string | null;
  timezone?: string | null;
};

export type EffectiveSchedule = {
  frequency: string;
  nextCheckAt: Date | null;
  runnable: boolean;
};

const frequencyLabels: Record<string, string> = {
  custom_cron: "Custom cron",
  daily: "Daily",
  manual: "Manual",
  monthly: "Monthly",
  paused: "Paused",
  weekly: "Weekly",
};

function dateFor(value: Date | string | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function resolveEffectiveSchedule(
  override: ScheduleInput | null | undefined,
  defaults?: ScheduleInput | null,
  keywordId?: string,
  from = new Date(),
): EffectiveSchedule {
  const schedule = override ?? defaults;
  const frequency = schedule?.frequency ?? "manual";
  if (!schedule || !isScheduledFrequency(frequency)) {
    return { frequency, nextCheckAt: null, runnable: false };
  }
  const persisted = dateFor(schedule.nextCheckAt ?? schedule.next_check_at);
  const interval = frequency === "daily" || frequency === "weekly";
  const computed = () =>
    computeNextCheckAt(
      {
        cronExpression: schedule.cronExpression,
        frequency,
        jitterMinutes: schedule.jitterMinutes,
        timezone: schedule.timezone,
      },
      from,
      keywordId,
    );
  const nextCheckAt = interval
    ? keywordId
      ? computed()
      : override
        ? persisted
        : null
    : (persisted ?? computed());
  return { frequency, nextCheckAt, runnable: nextCheckAt !== null };
}

export function effectiveScheduleLabel(frequency: string) {
  return frequencyLabels[frequency] ?? "Scheduled";
}

export function summarizeEffectiveSchedules(schedules: EffectiveSchedule[]) {
  const source = schedules.length
    ? schedules
    : [resolveEffectiveSchedule(null, { frequency: "manual", nextCheckAt: null })];
  const frequencies = new Set(source.map((schedule) => schedule.frequency));
  const refresh =
    frequencies.size === 1
      ? effectiveScheduleLabel(source[0]?.frequency ?? "manual")
      : "Mixed schedules";
  const nextCheckAt =
    source
      .flatMap((schedule) => (schedule.nextCheckAt ? [schedule.nextCheckAt] : []))
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return { nextCheckAt, refresh };
}
