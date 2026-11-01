import { beforeEach, describe, expect, it } from "vitest";
import { mocks, run, runIds, setupRankRunQueryMocks } from "./rank-check-runs.test-fixture";

const { getCheckSchedule, getRankCheckRun, listCheckSchedules, listRankCheckRunItems } =
  await import("./rank-check-runs");

describe("rank-check run queries", () => {
  beforeEach(setupRankRunQueryMocks);

  it("keeps run actuals unknown without Meter receipts despite stored values", async () => {
    const row = {
      ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
      _count: { items: 2 },
      selectionSpec: { providerId: "serpapi" },
      targetCount: 2,
    };
    mocks.runFindFirst.mockResolvedValue(row);
    mocks.usageGroups.mockResolvedValue([
      {
        runId: row.id,
        provider: "serpapi",
        requestedDepth: 20,
        _count: { _all: 2, billingUnits: 2 },
        _sum: { billingUnits: 3 },
      },
    ]);

    const detail = await getRankCheckRun("project_1", row.publicId);

    expect(detail.costCents).toBeNull();
    expect(detail.usage?.actual).toBeNull();
  });

  it("filters a shared scheduled run to the requested keyword", async () => {
    mocks.runFindFirst.mockResolvedValue({ id: "run_1" });
    mocks.itemFindMany.mockResolvedValue([]);
    await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL("https://example.com/items?keyword=kw_target&limit=1"),
    );
    expect(mocks.itemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { runId: "run_1", keyword: { publicId: "kw_target" } } }),
    );
  });

  it("does not read items when the run is outside the project", async () => {
    mocks.runFindFirst.mockResolvedValue(null);
    await expect(
      listRankCheckRunItems(
        "other_project",
        runIds[0] as string,
        new URL("https://example.com/items"),
      ),
    ).rejects.toThrow("Rank-check run not found.");
    expect(mocks.itemFindMany).not.toHaveBeenCalled();
  });

  it("maps schedule list and detail reads", async () => {
    const row = {
      _count: { keywords: 3 },
      cronExpression: null,
      enabled: true,
      frequency: "manual",
      isDefault: true,
      jitterMinutes: 60,
      name: "Manual",
      providerPolicy: null,
      publicId: "sch_a00000000000000000000000",
      serpDepth: null,
      timeOfDay: null,
      timezone: null,
    };
    mocks.checkSchedule.findMany.mockResolvedValue([row]);
    mocks.checkSchedule.findFirst.mockResolvedValue(row);

    await expect(listCheckSchedules("project_1")).resolves.toEqual([
      expect.objectContaining({ keywordCount: 3, publicId: row.publicId }),
    ]);
    await expect(getCheckSchedule("project_1", row.publicId)).resolves.toEqual(
      expect.objectContaining({ keywordCount: 3, publicId: row.publicId }),
    );
    for (const call of [mocks.checkSchedule.findMany, mocks.checkSchedule.findFirst]) {
      expect(call).toHaveBeenCalledWith(
        expect.objectContaining({
          select: expect.objectContaining({
            _count: {
              select: {
                keywords: { where: expect.objectContaining({ archivedAt: null }) },
              },
            },
          }),
        }),
      );
    }
  });
});
