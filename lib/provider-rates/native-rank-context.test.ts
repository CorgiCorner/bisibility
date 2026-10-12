import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { expect, test } from "vitest";

test("rank estimates retain exact depth quotes instead of scaling a pooled measurement", () => {
  const context = {
    entries: Array.from({ length: 5 }, () => ({
      cached: false,
      failed: false,
      costCents: "99",
      createdAt: new Date("2026-10-11"),
    })),
    manualAmountCents: null,
    nativeRankCosts: { provider: "dataforseo", centsByDepth: { 10: 0.6, 100: 7.25 } },
  };
  expect(estimatedRankCheckCostCents("dataforseo", 10, null, context)).toBe(0.6);
  expect(
    estimatedRankCheckCostCents("dataforseo", 100, null, context, {
      measuredRateBaselineDepth: 10,
    }),
  ).toBe(7.25);
});

test("an unavailable native rank variant cannot fall back to a legacy price", () => {
  const context = {
    entries: [],
    manualAmountCents: "9",
    nativeRankCosts: { provider: "dataforseo", centsByDepth: { 10: null, 100: 0 } },
  };
  expect(estimatedRankCheckCostCents("dataforseo", 10, 9, context)).toBeNull();
  expect(estimatedRankCheckCostCents("dataforseo", 100, 9, context)).toBe(0);
});
