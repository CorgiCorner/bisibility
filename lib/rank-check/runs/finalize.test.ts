import { describe, expect, it, vi } from "vitest";
import { finalizeRankCheckRun } from "./finalize";

const now = new Date("2026-09-04T00:13:16.000Z");

function run(status = "running") {
  return {
    id: "run_1",
    projectId: "project_1",
    requestedCount: 1,
    status,
  };
}

function completedGroups() {
  return [
    {
      _count: { _all: 1 },
      _sum: { actualCostCents: 7 },
      keywordId: "keyword_1",
      status: "completed",
    },
  ];
}

describe("finalizeRankCheckRun", () => {
  it("completes a run as soon as its last item completes", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      rankCheckRun: { updateMany },
      rankCheckRunItem: { groupBy: vi.fn(async () => completedGroups()) },
    };

    await expect(finalizeRankCheckRun(tx as never, { now, run: run() })).resolves.toEqual({
      finalized: true,
      projectId: "project_1",
    });

    expect(updateMany).toHaveBeenCalledWith({
      data: {
        cancelledCount: 0,
        completedCount: 1,
        costCents: 7,
        deferredCount: 0,
        failedCount: 0,
        finishedAt: now,
        keywordCount: 1,
        outcome: "succeeded",
        skippedCount: 0,
        status: "completed",
        targetCount: 1,
        totalCount: 1,
      },
      where: { id: "run_1", status: "running" },
    });
  });

  it("keeps a run running when a middle item completes", async () => {
    const updateMany = vi.fn();
    const tx = {
      rankCheckRun: { updateMany },
      rankCheckRunItem: {
        groupBy: vi.fn(async () => [
          ...completedGroups(),
          {
            _count: { _all: 1 },
            _sum: { actualCostCents: null },
            keywordId: "keyword_2",
            status: "running",
          },
        ]),
      },
    };

    await expect(finalizeRankCheckRun(tx as never, { now, run: run() })).resolves.toEqual({
      finalized: false,
      projectId: "project_1",
    });

    expect(updateMany).not.toHaveBeenCalled();
  });

  it("records a cancelled outcome when cancellation finishes every item", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      rankCheckRun: { updateMany },
      rankCheckRunItem: {
        groupBy: vi.fn(async () => [
          {
            _count: { _all: 1 },
            _sum: { actualCostCents: null },
            keywordId: "keyword_1",
            status: "cancelled",
          },
        ]),
      },
    };

    await finalizeRankCheckRun(tx as never, { now, run: run("cancelling") });

    expect(updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ outcome: "cancelled", status: "cancelled" }),
      where: { id: "run_1", status: "cancelling" },
    });
  });

  it("is a no-op when a concurrent reconciler already finalized the run", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const tx = {
      rankCheckRun: { updateMany },
      rankCheckRunItem: { groupBy: vi.fn(async () => completedGroups()) },
    };

    await expect(finalizeRankCheckRun(tx as never, { now, run: run() })).resolves.toEqual({
      finalized: false,
      projectId: "project_1",
    });

    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "run_1", status: "running" } }),
    );
  });
});
