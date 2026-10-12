import { expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.query } }));

import { providerCostBySource, recordedSpendBySource } from "./provider-spend-usage";

test("source projection retains unknown-only and measured fractional buckets", async () => {
  mocks.query.mockResolvedValue([
    {
      connectionId: "connection",
      feature: "rank_check",
      source: "app",
      count: 3,
      costCents: "4.5",
      quantity: "2.5",
      scheduled: 3,
      unmeasuredCount: 2,
      unrecordedCount: 4,
    },
    {
      connectionId: "connection",
      feature: "keyword_research",
      source: "mcp",
      count: 0,
      costCents: "0",
      quantity: null,
      scheduled: 0,
      unmeasuredCount: 0,
      unrecordedCount: 2,
    },
  ]);
  expect(await providerCostBySource("project")).toMatchObject([
    { costCents: 4.5, quantity: 2.5, unrecordedCount: 4 },
    { quantity: null, unrecordedCount: 2 },
  ]);
  expect(mocks.query.mock.calls[0]?.[0].text).toContain("metering_operation");
});
test("credits use confirmed customer measurements independently of provider cost", async () => {
  mocks.query.mockResolvedValue([{ ownCents: "0.25", creditsCents: "0.5" }]);
  expect(await recordedSpendBySource("project")).toEqual({ ownCents: 0.25, creditsCents: 0.5 });
  expect(mocks.query.mock.calls.at(-1)?.[0].text).toContain('SUM("priceCents")');
});
