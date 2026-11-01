import { beforeEach, describe, expect, it } from "vitest";
import { item, mocks, run, runIds, setupRankRunQueryMocks } from "./rank-check-runs.test-fixture";

const { getRankCheckRunCount, listRankCheckRunItems, listRankCheckRuns } = await import(
  "./rank-check-runs"
);

describe("rank-check run queries", () => {
  beforeEach(setupRankRunQueryMocks);

  it("projects planned counts and estimate from current schedule members", async () => {
    const plannedFor = new Date("2026-09-03T08:00:00.000Z");
    mocks.runFindMany.mockResolvedValue([
      {
        ...run(runIds[0] as string, null, plannedFor),
        checkSchedule: {
          id: "schedule_1",
          providerPolicy: null,
          publicId: "sch_a00000000000000000000000",
          serpDepth: null,
        },
        estimatedCostCents: 40,
        keywordCount: 20,
        requestedCount: 20,
        targetCount: 20,
        totalCount: 20,
      },
    ]);
    mocks.scheduleKeywords.mockResolvedValue([
      { device: "desktop", locationId: "market_1", text: "coffee beans" },
    ]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=planned"),
    );

    expect(result.data[0]).toMatchObject({
      counts: expect.objectContaining({ requested: 1, total: 1 }),
      estimatedCostCents: 2,
      keywordCount: 1,
      targetCount: 1,
    });
    expect(mocks.loadProviderChain).toHaveBeenCalledWith("project_1", undefined);
  });

  it("excludes archived and paused members from planned run projections", async () => {
    const plannedFor = new Date("2026-09-03T08:00:00.000Z");
    mocks.runFindMany.mockResolvedValue([
      {
        ...run(runIds[0] as string, null, plannedFor),
        checkSchedule: {
          id: "schedule_1",
          providerPolicy: null,
          publicId: "sch_a00000000000000000000000",
          serpDepth: null,
        },
      },
    ]);
    mocks.scheduleKeywords.mockImplementation(({ where }) =>
      Promise.resolve(
        where.archivedAt === null
          ? [{ device: "desktop", locationId: "market_1", text: "live keyword" }]
          : [
              { device: "desktop", locationId: "market_1", text: "live keyword" },
              { device: "desktop", locationId: "market_1", text: "archived keyword" },
              { device: "desktop", locationId: "market_paused", text: "paused keyword" },
            ],
      ),
    );

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=planned"),
    );

    expect(result.data[0]).toMatchObject({
      estimatedCostCents: 2,
      keywordCount: 1,
      targetCount: 1,
    });
    expect(mocks.projectMarket.findMany).toHaveBeenCalledWith({
      select: { locationId: true },
      where: { projectId: "project_1", status: "active" },
    });
  });

  it("counts launched runs for the Runs tab", async () => {
    mocks.runCount.mockResolvedValue(7);

    await expect(getRankCheckRunCount("project_1")).resolves.toBe(7);
    expect(mocks.runCount).toHaveBeenCalledWith({
      where: { launchedAt: { not: null }, projectId: "project_1", deletedAt: null },
    });
  });

  it("maps the requested actor with avatar fields for run history", async () => {
    mocks.raw.mockResolvedValue([{ publicId: runIds[0] }]);
    mocks.runFindMany.mockResolvedValue([run(runIds[0] as string, new Date("2026-09-02"))]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x"),
    );

    expect(result.data[0]?.requestedBy).toEqual({
      avatarUrl: "https://example.com/user.png",
      initials: "U",
      name: "User",
    });
    expect(mocks.runFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          requestedBy: { select: { email: true, image: true, name: true } },
        }),
      }),
    );
  });

  it("does not select schedule keywords for history rows", async () => {
    mocks.runFindMany.mockResolvedValue([run(runIds[0] as string, new Date("2026-09-02"))]);

    await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x&segment=history"),
    );

    const select = mocks.runFindMany.mock.calls[0]?.[0].select;
    expect(select.checkSchedule.select).not.toHaveProperty("keywords");
  });

  it("includes the earliest queued check for a running run", async () => {
    const waitingAt = new Date("2026-09-02T13:00:00.000Z");
    mocks.runFindMany.mockResolvedValue([
      {
        ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
        items: [{ notBefore: waitingAt }],
        status: "running",
      },
    ]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x"),
    );

    expect(result.data[0]?.nextCheckAt).toBe("2026-09-02T13:00:00.000Z");
  });

  it("does not call a run waiting while a check is in flight", async () => {
    mocks.runFindMany.mockResolvedValue([
      {
        ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
        _count: { items: 1 },
        items: [{ notBefore: new Date("2026-09-02T13:00:00.000Z"), status: "running" }],
        status: "running",
      },
    ]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x"),
    );

    expect(result.data[0]?.nextCheckAt).toBeNull();
  });

  it("includes the current budget only for a budget-blocked run", async () => {
    mocks.raw.mockResolvedValue([{ publicId: runIds[0] }]);
    mocks.monthlySpend.mockResolvedValue(1_250);
    mocks.runFindMany.mockResolvedValue([
      {
        ...run(runIds[0] as string, new Date("2026-09-02T12:00:00.000Z")),
        blockedReason: "budget_exhausted",
        status: "blocked",
      },
    ]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x"),
    );

    expect(result.data[0]?.budget).toEqual({ capCents: 777, spentCents: 1_250 });
    expect(mocks.monthlySpend).toHaveBeenCalledWith("project_1");
  });

  it("uses opaque item tokens while keyset paging by createdAt and the internal ID", async () => {
    const dates = [
      new Date("2026-09-02T10:00:00.000Z"),
      new Date("2026-09-02T11:00:00.000Z"),
      new Date("2026-09-02T12:00:00.000Z"),
    ];
    const ids = ["item_1", "item_2", "item_3"];
    mocks.runFindFirst.mockResolvedValue({ id: "run_1" });
    mocks.itemFindMany
      .mockResolvedValueOnce(ids.map((id, index) => item(id, dates[index] as Date)))
      .mockResolvedValueOnce([item(ids[2] as string, dates[2] as Date)]);

    const first = await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL("https://example.com/items?limit=2&status=failed"),
    );
    const second = await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL(`https://example.com/items?limit=2&status=failed&cursor=${first.nextCursor}`),
    );

    const itemTokens = [...first.data, ...second.data].map(({ id }) => id);
    expect(itemTokens).toHaveLength(ids.length);
    expect(new Set(itemTokens)).toHaveLength(ids.length);
    expect(itemTokens).not.toContain("item_1");
    expect(itemTokens).not.toContain("item_2");
    expect(itemTokens).not.toContain("item_3");
    expect(first.data[0]?.keyword).toMatchObject({ languageLabel: "Polish", location: "Poland" });
    expect(mocks.itemFindMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ createdAt: { gt: dates[1] } }, { createdAt: dates[1], id: { gt: "item_2" } }],
          runId: "run_1",
          status: { in: ["failed"] },
        },
      }),
    );
  });
});
