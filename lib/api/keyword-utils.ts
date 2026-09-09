import { normalizeSchedule } from "@/lib/actions/_schedule";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { LEGACY_DEFAULT_MARKET_NAME } from "./legacy-market-input";
import type { ApiKeywordBulk, ApiKeywordCreateItem, ApiKeywordPatch } from "./schemas";

export function keywordLocation(input: { country?: string; location?: string }) {
  return input.location ?? input.country ?? LEGACY_DEFAULT_MARKET_NAME;
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
