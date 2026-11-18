import { type ModelUsage, modelUsageSchema } from "@/lib/model-playground/types";
import { z } from "zod";
import { nativeCount } from "./native-schema";

const optionalCount = nativeCount.nullish();
const nativeUsage = z
  .object({
    input_tokens: optionalCount,
    output_tokens: optionalCount,
    total_tokens: optionalCount,
    input_tokens_details: z
      .object({
        cached_tokens: optionalCount,
        cache_write_tokens: optionalCount,
        cache_write_tokens_details: z
          .object({
            ttl_12h_tokens: optionalCount,
            ttl_30m_tokens: optionalCount,
          })
          .nullish(),
      })
      .nullish(),
    output_tokens_details: z.object({ reasoning_tokens: optionalCount }).nullish(),
  })
  .nullish();
const toolUsage = z
  .object({
    web_search: z.object({ num_requests: optionalCount }).nullish(),
  })
  .nullish();

/** Counts are evidence only. No prices or inferred search charges are calculated here. */
export function normalizeUsage(raw: unknown, tools: unknown, searchEnabled = false): ModelUsage {
  const usage = nativeUsage.parse(raw);
  const tool = toolUsage.parse(tools);
  const inputTokens = usage?.input_tokens ?? null;
  const outputTokens = usage?.output_tokens ?? null;
  const cached = usage?.input_tokens_details?.cached_tokens ?? null;
  const writes = usage?.input_tokens_details?.cache_write_tokens ?? null;
  const reasoning = usage?.output_tokens_details?.reasoning_tokens ?? null;
  const searchCalls = tool?.web_search?.num_requests ?? null;
  const ttl = usage?.input_tokens_details?.cache_write_tokens_details;
  const cacheWrites = [
    { ttlSeconds: 43200, tokens: ttl?.ttl_12h_tokens ?? null },
    { ttlSeconds: 1800, tokens: ttl?.ttl_30m_tokens ?? null },
  ].filter((entry) => entry.tokens !== null);
  if (
    usage?.total_tokens != null &&
    inputTokens !== null &&
    outputTokens !== null &&
    usage.total_tokens !== inputTokens + outputTokens
  )
    throw new Error();
  if (
    writes !== null &&
    cacheWrites.length === 2 &&
    cacheWrites.reduce((sum, entry) => sum + (entry.tokens ?? 0), 0) !== writes
  )
    throw new Error();
  if (writes !== null && cacheWrites.reduce((sum, entry) => sum + (entry.tokens ?? 0), 0) > writes)
    throw new Error();
  const quantities = [
    inputTokens,
    outputTokens,
    cached,
    writes,
    reasoning,
    searchCalls,
    ...cacheWrites.map((entry) => entry.tokens),
  ];
  const complete =
    !searchEnabled &&
    (searchCalls === null || searchCalls === 0) &&
    [inputTokens, outputTokens, cached, writes, reasoning].every((n) => n !== null);
  return modelUsageSchema.parse({
    completeness: quantities.every((n) => n === null)
      ? "unknown"
      : complete
        ? "complete"
        : "partial",
    inputTokens,
    outputTokens,
    reasoningTokens: reasoning,
    cacheReadInputTokens: cached,
    cacheWriteInputTokens: writes,
    inputCacheAccounting:
      inputTokens !== null || cached !== null || writes !== null ? "included" : "unknown",
    cacheWrites,
    searchCalls,
    searchContentTokens: null,
  });
}
