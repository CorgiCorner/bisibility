import { DRAWER_LIST_ROWS } from "@/lib/search-insights/constants";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() }, scope: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("./context", () => ({ loadSearchInsightsScope: mocks.scope }));

const { getPageDetail, loadPageDetail } = await import("./page-detail");

const window = { end: "2026-07-08", start: "2026-07-07" };

const days = [
  {
    clicks: 8n,
    date: new Date("2026-07-07T00:00:00.000Z"),
    impressions: 200n,
    positionWeight: 900,
  },
];

const queries = [
  { clicks: 5n, position: 3.2, query: "stored query", total: 12n },
  { clicks: 3n, position: 7.8, query: "another stored query", total: 12n },
];

describe("getPageDetail", () => {
  beforeEach(() => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw.mockResolvedValueOnce(days).mockResolvedValueOnce(queries);
  });

  it("reads the page from its own daily table and the pivot from the query-by-page one", async () => {
    await getPageDetail("project_1", "sc-domain:example.com", window, "https://example.com/guide");

    const [pageSql, pivotSql] = mocks.prisma.$queryRaw.mock.calls.map((call) => call[0].sql);
    expect(pageSql).toContain('FROM "search_analytics_page_daily"');
    expect(pivotSql).toContain('FROM "search_analytics_query_page_daily"');
    expect(pivotSql).toContain('ORDER BY SUM("clicks") DESC');
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].values).toContain(DRAWER_LIST_ROWS);
  });

  it("addresses the day rows by the indexed key hash rather than the unindexed text column", async () => {
    await getPageDetail("project_1", "sc-domain:example.com", window, "https://example.com/guide");

    const [pageSql] = mocks.prisma.$queryRaw.mock.calls.map((call) => call[0].sql);
    expect(pageSql).toContain('"keyHash" = ');
    expect(pageSql).not.toContain('"page" = ');
    expect(mocks.prisma.$queryRaw.mock.calls[0]?.[0].values).toContain(
      dimensionKeyHash(["https://example.com/guide"]),
    );
  });

  it("names the page by its path and keeps the address whole for the link", async () => {
    const detail = await getPageDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "https://example.com/guide?x=1",
    );

    expect(detail.path).toBe("/guide?x=1");
    expect(detail.url).toBe("https://example.com/guide?x=1");
    expect(detail.perDay).toEqual([
      { clicks: 8, date: "2026-07-07" },
      { clicks: 0, date: "2026-07-08" },
    ]);
    expect(detail.queries.total).toBe(12);
  });

  it("leaves page metrics absent rather than reporting zeros it never read", async () => {
    const detail = await getPageDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "https://example.com/guide",
    );

    expect(detail).toMatchObject({ engagementRate: null, keyEvents: null, sessions: null });
  });

  it("returns the real page metrics after every contributing day has been reread", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce(days)
      .mockResolvedValueOnce(queries)
      .mockResolvedValueOnce([{ engagedSessions: 21n, keyEvents: 3n, sessions: 42n }]);

    const detail = await getPageDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "https://example.com/guide/",
      "123456789",
    );

    expect(detail).toMatchObject({ engagementRate: 0.5, keyEvents: 3, sessions: 42 });
    const statement = mocks.prisma.$queryRaw.mock.calls[2]?.[0];
    expect(statement.sql).toContain('FROM "organic_sessions_page_daily"');
    expect(statement.sql).toContain(
      'CASE WHEN bool_or("engagedSessions" IS NULL) THEN NULL ELSE SUM("engagedSessions") END AS "engagedSessions"',
    );
    expect(statement.sql).toContain(
      'CASE WHEN bool_or("keyEvents" IS NULL) THEN NULL ELSE SUM("keyEvents") END AS "keyEvents"',
    );
    expect(statement.values).toContain(dimensionKeyHash(["/guide"]));
  });

  it("keeps mixed reread page metrics unknown for the whole window", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce(days)
      .mockResolvedValueOnce(queries)
      .mockResolvedValueOnce([{ engagedSessions: null, keyEvents: null, sessions: 42n }]);

    const detail = await getPageDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "https://example.com/guide",
      "123456789",
    );

    expect(detail).toMatchObject({ engagementRate: null, keyEvents: null, sessions: 42 });
    expect(mocks.prisma.$queryRaw.mock.calls[2]?.[0].sql).toContain(
      'CASE WHEN bool_or("engagedSessions" IS NULL) THEN NULL ELSE SUM("engagedSessions") END AS "engagedSessions"',
    );
  });

  it("preserves NULL page aggregates rather than changing them to zero", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce(days)
      .mockResolvedValueOnce(queries)
      .mockResolvedValueOnce([{ engagedSessions: null, keyEvents: null, sessions: null }]);

    const detail = await getPageDetail(
      "project_1",
      "sc-domain:example.com",
      window,
      "https://example.com/guide",
      "123456789",
    );

    expect(detail).toMatchObject({ engagementRate: null, keyEvents: null, sessions: null });
  });
});

describe("loadPageDetail", () => {
  it("re-resolves the requested archived property through the authorized scope", async () => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    await loadPageDetail("prj_1", {
      page: "https://example.com/guide",
      period: "28",
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: "28",
      property: "sc-domain:archived.example.com",
    });
  });

  it("still names the page when the property has no finalized window", async () => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue({ projectId: "project_1", property: null, window: null });

    const detail = await loadPageDetail("prj_1", { page: "https://example.com/guide" });

    expect(detail.path).toBe("/guide");
    expect(detail.queries).toEqual({ rows: [], total: 0 });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });

  it("does not join sessions until their import covers the full compared window", async () => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValueOnce(days).mockResolvedValueOnce(queries);
    mocks.scope.mockResolvedValue({
      organicSessions: {
        importState: {
          capHitDays: 0,
          cursorDate: "2026-07-05",
          daysDone: 30,
          daysTotal: 488,
          earliestTargetDate: "2025-03-14",
          finalizedThroughDate: "2026-07-08",
          lastProbeAt: null,
          lastSyncStartedAt: null,
          newestFinalizedDate: "2026-07-08",
          pausedReason: null,
          state: "running",
        },
        property: "123456789",
        status: "connected",
      },
      projectId: "project_1",
      property: "sc-domain:example.com",
      window: {
        current: window,
        previous: { end: "2026-07-06", start: "2026-07-05" },
      },
    });

    const detail = await loadPageDetail("prj_1", { page: "https://example.com/guide" });

    expect(detail.sessions).toBeNull();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
  });
});
