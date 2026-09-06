import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $executeRaw: vi.fn(),
    keyword: { findUnique: vi.fn() },
    projectMarket: { findMany: vi.fn() },
    rankCheckRun: { updateMany: vi.fn() },
    rankCheckRunItem: { findUnique: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
  },
  runKeywordCheckWithFallback: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../rank-check/fallback", () => ({
  ProviderChainError: class ProviderChainError extends Error {},
  runKeywordCheckWithFallback: mocks.runKeywordCheckWithFallback,
}));

import { runRankCheckActivity } from "./rank-check-activities";

describe("runRankCheckActivity", () => {
  it("finalizes a run when a refused paid-call fence blocks its last item", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-04T00:13:16.000Z"));
    mocks.prisma.$executeRaw.mockResolvedValue(0);
    mocks.prisma.keyword.findUnique.mockResolvedValue({
      archivedAt: null,
      locationId: "location_1",
      projectId: "project_1",
    });
    mocks.prisma.projectMarket.findMany.mockResolvedValue([{ locationId: "location_1" }]);
    mocks.prisma.rankCheckRunItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.rankCheckRunItem.findUnique.mockResolvedValue({
      run: { id: "run_1", projectId: "project_1", requestedCount: 1, status: "running" },
    });
    mocks.prisma.rankCheckRunItem.groupBy.mockResolvedValue([
      {
        _count: { _all: 1 },
        _sum: { actualCostCents: null },
        keywordId: "keyword_1",
        status: "blocked",
      },
    ]);
    mocks.prisma.rankCheckRun.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      runRankCheckActivity({
        keywordId: "keyword_1",
        rankCheckId: "rank_1",
        runItemId: "item_1",
        source: "manual",
      }),
    ).rejects.toMatchObject({
      nonRetryable: true,
      type: "rank_check_paid_call_already_attempted",
    });

    expect(mocks.prisma.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "failed", status: "completed" }),
      where: { id: "run_1", status: "running" },
    });
    vi.useRealTimers();
  });
});
