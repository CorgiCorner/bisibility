import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecentCompletedChecks } from "./history";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: { rankCheck: { findMany: mocks.findMany } },
}));

describe("comparable alert history", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMany.mockResolvedValue([]);
  });

  it("loads only completed checks with the same normalization version and depth", async () => {
    const checkedAt = new Date("2026-07-30T10:00:00.000Z");
    mocks.findMany.mockResolvedValue([
      {
        checkedAt,
        id: "check_previous",
        normalizationVersion: "v2",
        position: 8,
        requestedDepth: 50,
      },
    ]);

    await loadRecentCompletedChecks("keyword_1", {
      checkedAt: new Date("2026-07-30T11:00:00.000Z"),
      normalizationVersion: "v2",
      position: 7,
      rankCheckId: "check_current",
      requestedDepth: 50,
    });

    expect(mocks.findMany).toHaveBeenCalledWith({
      orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
      select: {
        checkedAt: true,
        id: true,
        normalizationVersion: true,
        position: true,
        requestedDepth: true,
      },
      take: 5,
      where: {
        keywordId: "keyword_1",
        normalizationVersion: "v2",
        requestedDepth: 50,
        status: "completed",
      },
    });
  });

  it("does not query incomparable legacy history", async () => {
    const current = {
      checkedAt: new Date("2026-07-30T11:00:00.000Z"),
      normalizationVersion: null,
      position: 7,
      rankCheckId: "check_current",
      requestedDepth: 50,
    };

    await expect(loadRecentCompletedChecks("keyword_1", current)).resolves.toEqual([current]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
