import { describe, expect, it, vi } from "vitest";
import { applyRunItemTransition, linkRunItemToRankCheck } from "./items";

describe("applyRunItemTransition", () => {
  it("finalizes a run in the same transaction when its last item completes", async () => {
    const update = vi.fn(async () => ({ projectId: "project_1" }));
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      $queryRaw: vi.fn(async () => []),
      rankCheck: { findUniqueOrThrow: vi.fn(async () => ({ costCents: 7 })) },
      rankCheckRun: { update, updateMany },
      rankCheckRunItem: {
        findUnique: vi.fn(async () => ({
          run: { id: "run_1", projectId: "project_1", requestedCount: 1, status: "running" },
          runId: "run_1",
        })),
        groupBy: vi.fn(async () => [
          {
            _count: { _all: 1 },
            _sum: { actualCostCents: 7 },
            keywordId: "keyword_1",
            status: "completed",
          },
        ]),
        updateMany: vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 }),
      },
    };

    await expect(
      applyRunItemTransition(tx as never, {
        rankCheckId: "rank_1",
        to: "completed",
      }),
    ).resolves.toEqual({ projectId: "project_1" });
    await applyRunItemTransition(tx as never, {
      rankCheckId: "rank_1",
      to: "completed",
    });

    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.rankCheckRunItem.findUnique.mock.invocationCallOrder[0] as number,
    );
    expect(tx.rankCheckRunItem.updateMany).toHaveBeenCalledWith({
      data: { actualCostCents: 7, finishedAt: expect.any(Date), status: "completed" },
      where: { rankCheckId: "rank_1", status: { in: ["queued", "running"] } },
    });
    expect(update).toHaveBeenCalledWith({
      data: { completedCount: { increment: 1 } },
      where: { id: "run_1" },
    });
    expect(updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "succeeded", status: "completed" }),
      where: { id: "run_1", status: "running" },
    });
  });

  it("does nothing for a legacy rank check with no linked item", async () => {
    const tx = {
      $queryRaw: vi.fn(async () => []),
      rankCheck: { findUniqueOrThrow: vi.fn() },
      rankCheckRun: { update: vi.fn() },
      rankCheckRunItem: {
        findUnique: vi.fn(async () => null),
        updateMany: vi.fn(),
      },
    };

    await expect(
      applyRunItemTransition(tx as never, { rankCheckId: "rank_legacy", to: "failed" }),
    ).resolves.toBe(false);

    expect(tx.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
    expect(tx.rankCheck.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(tx.rankCheckRun.update).not.toHaveBeenCalled();
  });
});

describe("linkRunItemToRankCheck", () => {
  it("records when a run first enters running", async () => {
    const startedAt = new Date("2026-09-02T08:00:00.000Z");
    const tx = {
      rankCheckRun: { updateMany: vi.fn(async () => ({ count: 1 })) },
      rankCheckRunItem: {
        findUnique: vi.fn(async () => ({
          keywordId: "keyword_a",
          rankCheckId: null,
          run: { projectId: "project_1" },
          runId: "run_1",
        })),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await expect(
      linkRunItemToRankCheck(tx as never, {
        keywordId: "keyword_a",
        rankCheckId: "rank_1",
        runItemId: "item_1",
        startedAt,
      }),
    ).resolves.toEqual({
      linked: true,
      projectId: "project_1",
      rankCheckId: "rank_1",
      runId: "run_1",
    });

    expect(tx.rankCheckRun.updateMany).toHaveBeenCalledWith({
      data: { startedAt, status: "running" },
      where: { id: "run_1", status: "queued" },
    });
  });

  it("rejects a rank check for a different keyword without touching the item", async () => {
    const tx = {
      rankCheckRun: { updateMany: vi.fn() },
      rankCheckRunItem: {
        findUnique: vi.fn(async () => ({
          keywordId: "keyword_b",
          rankCheckId: null,
          run: { projectId: "project_1" },
          runId: "run_1",
        })),
        updateMany: vi.fn(),
      },
    };

    await expect(
      linkRunItemToRankCheck(tx as never, {
        keywordId: "keyword_a",
        rankCheckId: "rank_1",
        runItemId: "item_1",
        startedAt: new Date("2026-09-02T08:00:00.000Z"),
      }),
    ).rejects.toThrow("Rank-check run item belongs to a different keyword.");

    expect(tx.rankCheckRunItem.updateMany).not.toHaveBeenCalled();
    expect(tx.rankCheckRun.updateMany).not.toHaveBeenCalled();
  });
});
