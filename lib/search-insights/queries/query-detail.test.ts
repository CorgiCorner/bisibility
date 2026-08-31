import { DRAWER_LIST_ROWS } from "@/lib/search-insights/constants";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn() },
  scope: vi.fn(),
  tracked: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./context", () => ({ loadSearchInsightsScope: mocks.scope }));
vi.mock("./tracked", () => ({ getTrackedQueryTexts: mocks.tracked }));

const { getQueryDetail, loadQueryDetail } = await import("./query-detail");

const window = { end: "2026-07-08", start: "2026-07-06" };

const days = [
  {
    clicks: 6n,
    date: new Date("2026-07-06T00:00:00.000Z"),
    impressions: 100n,
    positionWeight: 620,
  },
  {
    clicks: 4n,
    date: new Date("2026-07-08T00:00:00.000Z"),
    impressions: 100n,
    positionWeight: 480,
  },
];

const pages = [
  { clicks: 7n, page: "https://example.com/guide", position: 4.4, total: 2n },
  { clicks: 3n, page: "https://example.com/blog", position: 9.2, total: 2n },
];

function statements() {
  return mocks.prisma.$queryRaw.mock.calls.map((call) => call[0].sql as string);
}

describe("getQueryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValueOnce(days).mockResolvedValueOnce(pages);
    mocks.tracked.mockResolvedValue(new Set<string>());
  });

  it("folds the window from the day rows and fills the days the provider named nothing for", async () => {
    const detail = await getQueryDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "stored query",
    );

    expect(detail.stats).toEqual({ clicks: 10, ctr: 0.05, impressions: 200, position: 5.5 });
    expect(detail.perDay).toEqual([
      { clicks: 6, date: "2026-07-06" },
      { clicks: 0, date: "2026-07-07" },
      { clicks: 4, date: "2026-07-08" },
    ]);
  });

  it("reads the pivot from the query-by-page table, so a page carries its position on THIS query", async () => {
    await getQueryDetail("project_1", "sc-domain:example.com", window, "stored query");

    expect(statements()[0]).toContain('FROM "search_analytics_query_daily"');
    expect(statements()[1]).toContain('FROM "search_analytics_query_page_daily"');
    expect(statements()[1]).toContain('ORDER BY SUM("clicks") DESC');
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].values).toContain(DRAWER_LIST_ROWS);
  });

  it("addresses the day rows by the indexed key hash rather than the unindexed text column", async () => {
    await getQueryDetail("project_1", "sc-domain:example.com", window, "stored query");

    expect(statements()[0]).toContain('"keyHash" = ');
    expect(statements()[0]).not.toContain('"query" = ');
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.[0].values).toContain(
      dimensionKeyHash(["stored query"]),
    );
  });

  it("carries the pages as slices with the count the window holds", async () => {
    const detail = await getQueryDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "stored query",
    );

    expect(detail.pages.total).toBe(2);
    expect(detail.pages.rows.map((row) => row.path)).toEqual(["/guide", "/blog"]);
  });

  it("asks Rank Tracker whether this query is already checked", async () => {
    mocks.tracked.mockResolvedValue(new Set(["stored query"]));

    const detail = await getQueryDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "Stored Query",
    );

    expect(mocks.tracked).toHaveBeenCalledWith("project_1", ["Stored Query"]);
    expect(detail.tracked).toBe(true);
  });
});

describe("loadQueryDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tracked.mockResolvedValue(new Set<string>());
  });

  it("takes the property and the window from the scope rather than from the caller", async () => {
    mocks.scope.mockResolvedValue({
      projectId: "project_1",
      property: "sc-domain:example.com",
      window: { current: window, previous: window },
    });
    mocks.prisma.$queryRaw.mockResolvedValueOnce(days).mockResolvedValueOnce(pages);

    await loadQueryDetail("prj_1", {
      period: "28",
      property: "sc-domain:archived.example.com",
      query: "stored query",
    });

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: "28",
      property: "sc-domain:archived.example.com",
    });
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.[0].values).toContain("sc-domain:example.com");
  });

  it("keeps active fallback distinct from an archived requested scope", async () => {
    mocks.scope.mockImplementation((_projectRef, options) =>
      Promise.resolve({
        projectId: "project_1",
        property: options.property ?? "sc-domain:active.example.com",
        window: { current: window, previous: window },
      }),
    );
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce(days)
      .mockResolvedValueOnce(pages)
      .mockResolvedValueOnce(days)
      .mockResolvedValueOnce(pages);

    await loadQueryDetail("prj_1", { query: "stored query" });
    await loadQueryDetail("prj_1", {
      property: "sc-domain:archived.example.com",
      query: "stored query",
    });

    expect(mocks.scope.mock.calls).toEqual([
      ["prj_1", { period: undefined, property: undefined }],
      ["prj_1", { period: undefined, property: "sc-domain:archived.example.com" }],
    ]);
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.[0].values).toContain(
      "sc-domain:active.example.com",
    );
    expect(mocks.prisma.$queryRaw.mock.calls[2]?.[0].values).toContain(
      "sc-domain:archived.example.com",
    );
  });

  it("reads nothing at all for a property with no finalized window", async () => {
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    const detail = await loadQueryDetail("prj_1", { query: "stored query" });

    expect(detail).toEqual({
      pages: { rows: [], total: 0 },
      perDay: [],
      query: "stored query",
      stats: { clicks: 0, ctr: 0, impressions: 0, position: 0 },
      tracked: false,
    });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
