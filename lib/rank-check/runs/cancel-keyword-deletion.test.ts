import { describe, expect, it, vi } from "vitest";
import { cancelRunItemsForKeywordDeletion } from "./cancel";

describe("keyword deletion run cleanup", () => {
  it("leaves the run untouched until cascade removal can be reconciled from remaining items", async () => {
    const updateRun = vi.fn();
    const tx = {
      rankCheckRun: { update: updateRun, updateMany: vi.fn() },
      rankCheckRunItem: {
        findMany: vi.fn(async () => [
          {
            id: "item_1",
            keywordId: "keyword_1",
            rankCheckId: null,
            run: {
              id: "run_1",
              projectId: "project_1",
              publicId: "rcr_a",
              requestedCount: 2,
              status: "running",
            },
            runId: "run_1",
            status: "queued",
          },
        ]),
        groupBy: vi.fn(async () => [
          {
            _count: { _all: 1 },
            _sum: { actualCostCents: null },
            keywordId: "keyword_2",
            status: "queued",
          },
        ]),
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
    };

    await expect(cancelRunItemsForKeywordDeletion(tx as never, ["keyword_1"])).resolves.toEqual({
      cancelled: 1,
    });

    expect(updateRun).not.toHaveBeenCalled();
    expect(tx.rankCheckRun.updateMany).not.toHaveBeenCalled();
    expect(tx.rankCheckRunItem.groupBy).not.toHaveBeenCalled();
  });
});
