import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    providerCostEntry: { aggregate: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const { monthlySpendCents } = await import("./budget");

describe("monthlySpendCents concurrency", () => {
  it("resolves from a single ledger aggregate without a rank-check query", async () => {
    mocks.prisma.providerCostEntry.aggregate.mockResolvedValue({ _sum: { costCents: "1.5" } });

    await expect(
      monthlySpendCents("project_1", new Date("2020-01-15T12:00:00.000Z")),
    ).resolves.toBe(1.5);

    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledOnce();
    expect(mocks.prisma.providerCostEntry.aggregate).toHaveBeenCalledWith({
      _sum: { costCents: true },
      where: expect.objectContaining({ measurementStatus: "recorded", projectId: "project_1" }),
    });
  });
});
