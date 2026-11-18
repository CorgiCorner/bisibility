import { fitsModelResult } from "@/lib/model-playground/result-budget";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAIModelProvider } from "./adapter";
import { context, input, observer, plainFixture, searchFixture } from "./adapter.test-support";
import { evidence, searchCall, source } from "./evidence.test-support";

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

describe("shared result adoption through bounded transport", () => {
  it("requests sources only for search and settles the normalized evidence once", async () => {
    const config = input();
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
    const raw = { ...searchFixture(), model: plainFixture().model };
    const fence = observer();
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(raw)));
    const result = await openAIModelProvider.generate(context(), config, fence);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      include: ["web_search_call.action.sources"],
      max_tool_calls: 1,
    });
    expect(result.consultedSources).toMatchObject({ total: 2, omitted: 0, truncated: false });
    expect(result.citationTotals).toEqual({ total: 2, omitted: 0 });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
    expect(fence.beforeDispatch).toHaveBeenCalledExactlyOnceWith(config.operationKey);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not request search evidence when search is off", async () => {
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(plainFixture())));
    const result = await openAIModelProvider.generate(context(), input(), observer());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty("include");
    expect(result).not.toHaveProperty("consultedSources");
    expect(result.citationTotals).toEqual({ total: 0, omitted: 0 });
  });

  it("lets the shared transport trim source bytes with truthful totals", async () => {
    const config = input();
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
    const sources = Array.from({ length: 100 }, (_, i) =>
      source(`https://example.org/${i}/${"a".repeat(1970)}`),
    );
    const raw = searchFixture();
    const message = raw.output.find((item) => item.type === "message");
    if (!message?.content) throw new Error("Fixture message missing");
    message.content[0].text = "a".repeat(24576);
    message.content[0].annotations = Array.from({ length: 100 }, (_, i) => ({
      type: "url_citation",
      start_index: 0,
      end_index: 1,
      url: `https://example.org/cited/${i}/${"a".repeat(1000)}`,
      title: "t".repeat(512),
    }));
    const body = { ...raw, model: plainFixture().model, output: [searchCall(sources), message] };
    const normalized = evidence(body);
    expect(normalized.consultedSources?.sources).toHaveLength(100);
    expect(fitsModelResult(normalized)).toBe(false);
    const fence = observer();
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(body)));
    const result = await openAIModelProvider.generate(context(), config, fence);
    const kept = result.consultedSources?.sources.length ?? -1;
    expect(result.consultedSources).toBeDefined();
    expect(kept).toBeGreaterThan(0);
    expect(kept).toBeLessThan(100);
    expect(result.consultedSources).toMatchObject({
      total: 100,
      omitted: 100 - kept,
      truncated: true,
    });
    expect(result.citations).toHaveLength(100);
    expect(result.answer).toBe(normalized.answer);
    expect(result.usage).toEqual(normalized.usage);
    expect(result.state).toBe("completed");
    expect(fitsModelResult(result)).toBe(true);
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["in_progress", "queued", "cancelled"])(
    "preserves unknown %s ahead of integrity failures",
    async (status) => {
      for (const conflict of ["search", "model", "refusal", "both"]) {
        const searchCalls = conflict === "search" || conflict === "both" ? 3 : 0;
        const raw = {
          ...plainFixture(),
          status,
          ...(conflict === "model" || conflict === "both" ? { model: "gpt-5-2025-08-07" } : {}),
          tool_usage: { web_search: { num_requests: searchCalls } },
          ...(conflict === "refusal"
            ? {
                output: [
                  {
                    type: "message",
                    id: "msg_refused",
                    role: "assistant",
                    status: "completed",
                    content: [{ type: "refusal", refusal: "SYNTHETIC-ECHO" }],
                  },
                ],
              }
            : {}),
        };
        const fence = observer();
        fetchMock.mockResolvedValueOnce(json(JSON.stringify(raw)));
        const result = await openAIModelProvider.generate(context(), input(), fence);
        expect(result).toMatchObject({
          state: "unknown",
          failure: "accounting_unknown",
          usage: { inputTokens: 100, outputTokens: 40, searchCalls },
        });
        expect(fence.settle).toHaveBeenCalledExactlyOnceWith(input().operationKey, result);
      }
      expect(fetchMock).toHaveBeenCalledTimes(4);
    },
  );

  it("preserves a billable search count above the sent cap without rejecting the result", async () => {
    const config = input();
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
    const raw = {
      ...searchFixture(),
      model: plainFixture().model,
      tool_usage: { web_search: { num_requests: 3 } },
    };
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(raw)));
    const fence = observer();
    const result = await openAIModelProvider.generate(context(), config, fence);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).max_tool_calls).toBe(1);
    expect(result).toMatchObject({
      state: "completed",
      failure: null,
      usage: { completeness: "partial", searchCalls: 3, searchContentTokens: null },
    });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["completed", "failed", "incomplete", "queued"])(
    "never fabricates cost evidence for %s",
    async (status) => {
      fetchMock.mockResolvedValueOnce(
        json(
          JSON.stringify({
            ...plainFixture(),
            status,
            cost: 0,
            costEvidence: { providerReported: { amount: "1.23" } },
            usage: { ...plainFixture().usage, cost: 4.56, total_cost: "7.89" },
          }),
        ),
      );
      const fence = observer();
      const result = await openAIModelProvider.generate(context(), input(), fence);
      expect(result.providerCost).toEqual({
        amount: null,
        currency: "USD",
        certainty: "unknown",
        basis: "unknown",
        rateCardVersion: null,
      });
      expect(result.paymentReceipt).toBeNull();
      expect(result).not.toHaveProperty("costEvidence");
      expect(fence.settle).toHaveBeenCalledExactlyOnceWith(input().operationKey, result);
    },
  );
});
