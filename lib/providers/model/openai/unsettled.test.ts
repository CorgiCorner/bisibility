import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAIModelProvider } from "./adapter";
import { context, input, observer, plainFixture, searchFixture } from "./adapter.test-support";
import { searchCall, source } from "./evidence.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let fetchMock: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  fetchMock = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

const cases = [
  {
    name: "tool calls above cap",
    changes: { output: [searchCall([], "one"), searchCall([], "two")] },
  },
  { name: "unknown model", changes: { model: "SYNTHETIC-UNKNOWN-MODEL" } },
  { name: "duplicate output ids", changes: { output: [searchCall([]), searchCall([])] } },
  {
    name: "contradictory totals",
    changes: { usage: { ...plainFixture().usage, total_tokens: 999 } },
    usage: { inputTokens: null, outputTokens: null, cacheReadInputTokens: 20 },
  },
  {
    name: "contradictory cache",
    changes: {
      usage: {
        ...plainFixture().usage,
        input_tokens_details: { cached_tokens: 80, cache_write_tokens: 30 },
      },
    },
    usage: { inputTokens: 100, cacheReadInputTokens: null, cacheWriteInputTokens: null },
  },
  {
    name: "contradictory reasoning",
    changes: {
      usage: {
        ...plainFixture().usage,
        output_tokens_details: { reasoning_tokens: 41 },
      },
    },
    usage: { outputTokens: 40, reasoningTokens: null },
  },
  {
    name: "contradictory TTL",
    changes: {
      usage: {
        ...plainFixture().usage,
        input_tokens_details: {
          cache_write_tokens: 30,
          cache_write_tokens_details: { ttl_12h_tokens: 1, ttl_30m_tokens: 1 },
        },
      },
    },
    usage: { cacheWriteInputTokens: 30, cacheWrites: [] },
  },
  ...[
    { name: "cache writes above input", cached_tokens: 0, cache_write_tokens: 150, ttl: 150 },
    { name: "cache sum above input", cached_tokens: 80, cache_write_tokens: 30, ttl: 30 },
    { name: "missing cache-write parent", cached_tokens: 20, cache_write_tokens: null, ttl: 10 },
    { name: "TTL above cache-write parent", cached_tokens: 20, cache_write_tokens: 30, ttl: 31 },
  ].map(({ name, cached_tokens, cache_write_tokens, ttl }) => ({
    name,
    changes: {
      usage: {
        ...plainFixture().usage,
        input_tokens_details: {
          cached_tokens,
          cache_write_tokens,
          cache_write_tokens_details: { ttl_12h_tokens: ttl, ttl_30m_tokens: 0 },
        },
      },
    },
    usage: {
      inputTokens: 100,
      cacheReadInputTokens: name === "cache sum above input" ? null : cached_tokens,
      cacheWriteInputTokens: name === "TTL above cache-write parent" ? 30 : null,
      cacheWrites: name === "TTL above cache-write parent" ? [{ ttlSeconds: 1800, tokens: 0 }] : [],
    },
  })),
  {
    name: "bounded measured TTL subsets",
    changes: {
      usage: {
        ...plainFixture().usage,
        input_tokens_details: {
          cached_tokens: 20,
          cache_write_tokens: 30,
          cache_write_tokens_details: { ttl_12h_tokens: 10, ttl_30m_tokens: 20 },
        },
      },
    },
    usage: {
      cacheWriteInputTokens: 30,
      cacheWrites: [
        { ttlSeconds: 43200, tokens: 10 },
        { ttlSeconds: 1800, tokens: 20 },
      ],
    },
  },
  {
    name: "malformed usage field",
    changes: { usage: { ...plainFixture().usage, input_tokens: -1 } },
    usage: { inputTokens: null, outputTokens: 40 },
  },
  {
    name: "malformed usage envelope",
    changes: { usage: "invalid" },
    usage: { inputTokens: null, outputTokens: null },
  },
  {
    name: "bad annotation offsets",
    changes: {
      output: [
        {
          ...plainFixture().output[0],
          content: [
            {
              type: "output_text",
              text: "answer",
              annotations: [
                {
                  type: "url_citation",
                  start_index: 0,
                  end_index: 999,
                  url: "https://example.org/source",
                  title: "Source",
                },
              ],
            },
          ],
        },
      ],
    },
  },
  { name: "bad consulted URL", changes: { output: [searchCall([source("javascript:alert(1)")])] } },
];

describe.each(["in_progress", "queued", "cancelled"])("unsettled %s response", (status) => {
  it.each(cases)("keeps accounting unknown with $name", async (testCase) => {
    const config = input();
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
    const fence = observer();
    fetchMock.mockResolvedValueOnce(
      json(
        JSON.stringify({
          ...plainFixture(),
          status,
          ...testCase.changes,
          tool_usage: { web_search: { num_requests: 3 } },
        }),
      ),
    );
    const result = await openAIModelProvider.generate(context(), config, fence);
    expect(result).toMatchObject({
      state: "unknown",
      failure: "accounting_unknown",
      answer: null,
      citations: [],
      actualModelId: testCase.name === "unknown model" ? null : plainFixture().model,
      citationTotals: { total: null, omitted: null },
      usage: { searchCalls: 3, ...(testCase.usage ?? { inputTokens: 100, outputTokens: 40 }) },
    });
    expect(fence.beforeDispatch).toHaveBeenCalledExactlyOnceWith(config.operationKey);
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("settles a terminal normalize throw with unknown usage and invalid_response", async () => {
  const fence = observer();
  const config = input();
  fetchMock.mockResolvedValueOnce(json(JSON.stringify({ ...plainFixture(), model: "unknown" })));
  await expect(openAIModelProvider.generate(context(), config, fence)).rejects.toMatchObject({
    code: "invalid_response",
    dispatched: true,
  });
  expect(fence.settle).toHaveBeenCalledTimes(1);
  expect(fence.settle.mock.calls[0][1]).toMatchObject({
    state: "unknown",
    failure: "invalid_response",
    answer: null,
    usage: { completeness: "unknown", inputTokens: null, outputTokens: null, searchCalls: null },
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("settles a paid answer despite a rejected supplementary source", async () => {
  const config = input();
  config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
  const fence = observer();
  const raw = searchFixture();
  fetchMock.mockResolvedValueOnce(
    json(
      JSON.stringify({
        ...raw,
        model: plainFixture().model,
        output: [
          searchCall([source(), source("https://user:pass@example.com")]),
          ...raw.output.filter((item) => item.type !== "web_search_call"),
        ],
      }),
    ),
  );
  const result = await openAIModelProvider.generate(context(), config, fence);
  expect(result).toMatchObject({
    state: "completed",
    failure: null,
    usage: { inputTokens: 100, outputTokens: 40, searchCalls: 1 },
    consultedSources: { total: null, omitted: null, truncated: true },
  });
  expect(result.citations).toHaveLength(2);
  expect(result.answer).toBeTruthy();
  expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
