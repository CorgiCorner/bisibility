import { Prisma } from "@/lib/generated/prisma/client";
import {
  DRAWER_LIST_CAP,
  DRAWER_LIST_ROWS,
  MIN_PAGE_CLICKS,
  OVERLAP_SPLIT_ROWS,
} from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { $queryRaw: vi.fn(), $transaction: vi.fn() },
  scope: vi.fn(),
  tx: { $executeRaw: vi.fn(), $queryRaw: vi.fn() },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./context", () => ({ loadSearchInsightsScope: mocks.scope }));

const { getOverlapQueries, loadOverlapQueries } = await import("./overlap-list");
const { overlapQueriesSql } = await import("./signals");

const window = { end: "2026-07-08", start: "2026-06-11" };

const rows = [
  { clicks: 90n, pages: 3n, position: 6.4, query: "stored query", total: 12n },
  { clicks: 40n, pages: 2n, position: null, query: "another stored query", total: 12n },
];

const splits = [
  { clicks: 60n, page: "https://example.com/guide", query: "stored query" },
  { clicks: 20n, page: "https://example.com/blog", query: "stored query" },
  { clicks: 30n, page: "https://example.com/docs", query: "another stored query" },
];

function statements() {
  return [
    ...mocks.tx.$queryRaw.mock.calls.map((call) => call[0]),
    ...mocks.prisma.$queryRaw.mock.calls.map((call) => call[0]),
  ];
}

describe("getOverlapQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation((run) => run(mocks.tx));
    mocks.tx.$executeRaw.mockResolvedValue(0);
    mocks.tx.$queryRaw.mockResolvedValueOnce(rows);
    mocks.prisma.$queryRaw.mockResolvedValueOnce(splits);
  });

  it("wraps the chip's own predicate, so the count and the list cannot disagree", async () => {
    await getOverlapQueries("project_1", "sc-domain:example.com", window);

    const shared = overlapQueriesSql(Prisma.sql`"projectId" = ${"project_1"}`);
    const selection = shared.sql
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("WHERE"));
    for (const fragment of selection) {
      expect(statements()[0].sql).toContain(fragment);
    }
    expect(statements()[0].sql).toContain('AS "overlap"');
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it("carries the query's own average position, so the row reads like the band rows", async () => {
    const list = await getOverlapQueries("project_1", "sc-domain:example.com", window);

    expect(statements()[0].sql).toContain('AS "ranking" ON "ranking"."query" = "overlap"."query"');
    expect(statements()[0].sql).toContain('FROM "search_analytics_query_daily"');
    expect(list.rows.map((row) => row.position)).toEqual([6.4, null]);
  });

  it("puts the most clicks first and stops at the rows a drawer opens with", async () => {
    await getOverlapQueries("project_1", "sc-domain:example.com", window);

    expect(statements()[0].sql).toContain('ORDER BY "overlap"."clicks" DESC');
    expect(statements()[0].values).toContain(DRAWER_LIST_ROWS);
  });

  it("proves each overlap with the busiest pages, under the same page floor the count uses", async () => {
    const list = await getOverlapQueries("project_1", "sc-domain:example.com", window);

    expect(statements()[1].values).toEqual(
      expect.arrayContaining([MIN_PAGE_CLICKS, OVERLAP_SPLIT_ROWS, "stored query"]),
    );
    expect(statements()[1].sql).toContain('"clicks" >= ');
    expect(list.rows[0]).toEqual({
      clicks: 90,
      pages: 3,
      position: 6.4,
      query: "stored query",
      split: [
        { clicks: 60, path: "/guide", url: "https://example.com/guide" },
        { clicks: 20, path: "/blog", url: "https://example.com/blog" },
      ],
    });
    expect(list.total).toBe(12);
  });

  it("reaches the rest on request, and never past the cap", async () => {
    await getOverlapQueries("project_1", "sc-domain:example.com", window, {
      limit: DRAWER_LIST_CAP * 4,
    });

    expect(statements()[0].values).toContain(DRAWER_LIST_CAP);
  });

  it("asks for no split at all when the window holds no overlap", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.tx.$queryRaw.mockReset();
    mocks.tx.$queryRaw.mockResolvedValueOnce([]);

    await expect(getOverlapQueries("project_1", "sc-domain:example.com", window)).resolves.toEqual({
      rows: [],
      total: 0,
    });
    expect(mocks.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("loadOverlapQueries", () => {
  it("re-resolves an archived property before reading its list", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    await loadOverlapQueries("prj_1", {
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: undefined,
      property: "sc-domain:archived.example.com",
    });
  });

  it("reads nothing for a property with no finalized window", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    await expect(loadOverlapQueries("prj_1", {})).resolves.toEqual({ rows: [], total: 0 });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
