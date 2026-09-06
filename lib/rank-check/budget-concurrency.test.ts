import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    providerCostEntry: { aggregate: vi.fn() },
    rankCheck: { aggregate: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const { monthlySpendCents } = await import("./budget");

describe("monthlySpendCents concurrency", () => {
  it("starts the independent rank-check and provider-cost aggregates together", async () => {
    let resolveRankChecks: (value: { _sum: { costCents: number } }) => void = () => undefined;
    mocks.prisma.rankCheck.aggregate.mockReturnValue(
      new Promise((resolve) => {
        resolveRankChecks = resolve;
      }),
    );
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: null } });

    const spend = monthlySpendCents("project_1", new Date("2020-01-15T12:00:00.000Z"));
    try {
      expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledOnce();
    } finally {
      resolveRankChecks({ _sum: { costCents: 1 } });
    }
    await expect(spend).resolves.toBe(1);
  });
});
