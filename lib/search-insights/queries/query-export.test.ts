import { SEARCH_INSIGHTS_EXPORT_ROW_CAP } from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
  scope: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./context", () => ({ loadSearchInsightsScope: mocks.scope }));

const { getSearchInsightsQueryCsv, searchInsightsQueryCsv } = await import("./query-export");

const connectedScope = {
  projectId: "internal_1",
  property: "sc-domain:example.com",
  window: {
    current: { end: "2026-07-08", start: "2026-06-11" },
    previous: { end: "2026-06-10", start: "2026-05-14" },
  },
};

describe("searchInsightsQueryCsv", () => {
  it("heads the file with the stored columns and one row per query", () => {
    const result = searchInsightsQueryCsv({
      property: "sc-domain:example.com",
      rows: [
        { clicks: 412n, impressions: 9120n, positionWeight: 66_576, query: "rank tracker" },
        { clicks: 96n, impressions: 4010n, positionWeight: 52_130, query: "serp checker" },
      ],
      window: { end: "2026-07-08", start: "2026-06-11" },
    });

    expect(result).toEqual({
      csv: [
        "query,clicks,impressions,ctr,avg_position",
        "rank tracker,412,9120,0.0452,7.30",
        "serp checker,96,4010,0.0239,13.00",
      ].join("\n"),
      filename: "search-insights-queries-example-com-2026-06-11-2026-07-08.csv",
      rows: 2,
      truncated: false,
    });
  });
});

describe("getSearchInsightsQueryCsv", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue(connectedScope);
    mocks.prisma.$queryRaw.mockResolvedValue([
      { clicks: 412n, impressions: 9120n, positionWeight: 66_576, query: "rank tracker" },
    ]);
  });

  it("aggregates every stored row in the finalized window, not a page of a table", async () => {
    const result = await getSearchInsightsQueryCsv("prj_1", "90");

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", { period: "90" });
    // One statement only: the export never pays for the context row counts.
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(result.rows).toBe(1);
    expect(result.csv).toContain("rank tracker,412,9120,0.0452,7.30");
  });

  it("caps one click at the export ceiling and says the file stops there", async () => {
    const rows = Array.from({ length: SEARCH_INSIGHTS_EXPORT_ROW_CAP }, (_unused, index) => ({
      clicks: 1n,
      impressions: 10n,
      positionWeight: 100,
      query: `query ${index}`,
    }));
    mocks.prisma.$queryRaw.mockResolvedValue(rows);

    const result = await getSearchInsightsQueryCsv("prj_1", "90");

    const statement = mocks.prisma.$queryRaw.mock.calls[0][0];
    expect(statement.sql).toContain("LIMIT");
    expect(statement.values).toContain(SEARCH_INSIGHTS_EXPORT_ROW_CAP);
    expect(result.rows).toBe(SEARCH_INSIGHTS_EXPORT_ROW_CAP);
    expect(result.truncated).toBe(true);
  });

  it("returns the header alone while no finalized window exists", async () => {
    mocks.scope.mockResolvedValue({ projectId: "internal_1", property: null, window: null });

    const result = await getSearchInsightsQueryCsv("prj_1");

    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
    expect(result).toEqual({
      csv: "query,clicks,impressions,ctr,avg_position",
      filename: "search-insights-queries-property-no-window.csv",
      rows: 0,
      truncated: false,
    });
  });
});
