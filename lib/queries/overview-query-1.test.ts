import { hostOrganicReportPolicy, RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { beforeEach, describe, expect, it } from "vitest";
import {
  activeMarketScope,
  getOverviewMocks,
  keyword,
  now,
  rankCheck,
  resetOverviewMocks,
} from "./overview-query.test-fixture";

const { getOverview } = await import("./overview");
const mocks = getOverviewMocks();

describe("overview query", () => {
  beforeEach(() => {
    resetOverviewMocks();
  });

  it("aggregates real rank history into KPIs, trend, buckets, movers and freshness", async () => {
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      frequency: "weekly",
      nextCheckAt: new Date("2026-06-29T12:00:00.000Z"),
      timezone: "America/New_York",
    });
    mocks.prisma.providerConnection.findMany.mockResolvedValue([
      {
        enabled: true,
        kind: "serp",
        provider: "dataforseo",
        status: "connected",
      },
    ]);
    mocks.prisma.apiKey.findFirst.mockResolvedValue({
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
      lastUsedAt: new Date("2026-06-27T12:00:00.000Z"),
      prefix: "bsb_key_live_abcd",
    });
    mocks.prisma.keyword.count.mockResolvedValue(5);
    mocks.prisma.rankCheck.findMany.mockResolvedValue([
      { id: "check1", status: "completed" },
      { id: "check2", status: "completed" },
    ]);
    mocks.ledger.mockResolvedValue(
      new Map([
        ["check1", { costCents: 123, receiptCount: 1 }],
        ["check2", { costCents: 0, receiptCount: 1 }],
      ]),
    );
    mocks.prisma.rankCheck.findFirst.mockResolvedValue({
      checkedAt: new Date("2026-06-28T10:00:00.000Z"),
      provider: "serpapi",
    });
    mocks.prisma.tag.findMany.mockResolvedValue([{ name: "Docs" }, { name: "Product" }]);
    mocks.prisma.keyword.findMany.mockResolvedValue([
      keyword({
        publicId: "kw_headless",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T10:00:00.000Z"),
            position: 3,
            previousPosition: 8,
            rankingUrl: "/headless-cms",
          }),
          rankCheck({
            checkedAt: new Date("2026-05-31T10:00:00.000Z"),
            position: 8,
            previousPosition: 10,
            rankingUrl: "/headless-cms",
          }),
        ],
        text: "headless cms",
      }),
      keyword({
        device: "mobile",
        publicId: "kw_grid",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T10:00:00.000Z"),
            position: 14,
            previousPosition: 6,
            rankingUrl: "/docs/grid",
          }),
          rankCheck({
            checkedAt: new Date("2026-05-31T10:00:00.000Z"),
            position: 6,
            previousPosition: 7,
            rankingUrl: "/docs/grid",
          }),
        ],
        text: "react data grid",
      }),
      keyword({
        publicId: "kw_analytics",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-27T10:00:00.000Z"),
            position: 9,
            previousPosition: 12,
            rankingUrl: "/analytics",
          }),
          rankCheck({
            checkedAt: new Date("2026-05-31T10:00:00.000Z"),
            position: 12,
            previousPosition: 18,
            rankingUrl: "/analytics",
          }),
        ],
        text: "open source analytics",
      }),
      keyword({
        createdAt: new Date("2026-06-28T08:00:00.000Z"),
        publicId: "kw_pending",
        text: "pending keyword",
      }),
      keyword({
        publicId: "kw_failed",
        rankChecks: [
          rankCheck({
            checkedAt: new Date("2026-06-28T09:00:00.000Z"),
            position: null,
            previousPosition: null,
            rankingUrl: null,
            status: "failed",
          }),
        ],
        text: "failed keyword",
      }),
    ]);

    const result = await getOverview("prj_1", { now });

    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
    expect(mocks.prisma.projectDefaults.findUnique).toHaveBeenCalledWith({
      select: {
        cronExpression: true,
        frequency: true,
        jitterMinutes: true,
        nextCheckAt: true,
        timezone: true,
      },
      where: { projectId: "project_1" },
    });
    expect(mocks.prisma.providerConnection.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ kind: true }),
        where: {
          OR: [{ kind: "serp" }, { enabled: true, kind: "analytics", status: "connected" }],
          projectId: "project_1",
        },
      }),
    );
    const keywordFindArgs = mocks.prisma.keyword.findMany.mock.calls[0]?.[0];
    expect(keywordFindArgs).toMatchObject({
      select: {
        _count: { select: { rankChecks: { where: { status: { not: "deferred" } } } } },
        createdAt: true,
        device: true,
        publicId: true,
        text: true,
        rankChecks: {
          select: {
            checkedAt: true,
            createdAt: true,
            position: true,
            previousPosition: true,
            rankingUrl: true,
            status: true,
            observationRun: expect.any(Object),
          },
          where: { createdAt: { lte: now } },
        },
      },
      take: 500,
      orderBy: { id: "asc" },
      where: {
        AND: [{ ...activeMarketScope, projectId: "project_1" }, { createdAt: { lte: now } }],
      },
    });
    expect(keywordFindArgs).not.toHaveProperty("include");
    expect(keywordFindArgs.select.rankChecks).not.toHaveProperty("take");
    expect(keywordFindArgs.select.rankChecks.select).not.toHaveProperty("raw");
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      maxWait: 2_000,
      timeout: 15_000,
    });
    expect(mocks.metadata).toHaveBeenCalledWith(
      mocks.prisma,
      { id: "project_1", publicId: "prj_1" },
      expect.arrayContaining([
        expect.objectContaining({ id: "kw_headless", publicId: "kw_headless" }),
      ]),
      now,
    );
    expect(result).toMatchObject({
      gettingStarted: {
        gscOAuthConfigured: true,
        hasAnalyticsSource: false,
        hasCheck: true,
        hasKeywords: true,
        projectId: "prj_1",
        providerConnected: true,
      },
      hasEverChecked: true,
      lastCheckEverAt: new Date("2026-06-28T10:00:00.000Z"),
      projectReadOnly: false,
      state: "populated",
      toolbar: {
        availableTags: ["Docs", "Product"],
        deviceValue: "all",
        rangeValue: "28d",
        tagValue: null,
      },
      trackedKeywordCount: 5,
    });
    expect(result.toolbar).not.toHaveProperty("refresh");
    expect(result.nextCheckAt).toBeInstanceOf(Date);
    expect(result.kpis).toEqual([
      {
        delta: { kind: "averageComparison", value: 0 },
        deltaTone: "neutral",
        id: "averagePosition",
        value: 8.666666666666666,
      },
      {
        delta: { kind: "countThisMonth", value: 5 },
        deltaTone: "neutral",
        id: "trackedKeywords",
        value: 5,
      },
      { delta: { kind: "countChange", value: 0 }, deltaTone: "neutral", id: "inTop10", value: 2 },
      {
        delta: { kind: "percentagePointChange", value: 5 },
        deltaTone: "positive",
        id: "visibility",
        value: 19,
      },
    ]);
    expect(result.qualityReport.counts.comparable).toBe(3);
    expect(result.visibilityCoverage).toEqual({ limited: false, measured: 3, total: 5 });
    expect(result.trend).toHaveLength(28);
    expect(
      result.trend
        .filter(({ value }) => value !== null)
        .map(({ dateKey, label, value }) => ({ dateKey, label, value })),
    ).toEqual([
      { dateKey: "2026-06-27", label: "2026-06-27", value: 9 },
      { dateKey: "2026-06-28", label: "2026-06-28", value: 8.5 },
    ]);
    expect(result.reportHistory).toMatchObject({
      population: "frozen_selected_targets",
      weights: "frozen_at_report_watermark",
      timeZone: "America/New_York",
    });
    expect(result.distribution.map((bucket) => [bucket.label, bucket.count])).toEqual([
      ["#1-3", 1],
      ["#4-10", 1],
      ["#11-20", 1],
      ["#21-50", 0],
      ["#51-100", 0],
    ]);
    expect(result.dataSource).toMatchObject({
      checksThisMonth: 2,
      lastCheckProvider: "serpapi",
      primaryProvider: "dataforseo",
      providerCostCents: 123,
      status: "healthy",
    });
    expect(result.highlights.find((list) => list.kind === "wins")?.rows[0]).toMatchObject({
      delta: { direction: "up", value: 5 },
      id: "kw_headless",
    });
    expect(result.highlights.find((list) => list.kind === "attention")?.rows[0]).toMatchObject({
      id: "kw_failed",
      note: { kind: "latestCheckFailed" },
    });
    expect(result.highlights.find((list) => list.kind === "newTop10")?.rows[0]).toMatchObject({
      id: "kw_analytics",
      position: 9,
    });
  });
  it("releases the owned read transaction before pure measurement-policy projection", async () => {
    const { loadOverviewMetricData } = await import("./overview-data");
    let inTransaction = false;
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      inTransaction = true;
      try {
        return await callback(mocks.prisma);
      } finally {
        inTransaction = false;
      }
    });
    mocks.prisma.keyword.findMany.mockResolvedValue([keyword()]);
    const result = await loadOverviewMetricData("project_1", {}, now, {
      report: {
        asOf: now,
        limits: RANK_REPORT_HOST_LIMITS,
        loadMetadata: mocks.metadata,
        policyAt: (at) => {
          expect(inTransaction).toBe(false);
          return hostOrganicReportPolicy(at, 28);
        },
      },
    });
    expect(result.keywords).toHaveLength(1);
    expect(result.keywords[0].measurementPolicy.asOf).toEqual(now);
  });
});
