import { Prisma } from "@/lib/generated/prisma/client";
import {
  MIN_BAND_IMPRESSIONS,
  MIN_PAGE_CLICKS,
  MIN_QUERY_CLICKS,
  OVERLAP_FLOOR_SHARE,
  POSITION_BAND,
} from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const {
  getOverlapCount,
  getPositionBandCount,
  getSearchInsightsSignals,
  overlapQueriesSql,
  positionBandQuerySql,
} = await import("./signals");

const window = { end: "2026-07-08", start: "2026-06-11" };
const filter = Prisma.sql`"projectId" = ${"project_1"}`;

function statement() {
  return mocks.prisma.$queryRaw.mock.calls[0]?.[0];
}

describe("positionBandQuerySql", () => {
  it("selects by aggregated position inside the named band, with a demand floor", () => {
    const sql = positionBandQuerySql(filter);

    expect(sql.sql).toContain('FROM "search_analytics_query_daily"');
    expect(sql.sql).toContain("BETWEEN");
    expect(sql.values).toEqual([
      "project_1",
      MIN_BAND_IMPRESSIONS,
      POSITION_BAND.min,
      POSITION_BAND.max,
    ]);
  });
});

describe("overlapQueriesSql", () => {
  it("reads the query-by-page pivot only, so the chip and its evidence cannot disagree", () => {
    const sql = overlapQueriesSql(filter);

    expect(sql.sql).toContain('FROM "search_analytics_query_page_daily"');
    expect(sql.sql).not.toContain("search_analytics_query_daily");
  });

  it("carries both volume floors, the page one and the share of the busiest query", () => {
    const sql = overlapQueriesSql(filter);

    expect(sql.values).toEqual([
      "project_1",
      MIN_PAGE_CLICKS,
      2,
      MIN_QUERY_CLICKS,
      OVERLAP_FLOOR_SHARE,
    ]);
  });
});

describe("signal counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([{ count: 34n }]);
  });

  it("counts exactly the rows the drawer will list", async () => {
    await expect(getPositionBandCount("project_1", "sc-domain:example.com", window)).resolves.toBe(
      34,
    );
    // The count wraps the shared selection instead of restating its rules.
    expect(statement().sql).toContain('SELECT COUNT(*) AS "count" FROM (');
    expect(statement().sql).toContain('FROM "search_analytics_query_daily"');
  });

  it("counts the overlaps from the same selection", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([{ count: 12n }]);

    await expect(getOverlapCount("project_1", "sc-domain:example.com", window)).resolves.toBe(12);
    expect(statement().sql).toContain('FROM "search_analytics_query_page_daily"');
  });

  it("reports zero for a window that returned nothing", async () => {
    mocks.prisma.$queryRaw.mockResolvedValue([]);

    await expect(getPositionBandCount("project_1", "sc-domain:example.com", window)).resolves.toBe(
      0,
    );
  });

  it("reads both chips together", async () => {
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([{ count: 34n }])
      .mockResolvedValueOnce([{ count: 12n }]);

    await expect(
      getSearchInsightsSignals("project_1", "sc-domain:example.com", window),
    ).resolves.toEqual({ bandCount: 34, overlapCount: 12 });
  });
});
