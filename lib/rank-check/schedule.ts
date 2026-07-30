import { monthlyCronExpression, nextCronRun, zonedCronParts } from "./cron";
import { DAILY_INTERVAL_MS, nextStableIntervalTime, WEEKLY_INTERVAL_MS } from "./interval-phase";
import { isScheduledFrequency, type RankCheckFrequency } from "./schedule-frequency";

export {
  isScheduledFrequency,
  type RankCheckFrequency,
  SCHEDULED_FREQUENCIES,
} from "./schedule-frequency";

export type RankCheckScheduleInput = {
  frequency: RankCheckFrequency;
  cronExpression?: string | null;
  nextCheckAt?: Date | string | null;
  timezone?: string | null;
  jitterMinutes?: number | null;
};

function nextWallClockRun(from: Date, timezone: string, weekly: boolean) {
  const parts = zonedCronParts(from, timezone);
  const weekday = weekly ? parts.weekday : "*";

  // Spring-forward gaps skip to the next matching day, matching custom cron semantics.
  return nextCronRun(`${parts.minute} ${parts.hour} * * ${weekday}`, from, timezone);
}

export function computeNextCheckAt(
  schedule: RankCheckScheduleInput,
  from = new Date(),
  keywordId?: string,
) {
  if (!isScheduledFrequency(schedule.frequency)) {
    return null;
  }

  if (schedule.frequency === "daily") {
    return keywordId
      ? nextStableIntervalTime(from, keywordId, DAILY_INTERVAL_MS)
      : nextWallClockRun(from, schedule.timezone ?? "UTC", false);
  }

  if (schedule.frequency === "weekly") {
    return keywordId
      ? nextStableIntervalTime(from, keywordId, WEEKLY_INTERVAL_MS)
      : nextWallClockRun(from, schedule.timezone ?? "UTC", true);
  }

  if (schedule.frequency === "monthly") {
    const timezone = schedule.timezone ?? "UTC";
    const anchor = schedule.nextCheckAt ?? from;
    return nextCronRun(monthlyCronExpression(anchor, timezone), from, timezone);
  }

  if (!schedule.cronExpression) {
    throw new Error("Custom cron schedules require cronExpression.");
  }

  return nextCronRun(schedule.cronExpression, from, schedule.timezone ?? "UTC");
}
