import { paymentQuote } from "@/components/action-payment/payment-test-fixture";
import type { ResearchKeywordsAction } from "@/lib/actions/keyword-research";
import { expect, it, vi } from "vitest";
import { loadDeeperEstimate, loadResearchEstimate } from "./research-payment-estimates";

const input = { projectId: "project", seed: "keyword" };
const common = {
  ok: true as const,
  cached: false,
  costCents: 9,
  provider: "future-provider",
  connections: [],
  sources: [],
};

it("projects only dry-run quotes into future and retry prices", async () => {
  const quote = paymentQuote();
  const action = vi
    .fn<ResearchKeywordsAction>()
    .mockResolvedValue({ ...common, estimate: true, payment: quote });
  expect(await loadDeeperEstimate(action, input, 100)).toEqual({
    cached: false,
    costCents: 9,
    payment: quote,
  });
  expect(await loadResearchEstimate(action, input)).toEqual({
    cached: false,
    costCents: 9,
    payments: [quote],
    loading: false,
  });
});

it("never treats a successful paid receipt as a fresh estimate", async () => {
  const quote = paymentQuote();
  const action = vi.fn<ResearchKeywordsAction>().mockResolvedValue({
    ...common,
    rows: [],
    fetchedAt: "2026-10-21T12:00:00Z",
    cachedUntil: "2026-10-22T12:00:00Z",
    payment: {
      actionId: "paid-action",
      quoteId: quote.id,
      option: quote.option,
      state: "settled",
      charge: { ...quote.charge, certainty: "measured" },
    },
  });
  expect(await loadDeeperEstimate(action, input, 100)).toBeUndefined();
  expect(await loadResearchEstimate(action, input)).toBeUndefined();
});
