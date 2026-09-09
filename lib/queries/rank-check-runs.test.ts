import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkSchedule: { findFirst: vi.fn(), findMany: vi.fn() },
  auditLog: { findMany: vi.fn() },
  itemFindMany: vi.fn(),
  loadProviderChain: vi.fn(),
  monthlySpend: vi.fn(),
  raw: vi.fn(),
  projectMarket: { findMany: vi.fn() },
  runCount: vi.fn(),
  runFindFirst: vi.fn(),
  runFindMany: vi.fn(),
  scheduleKeywords: vi.fn(),
  unitCost: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.raw,
    auditLog: mocks.auditLog,
    checkSchedule: mocks.checkSchedule,
    rankCheckRun: {
      count: mocks.runCount,
      findFirst: mocks.runFindFirst,
      findMany: mocks.runFindMany,
    },
    keyword: { findMany: mocks.scheduleKeywords },
    projectMarket: mocks.projectMarket,
    rankCheckRunItem: { findMany: mocks.itemFindMany },
  },
}));
vi.mock("@/lib/cost-estimate/project-estimate", () => ({ unitCostCentsFor: mocks.unitCost }));
vi.mock("@/lib/rank-check/provider-chain-loader", () => ({
  loadSerpProviderChain: mocks.loadProviderChain,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestMonthlySpendCents: mocks.monthlySpend,
}));

import {
  getCheckSchedule,
  getRankCheckRunCount,
  listCheckSchedules,
  listRankCheckRunItems,
  listRankCheckRuns,
} from "./rank-check-runs";

const runIds = [
  "rcr_a00000000000000000000000",
  "rcr_b00000000000000000000000",
  "rcr_c00000000000000000000000",
];

function run(publicId: string, launchedAt: Date | null, plannedFor: Date | null = null) {
  return {
    _count: { items: 0 },
    blockedReason: null,
    cancelledCount: 0,
    checkSchedule: null,
    completedCount: 1,
    costCents: 10,
    deferredCount: 0,
    estimatedCostCents: 10,
    failedCount: 0,
    finishedAt: null,
    id: `db_${publicId}`,
    items: [],
    keywordCount: 1,
    launchedAt,
    orchestrationWorkflowId: `rank-check-run-${publicId}`,
    outcome: null,
    parentRelation: null,
    parentRun: null,
    plannedFor,
    project: { budgetCapCents: 5_000, defaults: { serpDepth: 20 } },
    projectId: "project_1",
    publicId,
    requestedBy: {
      email: "user@example.com",
      image: "https://example.com/user.png",
      name: "User",
    },
    requestedCount: 1,
    selectionKind: "all",
    selectionSpec: { kind: "all", v: 1 },
    skippedCount: 0,
    startedAt: null,
    status: plannedFor ? "planned" : "completed",
    targetCount: 1,
    totalCount: 1,
    trigger: plannedFor ? "scheduled" : "manual",
  };
}

function item(id: string, createdAt: Date) {
  return {
    actualCostCents: null,
    blockedReason: null,
    createdAt,
    estimatedCostCents: 5,
    finishedAt: null,
    id,
    keyword: {
      device: "desktop",
      locationRef: { languageLabel: "Polish" },
      location: "Poland",
      publicId: "kw_a00000000000000000000000",
      text: id,
    },
    notBefore: null,
    rankCheck: null,
    startedAt: null,
    status: "failed",
  };
}

