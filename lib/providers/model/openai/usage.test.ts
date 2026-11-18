import { modelMoneySchema, modelUsageSchema } from "@/lib/model-playground/types";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { plainFixture } from "./adapter.test-support";
import { normalizeUsage } from "./usage";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));

beforeEach(() => {
  interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

describe("native usage evidence independent of money", () => {
  it("does not add reasoning and cached subsets to token totals", () => {
    const raw = { ...plainFixture().usage, output_tokens_details: { reasoning_tokens: 10 } };
    const result = normalizeUsage(raw, undefined);
    expect(result).toMatchObject({
      completeness: "complete",
      inputTokens: 100,
      outputTokens: 40,
      reasoningTokens: 10,
      cacheReadInputTokens: 20,
      cacheWriteInputTokens: 0,
      inputCacheAccounting: "included",
      searchCalls: null,
      searchContentTokens: null,
    });
    expect(modelUsageSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
    expect(
      modelMoneySchema.parse({
        amount: null,
        currency: "USD",
        certainty: "unknown",
        basis: "unknown",
        rateCardVersion: null,
      }).amount,
    ).toBeNull();
  });

  it("maps cache writes and documented TTL subsets without summing them twice", () => {
    const usage = {
      ...plainFixture().usage,
      input_tokens_details: {
        cached_tokens: 20,
        cache_write_tokens: 30,
        cache_write_tokens_details: { ttl_12h_tokens: 10, ttl_30m_tokens: 20 },
      },
    };
    expect(normalizeUsage(usage, undefined)).toMatchObject({
      inputTokens: 100,
      cacheWriteInputTokens: 30,
      cacheWrites: [
        { ttlSeconds: 43200, tokens: 10 },
        { ttlSeconds: 1800, tokens: 20 },
      ],
    });
  });

  it.each([null, undefined, {}])("leaves absent usage unknown: %j", (raw) => {
    expect(normalizeUsage(raw, undefined)).toMatchObject({
      completeness: "unknown",
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      cacheReadInputTokens: null,
      cacheWriteInputTokens: null,
      searchCalls: null,
    });
  });

  it.each([{ input_tokens: 1 }, { output_tokens: 1 }, { input_tokens: 0, output_tokens: 0 }])(
    "preserves partial/explicit zero native usage: %j",
    (raw) => {
      expect(normalizeUsage(raw, undefined)).toMatchObject({
        completeness: "partial",
        inputTokens: raw.input_tokens ?? null,
        outputTokens: raw.output_tokens ?? null,
        reasoningTokens: null,
        cacheReadInputTokens: null,
      });
    },
  );

  it("uses only documented billable num_requests, never the output item count", () => {
    expect(normalizeUsage(undefined, { web_search: { num_requests: 0 } })).toMatchObject({
      completeness: "partial",
      searchCalls: 0,
      searchContentTokens: null,
    });
    expect(normalizeUsage(undefined, undefined).searchCalls).toBeNull();
    expect(normalizeUsage(plainFixture().usage, {}, true)).toMatchObject({
      completeness: "partial",
      searchCalls: null,
    });
    expect(normalizeUsage(plainFixture().usage, { web_search: {} }, true)).toMatchObject({
      completeness: "partial",
      searchCalls: null,
    });
  });

  it.each([
    { searchEnabled: false, searchCalls: 1, completeness: "partial" },
    { searchEnabled: true, searchCalls: 1, completeness: "partial" },
    { searchEnabled: false, searchCalls: 0, completeness: "complete" },
    { searchEnabled: true, searchCalls: 0, completeness: "partial" },
  ])("derives search completeness from requested and returned evidence: %j", (testCase) => {
    expect(
      normalizeUsage(
        plainFixture().usage,
        { web_search: { num_requests: testCase.searchCalls } },
        testCase.searchEnabled,
      ),
    ).toMatchObject({
      completeness: testCase.completeness,
      inputTokens: 100,
      outputTokens: 40,
      searchCalls: testCase.searchCalls,
      searchContentTokens: null,
    });
  });

  it.each([
    { input_tokens: -1 },
    { output_tokens: 1.5 },
    { input_tokens: "100" },
    { input_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...plainFixture().usage, total_tokens: 999 },
    { ...plainFixture().usage, output_tokens_details: { reasoning_tokens: 41 } },
    { ...plainFixture().usage, input_tokens_details: { cached_tokens: 101 } },
    {
      ...plainFixture().usage,
      input_tokens_details: { cached_tokens: 80, cache_write_tokens: 30 },
    },
    {
      ...plainFixture().usage,
      input_tokens_details: {
        cache_write_tokens: 1,
        cache_write_tokens_details: { ttl_12h_tokens: 2 },
      },
    },
    {
      ...plainFixture().usage,
      input_tokens_details: {
        cache_write_tokens: 30,
        cache_write_tokens_details: { ttl_12h_tokens: 1, ttl_30m_tokens: 1 },
      },
    },
  ])("rejects contradictory or malformed quantities: %j", (raw) => {
    expect(() => normalizeUsage(raw, undefined)).toThrow();
  });
});
