import { normalizeSchedule } from "@/lib/actions/_schedule";
import type { KeywordScheduleInput } from "@/lib/schemas/keyword";
import { ApiInputError } from "./errors";
import { LEGACY_DEFAULT_MARKET_NAME } from "./legacy-market-input";
import type { ApiKeywordBulk, ApiKeywordCreateItem, ApiKeywordPatch } from "./schemas";

export function keywordLocation(input: { country?: string; location?: string }) {
  return input.location ?? input.country ?? LEGACY_DEFAULT_MARKET_NAME;
}

export function scheduleFromCreate(input: ApiKeywordCreateItem) {
  return scheduleFromPatch(input);
}

export function scheduleFromPatch(input: ApiKeywordPatch, keywordId?: string) {
  if (input.schedule) {
    return normalizeApiSchedule(input.schedule, keywordId);
  }
  if (!input.frequency) {
    return null;
  }

  return {
    ...normalizeApiSchedule(
      {
        cronExpression: null,
        frequency: input.frequency,
        jitterMinutes: 60,
        timezone: "UTC",
      } satisfies KeywordScheduleInput,
      keywordId,
    ),
  };
}

function normalizeApiSchedule(input: KeywordScheduleInput, keywordId?: string) {
  try {
    return normalizeSchedule(input, new Date(), keywordId);
  } catch (error) {
    throw new ApiInputError(error instanceof Error ? error.message : "Invalid keyword schedule.");
  }
}

export const scheduleFromBulk = (input: ApiKeywordBulk, keywordId: string) =>
  scheduleFromPatch(input, keywordId);

export const scheduleSource = (input: ApiKeywordPatch): "frequency" | "schedule" =>
  input.schedule ? "schedule" : "frequency";

/** `schedule_id` replaces the deprecated cadence fields, so a request may not send both. */
export function assertSingleScheduleInput(input: {
  frequency?: unknown;
  schedule?: unknown;
  schedule_id?: unknown;
}) {
  if (
    input.schedule_id !== undefined &&
    (input.frequency !== undefined || input.schedule !== undefined)
  )
    throw new ApiInputError("Send schedule_id or the deprecated schedule and frequency, not both.");
}