describe("rank-check run queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadProviderChain.mockResolvedValue([
      { costPerCheckCents: 2, provider: "serpapi", rateContext: { entries: [] } },
    ]);
    mocks.auditLog.findMany.mockResolvedValue([]);
    mocks.unitCost.mockReturnValue(2);
    mocks.scheduleKeywords.mockResolvedValue([]);
    mocks.projectMarket.findMany.mockResolvedValue([{ locationId: "market_1" }]);
    mocks.monthlySpend.mockResolvedValue(0);
  });

  it("pages launched and skipped history without duplicates or gaps", async () => {
    const dates = [new Date("2026-09-02T12:00:00.000Z"), new Date("2026-09-02T10:00:00.000Z")];
    const skippedAt = new Date("2026-09-02T11:00:00.000Z");
    const skipped = {
      ...run(runIds[1] as string, null),
      finishedAt: skippedAt,
      plannedFor: new Date("2026-09-02T06:00:00.000Z"),
      status: "cancelled",
    };
    mocks.runFindMany
      .mockResolvedValueOnce([
        run(runIds[0] as string, dates[0] as Date),
        skipped,
        run(runIds[2] as string, dates[1] as Date),
      ])
      .mockResolvedValueOnce([run(runIds[2] as string, dates[1] as Date)]);
    mocks.raw
      .mockResolvedValueOnce(runIds.map((publicId) => ({ publicId })))
      .mockResolvedValueOnce([{ publicId: runIds[2] }]);

    const first = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x&limit=2"),
    );
    const second = await listRankCheckRuns(
      "project_1",
      new URL(
        `https://example.com/api/rank-check-runs?project=prj_x&limit=2&cursor=${first.nextCursor}`,
      ),
    );

    expect([...first.data, ...second.data].map(({ id }) => id)).toEqual(runIds);
    expect(first.data[1]).toMatchObject({
      finishedAt: skippedAt.toISOString(),
      status: "cancelled",
    });
    expect(mocks.raw).toHaveBeenLastCalledWith(
      expect.objectContaining({
        strings: expect.arrayContaining([
          expect.stringContaining('COALESCE("launchedAt", "finishedAt")'),
        ]),
      }),
    );
  });

  it("returns the actor who skipped an occurrence", async () => {
    const skipped = {
      ...run(runIds[0] as string, null),
      finishedAt: new Date("2026-09-02T11:00:00.000Z"),
      status: "cancelled",
    };
    mocks.raw.mockResolvedValue([{ publicId: skipped.publicId }]);
    mocks.runFindMany.mockResolvedValue([skipped]);
    mocks.auditLog.findMany.mockResolvedValue([
      {
        actor: { email: "anna@example.com", image: null, name: "Anna Kowalska" },
        targetId: skipped.publicId,
      },
    ]);

    const result = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?project=prj_x"),
    );

    expect(result.data[0]).toMatchObject({
      skippedBy: { initials: "AK", name: "Anna Kowalska" },
    });
  });

  it("orders the planned segment forward by plannedFor", async () => {
    mocks.runFindMany.mockResolvedValue([]);
    await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=planned"),
    );

    expect(mocks.runFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ plannedFor: "asc" }, { publicId: "asc" }],
        where: expect.objectContaining({ status: { in: ["planned", "blocked"] } }),
      }),
    );
  });

  it("pages launched and unlaunched blocked runs in their correct segments", async () => {
    const plannedDates = [
      new Date("2026-09-02T10:00:00.000Z"),
      new Date("2026-09-03T10:00:00.000Z"),
    ];
    const launchedDates = [
      new Date("2026-09-04T10:00:00.000Z"),
      new Date("2026-09-03T10:00:00.000Z"),
    ];
    const blockedPlanned = plannedDates.map((date, index) => ({
      ...run(runIds[index] as string, null, date),
      status: "blocked",
    }));
    const blockedLaunched = launchedDates.map((date, index) => ({
      ...run(runIds[index + 1] as string, date),
      status: "blocked",
    }));
    mocks.runFindMany
      .mockResolvedValueOnce(blockedPlanned)
      .mockResolvedValueOnce([blockedPlanned[1]])
      .mockResolvedValueOnce(blockedLaunched)
      .mockResolvedValueOnce([blockedLaunched[1]]);
    mocks.raw
      .mockResolvedValueOnce(blockedLaunched.map(({ publicId }) => ({ publicId })))
      .mockResolvedValueOnce([{ publicId: blockedLaunched[1]?.publicId }]);

    const plannedFirst = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=planned&limit=1"),
    );
    const plannedSecond = await listRankCheckRuns(
      "project_1",
      new URL(
        `https://example.com/api/rank-check-runs?segment=planned&limit=1&cursor=${plannedFirst.nextCursor}`,
      ),
    );
    const historyFirst = await listRankCheckRuns(
      "project_1",
      new URL("https://example.com/api/rank-check-runs?segment=history&limit=1"),
    );
    const historySecond = await listRankCheckRuns(
      "project_1",
      new URL(
        `https://example.com/api/rank-check-runs?segment=history&limit=1&cursor=${historyFirst.nextCursor}`,
      ),
    );

    expect([...plannedFirst.data, ...plannedSecond.data].map(({ id }) => id)).toEqual([
      blockedPlanned[0]?.publicId,
      blockedPlanned[1]?.publicId,
    ]);
    expect([...historyFirst.data, ...historySecond.data].map(({ id }) => id)).toEqual([
      blockedLaunched[0]?.publicId,
      blockedLaunched[1]?.publicId,
    ]);
    expect(mocks.runFindMany.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        where: expect.objectContaining({
          launchedAt: null,
          plannedFor: { not: null },
          status: { in: ["planned", "blocked"] },
        }),
      }),
    );
    expect(mocks.raw).toHaveBeenCalledTimes(2);
  });

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
      where: { launchedAt: { not: null }, projectId: "project_1" },
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

    expect(result.data[0]?.budget).toEqual({ capCents: 5_000, spentCents: 1_250 });
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

  it("returns the persisted result depth and fractional cost within the requested project", async () => {
    mocks.runFindFirst.mockResolvedValue({ id: "run_1" });
    mocks.itemFindMany.mockResolvedValue([
      {
        ...item("item_1", new Date()),
        status: "completed",
        rankCheck: {
          costCents: { toString: () => "0.4000" },
          errorCode: null,
          position: null,
          provider: "dataforseo",
          publicId: "check_1",
          rankingUrl: null,
          requestedDepth: 20,
        },
      },
    ]);
    const page = await listRankCheckRunItems(
      "project_1",
      runIds[0] as string,
      new URL("https://example.com/items"),
    );
    expect(page.data[0]?.rankCheck).toMatchObject({
      costCents: 0.4,
      requestedDepth: 20,
      position: null,
    });
    expect(mocks.runFindFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: { projectId: "project_1", publicId: runIds[0] },
    });
    expect(mocks.itemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          rankCheck: {
            select: {
              costCents: true,
              errorCode: true,
              position: true,
              provider: true,
              publicId: true,
              rankingUrl: true,
              requestedDepth: true,
            },
          },
        }),
        where: { runId: "run_1" },
      }),
    );
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
