import type { ModelUsage } from "@/lib/model-playground/types";

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function normalizeUsage(
  value: unknown,
  options: { searchEnabled?: boolean } = {},
): ModelUsage {
  const usage = record(value) ?? {};
  const creation = record(usage.cache_creation);
  const tools = record(usage.server_tool_use);
  const details = record(usage.output_tokens_details);
  const outputTokens = count(usage.output_tokens);
  const thinking = count(details?.thinking_tokens);
  const cacheWrites = creation
    ? [
        { ttlSeconds: 300, tokens: count(creation.ephemeral_5m_input_tokens) },
        { ttlSeconds: 3600, tokens: count(creation.ephemeral_1h_input_tokens) },
      ]
    : [];
  const result: ModelUsage = {
    completeness: "partial",
    inputTokens: count(usage.input_tokens),
    outputTokens,
    reasoningTokens:
      thinking !== null && (outputTokens === null || thinking <= outputTokens) ? thinking : null,
    cacheReadInputTokens: count(usage.cache_read_input_tokens),
    cacheWriteInputTokens: count(usage.cache_creation_input_tokens),
    inputCacheAccounting: "additional",
    cacheWrites,
    searchCalls:
      count(tools?.web_search_requests) ??
      (record(value) && options.searchEnabled === false && usage.server_tool_use === undefined
        ? 0
        : null),
    searchContentTokens: null,
  };
  const measured = [
    result.inputTokens,
    outputTokens,
    result.reasoningTokens,
    result.cacheReadInputTokens,
    result.cacheWriteInputTokens,
    result.searchCalls,
    ...cacheWrites.map((write) => write.tokens),
  ];
  const known = new Set([
    "input_tokens",
    "output_tokens",
    "output_tokens_details",
    "cache_read_input_tokens",
    "cache_creation_input_tokens",
    "cache_creation",
    "server_tool_use",
    "service_tier",
    "inference_geo",
    "speed",
    "iterations",
  ]);
  const unknownDimensions =
    Object.keys(usage).some((key) => !known.has(key)) ||
    (tools &&
      Object.entries(tools).some(([key, value]) => key !== "web_search_requests" && value !== 0)) ||
    (creation &&
      Object.keys(creation).some(
        (key) => !["ephemeral_5m_input_tokens", "ephemeral_1h_input_tokens"].includes(key),
      )) ||
    (details && Object.keys(details).some((key) => key !== "thinking_tokens"));
  const ttlComplete =
    (result.cacheWriteInputTokens === 0 && !creation) ||
    (cacheWrites.length === 2 &&
      cacheWrites.every((write) => write.tokens !== null) &&
      cacheWrites.reduce((sum, write) => sum + (write.tokens ?? 0), 0) ===
        result.cacheWriteInputTokens);
  const invalidCounts =
    [
      "input_tokens",
      "output_tokens",
      "cache_read_input_tokens",
      "cache_creation_input_tokens",
    ].some((key) => usage[key] !== undefined && count(usage[key]) === null) ||
    (details?.thinking_tokens !== undefined && thinking === null) ||
    (tools?.web_search_requests !== undefined && result.searchCalls === null) ||
    ["cache_creation", "server_tool_use", "output_tokens_details"].some(
      (key) => usage[key] !== undefined && record(usage[key]) === null,
    );
  if (measured.every((quantity) => quantity === null)) {
    result.completeness = "unknown";
    result.inputCacheAccounting = "unknown";
  } else if (
    !unknownDimensions &&
    !invalidCounts &&
    ttlComplete &&
    [
      result.inputTokens,
      outputTokens,
      result.cacheReadInputTokens,
      result.cacheWriteInputTokens,
      result.searchCalls,
    ].every((v) => v !== null) &&
    (thinking === null || outputTokens === null || thinking <= outputTokens)
  )
    result.completeness = "complete";
  return result;
}
