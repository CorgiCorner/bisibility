import type { RankCheckFrequency } from "@/lib/generated/prisma/client";
import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import type { SerpDepth } from "@/lib/serp/markets";

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

export function normalizeSchedule<TDepth extends SerpDepth | null | undefined>(
  input: KeywordScheduleInput & { serpDepth?: TDepth },
  from = new Date(),
  keywordId?: string,
): StoredSchedule<TDepth> {
  const serpDepth = input.serpDepth as TDepth;
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
      !keywordId && (schedule.frequency === "daily" || schedule.frequency === "weekly")
        ? null
        : computeNextCheckAt(schedule, from, keywordId),
  };
}

export function scheduleForKeyword<TDepth extends SerpDepth | null | undefined>(
  schedule: StoredSchedule<TDepth>,
  keywordId: string,
  from = new Date(),
) {
  return {
    ...schedule,
    nextCheckAt: computeNextCheckAt(schedule, from, keywordId),
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
