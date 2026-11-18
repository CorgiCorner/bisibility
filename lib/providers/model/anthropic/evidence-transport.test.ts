import { fitsModelResult } from "@/lib/model-playground/result-budget";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { anthropicModelProvider as provider } from "./adapter";
import { context, input, observer, searchFixture } from "./fixtures.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let network: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  network = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

// Documentation-derived envelope with synthetic URLs, titles and occurrence counts.
function body(large = false) {
  const urls = Array.from(
    { length: large ? 100 : 2 },
    (_, i) => `https://example.org/${i}/${"x".repeat(large ? 1800 : 0)}`,
  );
  return {
    ...searchFixture(),
    content: [
      { type: "server_tool_use", name: "web_search", id: "srv1", input: { query: "synthetic" } },
      {
        type: "web_search_tool_result",
        tool_use_id: "srv1",
        content: urls.map((url) => ({ type: "web_search_result", url, title: "Source" })),
      },
      {
        type: "text",
        text: "Answer",
        citations: (large ? urls : urls.slice(0, 1)).map((url) => ({
          type: "web_search_result_location",
          url,
          title: "Source",
        })),
      },
    ],
  };
}
it("settles supplemental sources and citation counts through the shared observer", async () => {
  network.mockResolvedValueOnce(json(JSON.stringify(body())));
  const accounting = observer();
  const result = await provider.generate(context(), input(true), accounting);
  expect(result).toMatchObject({
    state: "completed",
    citationTotals: { total: 1, omitted: 0 },
    consultedSources: { total: 2, omitted: 0, truncated: false },
    providerCost: { amount: null, certainty: "unknown" },
  });
  expect(result.citations).toHaveLength(1);
  expect(result.consultedSources?.sources).toHaveLength(2);
  expect(accounting.beforeDispatch).toHaveBeenCalledOnce();
  expect(accounting.settle).toHaveBeenCalledExactlyOnceWith("op:p06", result);
  expect(network).toHaveBeenCalledOnce();
});
it("lets shared byte budgeting trim only consulted sources with truthful counters", async () => {
  network.mockResolvedValueOnce(json(JSON.stringify(body(true))));
  const accounting = observer();
  const result = await provider.generate(context(), input(true), accounting);
  const kept = result.consultedSources?.sources.length ?? -1;
  expect(kept).toBeGreaterThan(0);
  expect(kept).toBeLessThan(100);
  expect(result.consultedSources).toMatchObject({
    total: 100,
    omitted: 100 - kept,
    truncated: true,
  });
  expect(result.citations).toHaveLength(100);
  expect(result.citationTotals).toEqual({ total: 100, omitted: 0 });
  expect(result.state).toBe("completed");
  expect(fitsModelResult(result)).toBe(true);
  expect(accounting.settle).toHaveBeenCalledExactlyOnceWith("op:p06", result);
  expect(network).toHaveBeenCalledOnce();
});
