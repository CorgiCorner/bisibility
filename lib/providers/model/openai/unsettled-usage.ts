import { z } from "zod";
import { nativeCount } from "./native-schema";
import { normalizeUsage } from "./usage";

const record = z.record(z.string(), z.unknown());
const fields = (value: unknown) => record.safeParse(value).data ?? {};
const count = (value: unknown) => nativeCount.safeParse(value).data ?? null;

/** Keep independently measured quantities; contradictory dimensions remain unknown. */
export function unsettledUsage(raw: unknown, tools: unknown, searchEnabled: boolean) {
  const usage = fields(raw);
  const input = fields(usage.input_tokens_details);
  const ttl = fields(input.cache_write_tokens_details);
  let inputTokens = count(usage.input_tokens);
  let outputTokens = count(usage.output_tokens);
  const total = count(usage.total_tokens);
  let cached = count(input.cached_tokens);
  let writes = count(input.cache_write_tokens);
  let reasoning = count(fields(usage.output_tokens_details).reasoning_tokens);
  let longTtl = count(ttl.ttl_12h_tokens);
  let shortTtl = count(ttl.ttl_30m_tokens);
  if (inputTokens !== null) {
    if (cached !== null && cached > inputTokens) cached = null;
    if (writes !== null && writes > inputTokens) writes = null;
    if ((cached ?? 0) + (writes ?? 0) > inputTokens) cached = writes = null;
  }
  if (outputTokens !== null && reasoning !== null && reasoning > outputTokens) reasoning = null;
  if (writes === null) longTtl = shortTtl = null;
  else {
    if (longTtl !== null && longTtl > writes) longTtl = null;
    if (shortTtl !== null && shortTtl > writes) shortTtl = null;
    const sum = (longTtl ?? 0) + (shortTtl ?? 0);
    if (sum > writes || (longTtl !== null && shortTtl !== null && sum !== writes))
      longTtl = shortTtl = null;
  }
  if (
    total !== null &&
    inputTokens !== null &&
    outputTokens !== null &&
    total !== inputTokens + outputTokens
  )
    inputTokens = outputTokens = null;
  const normalized = normalizeUsage(
    {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_tokens_details: {
        cached_tokens: cached,
        cache_write_tokens: writes,
        cache_write_tokens_details: { ttl_12h_tokens: longTtl, ttl_30m_tokens: shortTtl },
      },
      output_tokens_details: { reasoning_tokens: reasoning },
    },
    { web_search: { num_requests: count(fields(fields(tools).web_search).num_requests) } },
    searchEnabled,
  );
  return {
    ...normalized,
    completeness: normalized.completeness === "complete" ? "partial" : normalized.completeness,
  };
}
