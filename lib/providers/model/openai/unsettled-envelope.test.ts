import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAIModelProvider } from "./adapter";
import { context, input, observer, plainFixture } from "./adapter.test-support";
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

// Synthetic malformed terminal fields alongside independently valid source/usage evidence.
function message(annotation: Record<string, unknown> = {}, text = "answer") {
  return {
    ...plainFixture().output[0],
    content: [
      {
        type: "output_text",
        text,
        annotations: [
          {
            type: "url_citation",
            start_index: 0,
            end_index: 6,
            url: "https://example.org/cited",
            title: "Source",
            ...annotation,
          },
        ],
      },
    ],
  };
}
const cases = [
  {
    name: "overlong citation URL",
    output: [message({ url: `https://example.org/${"x".repeat(2100)}` })],
  },
  { name: "extra annotation field", output: [message({ unexpected: true })] },
  { name: "unknown incomplete reason", incomplete_details: { reason: "undocumented" } },
  {
    name: "undocumented action",
    output: [{ ...searchCall(), action: { type: "undocumented" } }],
    dropped: true,
  },
  {
    name: "missing find pattern",
    output: [{ ...searchCall(), action: { type: "find_in_page" } }],
    dropped: true,
  },
  { name: "partial surrogate", output: [message({}, "partial\uD800")] },
];

describe.each(["in_progress", "queued", "cancelled"])("minimal %s envelope", (status) => {
  it.each(cases)("retains accounting and safe sources with $name", async (testCase) => {
    const config = input();
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
    const fence = observer();
    fetchMock.mockResolvedValueOnce(
      json(
        JSON.stringify({
          ...plainFixture(),
          status,
          output: [searchCall([source()], "valid"), ...(testCase.output ?? [])],
          incomplete_details: testCase.incomplete_details ?? null,
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
      citationTotals: { total: null, omitted: null },
      usage: { completeness: "partial", inputTokens: 100, outputTokens: 40, searchCalls: 3 },
      consultedSources: {
        sources: [{ url: "https://example.org/source" }],
        total: null,
        omitted: null,
        truncated: testCase.dropped ?? false,
      },
    });
    expect(fence.beforeDispatch).toHaveBeenCalledExactlyOnceWith(config.operationKey);
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("needs only the minimal envelope and skips unrelated output items", async () => {
    const config = input();
    const fence = observer();
    fetchMock.mockResolvedValueOnce(
      json(
        JSON.stringify({
          object: "response",
          model: plainFixture().model,
          status,
          output: [null, 42, {}, { type: "unknown" }],
          usage: plainFixture().usage,
        }),
      ),
    );
    const result = await openAIModelProvider.generate(context(), config, fence);
    expect(result).toMatchObject({
      state: "unknown",
      failure: "accounting_unknown",
      answer: null,
      citations: [],
      usage: { completeness: "partial", inputTokens: 100, outputTokens: 40 },
    });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it.each([
  { name: "measured", usage: plainFixture().usage, completeness: "partial" },
  { name: "absent", usage: null, completeness: "unknown" },
])("keeps cancelled search-off $name usage non-final", async ({ usage, completeness }) => {
  const config = input();
  const fence = observer();
  fetchMock.mockResolvedValueOnce(
    json(JSON.stringify({ ...plainFixture(), status: "cancelled", usage })),
  );
  const result = await openAIModelProvider.generate(context(), config, fence);
  expect(result).toMatchObject({
    state: "unknown",
    failure: "accounting_unknown",
    usage: { completeness },
  });
  expect(result.usage.inputTokens).toBe(usage?.input_tokens ?? null);
  expect(result.usage.outputTokens).toBe(usage?.output_tokens ?? null);
  expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
