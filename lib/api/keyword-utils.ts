import { normalizeSchedule } from "@/lib/actions/_schedule";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { DEFAULT_SERP_MARKET } from "@/lib/serp/markets";
import type { ApiKeywordBulk, ApiKeywordCreateItem, ApiKeywordPatch } from "./schemas";

export function keywordLocation(input: { country?: string; location?: string }) {
  return input.location ?? input.country ?? DEFAULT_SERP_MARKET;
}

export function scheduleFromCreate(input: ApiKeywordCreateItem) {
  return input.schedule ? normalizeSchedule(input.schedule) : null;
}

export function scheduleFromPatch(input: ApiKeywordPatch, keywordId?: string) {
  if (input.schedule) {
    return normalizeSchedule(input.schedule, new Date(), keywordId);
  }
  if (!input.frequency) {
    return null;
  }

  return normalizeSchedule(
    {
      cronExpression: null,
      frequency: input.frequency,
      jitterMinutes: 60,
      timezone: "UTC",
    } satisfies KeywordScheduleInput,
    new Date(),
    keywordId,
  );
}

export const scheduleFromBulk = (input: ApiKeywordBulk, keywordId: string) =>
  scheduleFromPatch(input, keywordId);
