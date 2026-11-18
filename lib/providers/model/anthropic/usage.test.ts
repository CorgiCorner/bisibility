import { modelUsageSchema } from "@/lib/model-playground/types";
import { expect, it } from "vitest";
import { forbidNetwork, usageFixture } from "./fixtures.test-support";
import { normalizeUsage } from "./usage";

forbidNetwork();

function usage(value: unknown) {
  return modelUsageSchema.parse(normalizeUsage(value));
}
it("preserves uncached input, cache read, write aggregate and TTL subsets exactly once", () => {
  expect(usage(usageFixture())).toEqual({
    completeness: "complete",
    inputTokens: 10,
    outputTokens: 15,
    reasoningTokens: 3,
    cacheReadInputTokens: 40,
    cacheWriteInputTokens: 30,
    inputCacheAccounting: "additional",
    cacheWrites: [
      { ttlSeconds: 300, tokens: 20 },
      { ttlSeconds: 3600, tokens: 10 },
    ],
    searchCalls: 0,
    searchContentTokens: null,
  });
});
it.each([
  undefined,
  null,
  {},
  { input_tokens: -1 },
  { input_tokens: "10" },
  { output_tokens: Infinity },
])("keeps absent/unusable usage unknown: %j", (value) => {
  expect(usage(value)).toMatchObject({
    completeness: "unknown",
    inputTokens: null,
    outputTokens: null,
  });
});
it("keeps explicit zero distinct from missing quantities", () => {
  expect(
    usage({
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
      server_tool_use: { web_search_requests: 0 },
    }),
  ).toMatchObject({ completeness: "complete", inputTokens: 0, outputTokens: 0, searchCalls: 0 });
  expect(usage({ input_tokens: 0, output_tokens: 0 })).toMatchObject({
    completeness: "partial",
    cacheReadInputTokens: null,
    searchCalls: null,
  });
});
it.each([
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
  "server_tool_use",
  "cache_creation",
])("does not claim complete usage with missing dimension %s", (field) => {
  const fixture = usageFixture();
  delete fixture[field];
  const result = usage(fixture);
  expect(result.completeness).toBe("partial");
  if (field !== "input_tokens") expect(result.inputTokens).toBe(10);
});
it("preserves measured TTL counts with inconsistent/absent aggregate as partial", () => {
  for (const cache_creation_input_tokens of [29, 0, undefined]) {
    const result = usage({ ...usageFixture(), cache_creation_input_tokens });
    expect(result).toMatchObject({
      completeness: "partial",
      cacheWrites: [
        { ttlSeconds: 300, tokens: 20 },
        { ttlSeconds: 3600, tokens: 10 },
      ],
    });
  }
});
it.each([
  {},
  { ephemeral_5m_input_tokens: 20 },
  { ephemeral_5m_input_tokens: -2, ephemeral_1h_input_tokens: 32 },
  { ephemeral_5m_input_tokens: 20, ephemeral_1h_input_tokens: 10, future_ttl: 5 },
])("does not guess missing or unknown TTLs: %j", (cache_creation) => {
  expect(usage({ ...usageFixture(), cache_creation })).toMatchObject({
    completeness: "partial",
    cacheWriteInputTokens: 30,
  });
});
it.each([-1, 1.5, "3", Number.MAX_SAFE_INTEGER + 1, 16])(
  "rejects unsafe reasoning subset %s",
  (thinking_tokens) => {
    expect(usage({ ...usageFixture(), output_tokens_details: { thinking_tokens } })).toMatchObject({
      completeness: "partial",
      outputTokens: 15,
      reasoningTokens: null,
    });
  },
);
it("never adds iteration subsets to top-level totals", () => {
  expect(
    usage({ ...usageFixture(), iterations: [{ input_tokens: 10, output_tokens: 15 }] }),
  ).toMatchObject({ inputTokens: 10, outputTokens: 15 });
});
it.each(["server_tool_use", "cache_creation", "output_tokens_details"])(
  "keeps malformed %s partial",
  (field) => {
    expect(usage({ ...usageFixture(), [field]: "malformed" })).toMatchObject({
      completeness: "partial",
      inputTokens: 10,
    });
  },
);
it("keeps new or unsupported charge dimensions partial and preserves known quantities", () => {
  for (const extra of [
    { future_token_charge: 1 },
    { server_tool_use: { web_search_requests: 2, web_fetch_requests: 1 } },
    { output_tokens_details: { thinking_tokens: 3, future_tokens: 1 } },
  ]) {
    expect(usage({ ...usageFixture(), ...extra })).toMatchObject({
      completeness: "partial",
      inputTokens: 10,
      outputTokens: 15,
    });
  }
});

it("uses the disabled search request to distinguish absent tool usage from unknown usage", () => {
  const observed = {
    input_tokens: 24,
    output_tokens: 4,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
    output_tokens_details: { thinking_tokens: 0 },
  };
  expect(normalizeUsage(observed, { searchEnabled: false })).toMatchObject({
    completeness: "complete",
    inputTokens: 24,
    outputTokens: 4,
    searchCalls: 0,
  });
  expect(normalizeUsage(observed, { searchEnabled: true })).toMatchObject({
    completeness: "partial",
    searchCalls: null,
  });
  expect(normalizeUsage(null, { searchEnabled: false })).toMatchObject({
    completeness: "unknown",
    searchCalls: null,
  });
  expect(
    normalizeUsage({ ...observed, server_tool_use: "invalid" }, { searchEnabled: false }),
  ).toMatchObject({ completeness: "partial", searchCalls: null });
});
