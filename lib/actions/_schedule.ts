import type { RankCheckFrequency } from "@/lib/generated/prisma/client";
import { nextThreeCronRuns } from "@/lib/rank-check/dispatcher-recurrence";
import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import type { SerpDepth } from "@/lib/serp/markets";
import { isSupportedTimezone } from "@/lib/settings/timezones";

const MIN_CUSTOM_CRON_CADENCE_MS = 60 * 60 * 1_000;

export type StoredSchedule<
  TDepth extends SerpDepth | null | undefined = SerpDepth | null | undefined,
> = {
  cronExpression: string | null;
  frequency: RankCheckFrequency;
  jitterMinutes: number;
  nextCheckAt: Date | null;
  serpDepth: TDepth;
  timezone: string;
};

function validatedCustomCronRuns(
  input: Pick<KeywordScheduleInput, "cronExpression" | "frequency" | "timezone">,
  from: Date,
) {
  if (input.frequency !== "custom_cron") return null;
  if (!isSupportedTimezone(input.timezone)) {
    throw new Error("Custom cron schedules require a valid time zone.");
  }
  if (!input.cronExpression) {
    throw new Error("Custom cron schedules require a cron expression.");
  }

  let runs: ReturnType<typeof nextThreeCronRuns>;
  try {
    runs = nextThreeCronRuns({
      cronExpression: input.cronExpression,
      from,
      timezone: input.timezone,
    });
  } catch {
    throw new Error("Custom cron schedules require a valid cron expression.");
  }

  for (let index = 1; index < runs.length; index += 1) {
    if (runs[index].getTime() - runs[index - 1].getTime() < MIN_CUSTOM_CRON_CADENCE_MS) {
      throw new Error("Custom cron schedules must run at least one hour apart.");
    }
  }

  return runs;
}

export function normalizeSchedule<TDepth extends SerpDepth | null | undefined>(
  input: KeywordScheduleInput & { serpDepth?: TDepth },
  from = new Date(),
  keywordId?: string,
): StoredSchedule<TDepth> {
  const serpDepth = input.serpDepth as TDepth;
  const customCronRuns = validatedCustomCronRuns(input, from);
  const schedule = {
    cronExpression: input.frequency === "custom_cron" ? input.cronExpression : null,
    frequency: input.frequency,
    jitterMinutes: input.jitterMinutes,
    serpDepth,
    timezone: input.timezone,
  };

  return {
    ...schedule,
    nextCheckAt:
      customCronRuns?.[0] ??
      (!keywordId && (schedule.frequency === "daily" || schedule.frequency === "weekly")
        ? null
        : computeNextCheckAt(schedule, from, keywordId)),
  };
}

export function scheduleForKeyword<TDepth extends SerpDepth | null | undefined>(
  schedule: StoredSchedule<TDepth>,
  keywordId: string,
  from = new Date(),
) {
  const customCronRuns = validatedCustomCronRuns(schedule, from);

  return {
    ...schedule,
    nextCheckAt: customCronRuns?.[0] ?? computeNextCheckAt(schedule, from, keywordId),
  };
}

export function storedScheduleInput(schedule: {
  cronExpression: string | null;
  frequency: RankCheckFrequency;
  jitterMinutes: number;
  serpDepth?: SerpDepth | null;
  timezone: string;
}) {
  return {
    cronExpression: schedule.cronExpression,
    frequency: schedule.frequency,
    jitterMinutes: schedule.jitterMinutes,
    serpDepth: schedule.serpDepth,
    timezone: schedule.timezone,
  };
}
