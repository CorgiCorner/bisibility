import { type ModelUsage, modelUsageSchema } from "@/lib/model-playground/types";
import { normalizeCosts } from "./costs";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Measured quantities and scoped money remain independent evidence. */
export function normalizeOpenRouterAccounting(body: unknown, search: boolean) {
  const raw = record(record(body).usage);
  const inputDetails = record(raw.prompt_tokens_details);
  const outputDetails = record(raw.completion_tokens_details);
  const inputTokens = count(raw.prompt_tokens);
  const outputTokens = count(raw.completion_tokens);
  let reasoningTokens = count(outputDetails.reasoning_tokens);
  let cacheReadInputTokens = count(inputDetails.cached_tokens);
  let cacheWriteInputTokens = count(inputDetails.cache_write_tokens);
  if (outputTokens !== null && reasoningTokens !== null && reasoningTokens > outputTokens)
    reasoningTokens = null;
  if (
    inputTokens !== null &&
    (cacheReadInputTokens ?? 0) + (cacheWriteInputTokens ?? 0) > inputTokens
  ) {
    cacheReadInputTokens = null;
    cacheWriteInputTokens = null;
  }
  const quantities = [
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadInputTokens,
    cacheWriteInputTokens,
  ];
  const usage: ModelUsage = modelUsageSchema.parse({
    completeness: quantities.every((value) => value === null)
      ? "unknown"
      : !search && quantities.every((value) => value !== null)
        ? "complete"
        : "partial",
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadInputTokens,
    cacheWriteInputTokens,
    inputCacheAccounting: inputTokens === null ? "unknown" : "included",
    cacheWrites: [],
    searchCalls: null,
    searchContentTokens: null,
  });
  const costs = record(raw.cost_details);
  return {
    usage,
    ...normalizeCosts(raw, costs, search),
  };
}
