import { testUsageObserver } from "@/lib/providers/usage-test-observer";
import { afterEach, expect, it, vi } from "vitest";
import { fetchResearchQuestions, researchQuestionRow } from "./prompt-research-provider";
import { promptResearchSchema } from "./prompt-research-schema";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/live-capacity", () => ({
  reserveLiveResponseCapacity: vi.fn(),
  assertLiveResponseCapacity: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());
it.each([
  ["rank tracking tools", "partial_match"],
  ["the best rank tracking tools", "word_match"],
  ["tools", "partial_match"],
])("buys exactly 100 dataset rows with the correct match for %s", async (keyword, match_type) => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({
      status_code: 20000,
      cost: 0.2,
      tasks: [
        {
          id: "native-request",
          status_code: 20000,
          cost: 0.2,
          result: [
            {
              total_count: 101,
              items: Array.from({ length: 101 }, () => ({
                question: "a question?",
                answer: "An answer",
                sources: null,
              })),
            },
          ],
        },
      ],
    }),
  );
  vi.stubGlobal("fetch", fetch);
  const settle = vi.fn();
  const result = await fetchResearchQuestions(
    { login: "fixture", password: "fictional", usageObserver: { ...testUsageObserver, settle } },
    promptResearchSchema.parse({ keyword, max_cost_cents: 50 }),
    "usage-tag",
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe(
    "https://api.dataforseo.com/v3/ai_optimization/llm_mentions/search_mentions/live",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual([
    {
      target: [{ keyword, search_scope: ["question", "answer"], match_type }],
      platform: "chat_gpt",
      location_code: 2840,
      language_code: "en",
      limit: 100,
      order_by: ["ai_search_volume,desc"],
      tag: "usage-tag",
    },
  ]);
  expect(result.rows).toHaveLength(100);
  expect(result.costCents).toBe(20);
  expect(result.providerRequestId).toBe("native-request");
  expect(settle).toHaveBeenCalled();
});
it("strips unsafe sources, deduplicates URLs and tolerates missing answer/model", () => {
  expect(
    researchQuestionRow({
      question: "  best tools?  ",
      ai_search_volume: 42,
      sources: [
        { url: "javascript:alert(1)" },
        { url: "https://user:pass@example.com" },
        { url: "https://example.com/a", title: "A" },
        { url: "https://example.com/a" },
      ],
    }),
  ).toEqual([
    expect.objectContaining({
      prompt: "best tools?",
      answer: "",
      model: "chat_gpt",
      datasetVolume: 42,
      brandMentioned: false,
      citations: [{ url: "https://example.com/a", title: "A", targetDomain: false }],
    }),
  ]);
  expect(researchQuestionRow({ question: " " })).toEqual([]);
});
it("rejects different markets and row budgets at the server boundary", () => {
  for (const change of [
    { location_code: 2616 },
    { language_code: "pl" },
    { platform: "google" },
    { limit: 20 },
    { keyword: " " },
    { keyword: "a".repeat(101) },
  ])
    expect(
      promptResearchSchema.safeParse({ keyword: "tools", max_cost_cents: 50, ...change }).success,
    ).toBe(false);
});
