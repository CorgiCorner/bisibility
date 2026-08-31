import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    searchAnalyticsSyncPartition: { groupBy: vi.fn() },
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const { coverageShare, getQueryCoverage } = await import("./coverage");

const window = { end: "2026-07-08", start: "2026-06-11" };

describe("coverageShare", () => {
  it("rounds to whole percent, and calls a share of nothing zero", () => {
    expect(coverageShare(62n, 100n)).toBe(62);
    expect(coverageShare(1, 3)).toBe(33);
    expect(coverageShare(5, 0)).toBe(0);
  });
});

describe("getQueryCoverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        namedClicks: 7_738n,
        namedImpressions: 199_387n,
        totalClicks: 12_480n,
        totalImpressions: 486_310n,
      },
    ]);
    mocks.prisma.searchAnalyticsSyncPartition.groupBy.mockResolvedValue([]);
  });

  it("divides the named query table by the aggregate table", async () => {
    const coverage = await getQueryCoverage("project_1", "sc-domain:example.com", window);

    expect(coverage.clicksShare).toBe(62);
    expect(coverage.impressionsShare).toBe(41);
    const statement = mocks.prisma.$queryRaw.mock.calls[0]?.[0];
    expect(statement.sql).toContain('FROM "search_analytics_query_daily"');
    expect(statement.sql).toContain('FROM "search_analytics_daily"');
  });

  it("counts the days the provider stopped at its row ceiling, not the request sets", async () => {
    mocks.prisma.searchAnalyticsSyncPartition.groupBy.mockResolvedValue([
      { date: new Date("2026-06-20T00:00:00.000Z") },
      { date: new Date("2026-06-21T00:00:00.000Z") },
    ]);

    const coverage = await getQueryCoverage("project_1", "sc-domain:example.com", window);

    expect(coverage.capHitDays).toBe(2);
    expect(mocks.prisma.searchAnalyticsSyncPartition.groupBy).toHaveBeenCalledWith({
      by: ["date"],
      where: {
        capHit: true,
        date: {
          gte: new Date("2026-06-11T00:00:00.000Z"),
          lte: new Date("2026-07-08T00:00:00.000Z"),
        },
        dimensions: { in: ["query", "page", "query,page"] },
        projectId: "project_1",
        property: "sc-domain:example.com",
        searchType: "web",
        source: "gsc",
      },
    });
  });

  it("still reports the ceiling days when the window holds no rows at all", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);
    mocks.prisma.searchAnalyticsSyncPartition.groupBy.mockResolvedValue([
      { date: new Date("2026-06-20T00:00:00.000Z") },
    ]);

    await expect(getQueryCoverage("project_1", "sc-domain:example.com", window)).resolves.toEqual({
      calculable: false,
      capHitDays: 1,
      clicksShare: 0,
      impressionsShare: 0,
    });
  });
});
