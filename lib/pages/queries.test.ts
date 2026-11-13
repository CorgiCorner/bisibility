import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectPageSources, getProjectPagesList } from "./queries";

const mocks = vi.hoisted(() => ({
  conversionSources: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
  ga4: vi.fn(),
  gsc: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/conversions/queries", () => ({
  getConversionSources: mocks.conversionSources,
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
    conversionGoal: { findMany: vi.fn(async () => []) },
    project: { findFirst: mocks.findFirst },
    projectDefaults: { findUnique: vi.fn(async () => null) },
    providerConnection: { findFirst: mocks.findFirst, findMany: mocks.findMany },
  },
}));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  readSearchInsightsConnection: mocks.gsc,
}));
vi.mock("@/lib/search-insights/sync/sessions-credentials", () => ({
  readOrganicSessionsConnection: mocks.ga4,
}));

function sqlText(query: unknown) {
  if (typeof query === "object" && query && "sql" in query && typeof query.sql === "string") {
    return query.sql;
  }
  return Array.isArray(query) ? query.join(" ") : "";
}

describe("project page reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversionSources.mockResolvedValue([]);
    mocks.findFirst.mockImplementation((query: { select?: { domain?: boolean } }) => {
      if (query.select?.domain) return { domain: "example.com", id: "project_1" };
      return null;
    });
    mocks.findMany.mockResolvedValue([]);
    mocks.gsc.mockResolvedValue({ connection: null, problem: "missing" });
    mocks.ga4.mockResolvedValue({ connection: null, problem: "missing" });
    mocks.queryRaw.mockImplementation((query: { sql: string }) => {
      if (query.sql.includes('AS "all"')) {
        return [{ all: 1, listed: 0, notListed: 1, total: 1 }];
      }
      return [
        {
          aiCitations: 0,
          checkedAt: null,
          clicks: null,
          coverageState: null,
          firstSeenAt: new Date("2026-10-01T00:00:00.000Z"),
          impressions: null,
          indexGroup: null,
          keywords: 0,
          lastSeenAt: new Date("2026-10-02T00:00:00.000Z"),
          listed: false,
          path: "/pricing",
          position: null,
          presenceId: null,
          sessionValue: null,
          sitemapLastSeenAt: null,
          sources: null,
          verdict: null,
        },
      ];
    });
  });

  it("sorts in SQL and returns null metrics for sources that are not connected", async () => {
    const result = await getProjectPagesList("project_1", {
      page: 1,
      pageSize: 25,
      period: {
        from: new Date("2026-10-01T00:00:00.000Z"),
        to: new Date("2026-10-31T00:00:00.000Z"),
      },
      sort: { by: "impressions", dir: "asc" },
    });
    const rowsQuery = mocks.queryRaw.mock.calls
      .map((call) => call[0])
      .find((query) => query.sql.includes("SELECT * FROM filtered"));

    expect(rowsQuery.sql).toContain("ASC NULLS LAST");
    expect(rowsQuery.sql).toContain("LIMIT");
    expect(rowsQuery.sql).not.toContain("search_analytics_page_daily");
    expect(result.rows[0]?.searchConsole).toBeNull();
    expect(result.rows[0]?.sessions).toBeNull();
    expect(result.rows[0]?.conversions).toBeNull();
    expect(result.conversions).toMatchObject({ connect: true, selected: null });
    expect(rowsQuery.sql).not.toContain("conversion_daily");
    expect(rowsQuery.values ?? []).not.toContain("ga4");
    expect(result.rows[0]?.index).toBeNull();
    expect(result.counts).toEqual({
      all: 1,
      inSnapshot: 0,
      listed: 0,
      new: 0,
      notListed: 1,
      removed: 0,
    });
  });

  it("passes a connected conversion source into the Conv. column", async () => {
    mocks.conversionSources.mockResolvedValue([
      {
        connected: true,
        conversions28: 3,
        label: "GA4",
        lastDay: "2026-10-20",
        primary: true,
        source: "ga4",
      },
    ]);
    const result = await getProjectPagesList("project_1", {
      page: 1,
      pageSize: 25,
      period: {
        from: new Date("2026-10-01T00:00:00.000Z"),
        to: new Date("2026-10-31T00:00:00.000Z"),
      },
      sort: { by: "conversions", dir: "desc" },
    });
    const rowsQuery = mocks.queryRaw.mock.calls
      .map((call) => call[0])
      .find((query) => query.sql.includes("SELECT * FROM filtered"));

    expect(result.conversions).toMatchObject({ connect: false, selected: "ga4" });
    expect(rowsQuery.sql).toContain("conversion_daily");
    expect(rowsQuery.values).toContain("ga4");
  });

  it("reports page indexing as beta only when Search Console is connected", async () => {
    mocks.findFirst.mockResolvedValue({ id: "project_1", sitemapMonitoringEnabled: true });
    mocks.queryRaw.mockResolvedValue([
      {
        aiCitations: 0,
        aiPages: 0,
        checked: 1,
        ga4Pages: 0,
        keywords: 2,
        listed: 0,
        monthsStored: 0,
        plausiblePages: 0,
        presenceTotal: 4,
        prompts: 0,
        rankPages: 1,
        searchConsolePages: 0,
      },
    ]);
    mocks.gsc.mockResolvedValue({
      connection: { connectionId: "c", credentials: {}, property: "sc-domain:example.com" },
      problem: null,
    });

    const sources = await getProjectPageSources("project_1");
    expect(sources.find((source) => source.kind === "page_indexing")).toMatchObject({
      note: "1 checked of 4",
      state: "beta",
    });
    expect(sources.find((source) => source.kind === "rank_tracker")?.state).toBe("connected");
  });

  it("filters by tag and attaches that page's tags in one extra query", async () => {
    mocks.queryRaw.mockImplementation((query: unknown) => {
      const sql = sqlText(query);
      if (sql.includes('AS "all"')) {
        return [{ all: 1, listed: 1, notListed: 0, total: 1 }];
      }
      if (sql.includes("SELECT * FROM filtered")) {
        return [
          {
            aiCitations: 0,
            checkedAt: null,
            clicks: null,
            coverageState: null,
            firstSeenAt: new Date("2026-10-01T00:00:00.000Z"),
            id: "page_1",
            impressions: null,
            indexGroup: null,
            keywords: 0,
            lastSeenAt: new Date("2026-10-02T00:00:00.000Z"),
            listed: true,
            path: "/docs",
            position: null,
            presenceId: null,
            sessionValue: null,
            sitemapLastSeenAt: null,
            sources: null,
            verdict: null,
          },
        ];
      }
      return [{ name: "Docs", pageId: "page_1", tagId: "tag_docs" }];
    });

    const result = await getProjectPagesList("project_1", {
      page: 1,
      pageSize: 25,
      period: {
        from: new Date("2026-10-01T00:00:00.000Z"),
        to: new Date("2026-10-31T00:00:00.000Z"),
      },
      sort: { by: "clicks", dir: "desc" },
      tagId: "tag_docs",
    });

    expect(result.rows[0]?.tags).toEqual([{ id: "tag_docs", name: "Docs" }]);
    const listQuery = mocks.queryRaw.mock.calls
      .map((call) => {
        const query = call[0] as { sql?: unknown; values?: unknown };
        return typeof query?.sql === "string"
          ? { sql: query.sql, values: Array.isArray(query.values) ? query.values : [] }
          : null;
      })
      .find((query) => query?.sql.includes("SELECT * FROM filtered"));
    expect(listQuery?.sql).toContain('FROM "page_tags"');
    expect(listQuery?.values).toContain("tag_docs");
    expect(
      mocks.queryRaw.mock.calls.filter((call) => {
        return sqlText(call[0]).includes('AS "tagId"');
      }),
    ).toHaveLength(1);
  });
});
