import { ROWS_PAGE_LIMIT } from "@/lib/search-insights/constants";
import { dimensionKeyHash } from "@/lib/search-insights/keys";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { pageHref, pagePath } from "./top-rows-model";

const mocks = vi.hoisted(() => ({ prisma: { $queryRaw: vi.fn() } }));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));

const { getTopPages, getTopQueries } = await import("./top-rows");

const window = { end: "2026-07-08", start: "2026-06-11" };

function statement() {
  return mocks.prisma.$queryRaw.mock.calls[0]?.[0];
}

describe("pagePath", () => {
  it("keeps the part that tells two pages apart and drops the shared origin", () => {
    expect(pagePath("https://example.com/blog/post?utm=x")).toBe("/blog/post?utm=x");
    expect(pagePath("https://example.com/")).toBe("/");
  });

  it("shows a value the provider returned that is not a URL exactly as stored", () => {
    expect(pagePath("android-app://com.example")).toBe("android-app://com.example");
  });
});

describe("pageHref", () => {
  it("hands back a web address the row can be opened at", () => {
    expect(pageHref("https://example.com/blog/post")).toBe("https://example.com/blog/post");
    expect(pageHref("http://example.org/")).toBe("http://example.org/");
  });

  it("refuses anything that is not a web address", () => {
    expect(pageHref("android-app://com.example")).toBeNull();
    expect(pageHref("javascript:alert(1)")).toBeNull();
    expect(pageHref("/blog/post")).toBeNull();
  });
});

describe("getTopQueries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        clicks: 1_284n,
        impressions: 22_410n,
        positionWeight: 138_942,
        query: "open source rank tracker",
        total: 1_284n,
      },
    ]);
  });

  it("aggregates the window and carries the row total of the whole window", async () => {
    const result = await getTopQueries("project_1", "sc-domain:example.com", window, {
      limit: 50,
      offset: 0,
    });

    expect(result.total).toBe(1_284);
    expect(result.rows[0]).toMatchObject({ clicks: 1_284, impressions: 22_410 });
    expect(result.rows[0].ctr).toBeCloseTo(0.0573, 4);
    expect(result.rows[0].position).toBeCloseTo(6.2, 1);
    expect(statement().sql).toContain("COUNT(*) OVER ()");
  });

  it("orders by clicks and breaks ties on the text, so a page boundary never repeats a row", async () => {
    await getTopQueries("project_1", "sc-domain:example.com", window, { limit: 10, offset: 20 });

    expect(statement().sql).toContain('ORDER BY SUM("clicks") DESC, "query" ASC');
    expect(statement().values.slice(-2)).toEqual([10, 20]);
  });

  it("caps one page so a single click cannot materialize a saturated window", async () => {
    await getTopQueries("project_1", "sc-domain:example.com", window, {
      limit: ROWS_PAGE_LIMIT * 10,
      offset: -5,
    });

    expect(statement().values.slice(-2)).toEqual([ROWS_PAGE_LIMIT, 0]);
  });

  it("reports an empty window without asking the database for zero rows", async () => {
    await expect(
      getTopQueries("project_1", "sc-domain:example.com", window, { limit: 0, offset: 0 }),
    ).resolves.toEqual({ rows: [], total: 0 });
    expect(mocks.prisma.$queryRaw).not.toHaveBeenCalled();
  });
});

describe("getTopPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$queryRaw.mockResolvedValue([
      {
        clicks: 2_140n,
        impressions: 61_300n,
        page: "https://example.com/blog/self-hosted-rank-tracking",
        positionWeight: 760_120,
        total: 212n,
      },
    ]);
  });

  it("returns both the stored URL and the path the narrow column shows", async () => {
    const result = await getTopPages("project_1", "sc-domain:example.com", window, {
      limit: 50,
      offset: 0,
    });

    expect(result.rows[0].url).toBe("https://example.com/blog/self-hosted-rank-tracking");
    expect(result.rows[0].path).toBe("/blog/self-hosted-rank-tracking");
    expect(result.total).toBe(212);
    expect(statement().sql).toContain('FROM "search_analytics_page_daily"');
  });

  it("keeps the Search Console page read's totals, row count, and statement unchanged with GA4", async () => {
    const searchRows = [
      {
        clicks: 2_140n,
        impressions: 61_300n,
        page: "https://example.com/blog/self-hosted-rank-tracking",
        positionWeight: 760_120,
        total: 2n,
      },
      {
        clicks: 2_000n,
        impressions: 60_000n,
        page: "https://example.com/blog/another-page",
        positionWeight: 720_000,
        total: 2n,
      },
    ];
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw.mockResolvedValueOnce(searchRows);

    const withoutGa4 = await getTopPages("project_1", "sc-domain:example.com", window, {
      limit: 50,
      offset: 0,
    });
    const withoutGa4Statement = mocks.prisma.$queryRaw.mock.calls[0]?.[0];

    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw.mockResolvedValueOnce(searchRows).mockResolvedValueOnce([]);
    const withGa4 = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );
    const withGa4Statement = mocks.prisma.$queryRaw.mock.calls[0]?.[0];

    expect(withoutGa4).toMatchObject({ total: 2 });
    expect(withoutGa4.rows).toHaveLength(2);
    expect(withGa4).toMatchObject({ total: 2 });
    expect(withGa4.rows).toHaveLength(2);
    expect(withGa4Statement.sql).toBe(withoutGa4Statement.sql);
    expect(withGa4Statement.values).toEqual(withoutGa4Statement.values);
    expect(withoutGa4Statement.sql).toContain('COUNT(*) OVER () AS "total"');
    expect(withoutGa4Statement.sql).toContain('ORDER BY SUM("clicks") DESC, "page" ASC');
    expect(withoutGa4Statement.sql).not.toContain("organic_sessions_page_daily");
    expect(withoutGa4Statement.values.slice(-2)).toEqual([50, 0]);
  });

  it("returns the real page metrics after every contributing day has been reread", async () => {
    const page = "https://example.com/blog/self-hosted-rank-tracking";
    const { dimensionKeyHash } = await import("@/lib/search-insights/keys");
    const { normalizeLandingPath } = await import("@/lib/search-insights/join");
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          clicks: 2_140n,
          impressions: 61_300n,
          page,
          positionWeight: 760_120,
          total: 212n,
        },
      ])
      .mockResolvedValueOnce([
        {
          engagedSessions: 40n,
          keyEvents: 7n,
          keyHash: dimensionKeyHash([normalizeLandingPath(page)]),
          sessions: 100n,
        },
      ]);

    const result = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );

    expect(result.rows[0]).toMatchObject({
      engagementRate: 0.4,
      keyEvents: 7,
      sessions: 100,
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'FROM "organic_sessions_page_daily"',
    );
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'CASE WHEN bool_or("engagedSessions" IS NULL) THEN NULL ELSE SUM("engagedSessions") END AS "engagedSessions"',
    );
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'CASE WHEN bool_or("keyEvents" IS NULL) THEN NULL ELSE SUM("keyEvents") END AS "keyEvents"',
    );
  });

  it("keeps mixed reread page metrics unknown for the whole window", async () => {
    const page = "https://example.com/blog/self-hosted-rank-tracking";
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          clicks: 2_140n,
          impressions: 61_300n,
          page,
          positionWeight: 760_120,
          total: 212n,
        },
      ])
      .mockResolvedValueOnce([
        {
          engagedSessions: null,
          keyEvents: null,
          keyHash: dimensionKeyHash(["/blog/self-hosted-rank-tracking"]),
          sessions: 100n,
        },
      ]);

    const result = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );

    expect(result.rows[0]).toMatchObject({
      engagementRate: null,
      keyEvents: null,
      sessions: 100,
    });
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'CASE WHEN bool_or("engagedSessions" IS NULL) THEN NULL ELSE SUM("engagedSessions") END AS "engagedSessions"',
    );
  });

  it("leaves a missing landing page join distinct from a zero-session page", async () => {
    const result = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );

    expect(result.rows[0]).toMatchObject({
      engagementRate: null,
      keyEvents: null,
      sessions: null,
    });
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'FROM "organic_sessions_page_daily"',
    );
  });

  it("preserves NULL aggregates instead of converting them to zero", async () => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          clicks: 2_140n,
          impressions: 61_300n,
          page: "https://example.com/blog/self-hosted-rank-tracking",
          positionWeight: 760_120,
          total: 212n,
        },
      ])
      .mockResolvedValueOnce([
        {
          engagedSessions: null,
          keyEvents: null,
          keyHash: dimensionKeyHash(["/blog/self-hosted-rank-tracking"]),
          sessions: null,
        },
      ]);

    const result = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );

    expect(result.rows[0]).toMatchObject({
      engagementRate: null,
      keyEvents: null,
      sessions: null,
    });
  });

  it.each([
    ["sessions are zero", { engagedSessions: 0n, keyEvents: 1n, sessions: 0n }],
    ["engaged sessions are NULL", { engagedSessions: null, keyEvents: 1n, sessions: 100n }],
    ["sessions are NULL", { engagedSessions: 40n, keyEvents: 1n, sessions: null }],
  ])("does not calculate engagement when %s", async (_case, metrics) => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          clicks: 2_140n,
          impressions: 61_300n,
          page: "https://example.com/blog/self-hosted-rank-tracking",
          positionWeight: 760_120,
          total: 212n,
        },
      ])
      .mockResolvedValueOnce([
        {
          ...metrics,
          keyHash: dimensionKeyHash(["/blog/self-hosted-rank-tracking"]),
        },
      ]);

    const result = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );

    expect(result.rows[0]?.engagementRate).toBeNull();
  });
});

describe("column sorting", () => {
  beforeEach(() => {
    mocks.prisma.$queryRaw.mockReset();
    mocks.prisma.$queryRaw.mockResolvedValue([]);
  });

  it.each([
    ["clicks", { direction: "desc", key: "clicks" }, 'SUM("clicks") DESC, "query" ASC'],
    [
      "impressions",
      { direction: "asc", key: "impressions" },
      'SUM("impressions") ASC, "query" ASC',
    ],
    [
      "ctr",
      { direction: "desc", key: "ctr" },
      'SUM("clicks")::float8 / NULLIF(SUM("impressions"), 0) DESC NULLS LAST, "query" ASC',
    ],
    [
      "position",
      { direction: "asc", key: "position" },
      'SUM("position" * "impressions") / NULLIF(SUM("impressions"), 0) ASC NULLS LAST, "query" ASC',
    ],
    ["text", { direction: "asc", key: "text" }, '"query" ASC'],
  ] as const)("orders the whole window by %s in the read", async (_name, sort, expected) => {
    await getTopQueries("prj_1", "sc-domain:example.com", window, { limit: 10, offset: 0, sort });

    expect(statement().sql).toContain(`ORDER BY ${expected}`);
  });

  // Every metric sort ends on the unique text column, so two rows sharing a value keep a stable
  // order across pages: without it a LIMIT/OFFSET boundary can repeat one row and drop another.
  it.each(["clicks", "ctr", "impressions", "position"] as const)(
    "breaks ties on the text when sorting by %s",
    async (key) => {
      await getTopPages("prj_1", "sc-domain:example.com", window, {
        limit: 10,
        offset: 0,
        sort: { direction: "desc", key },
      });

      const orderBy = /ORDER BY([\s\S]*?)\n\s*LIMIT/.exec(statement().sql)?.[1]?.trim();
      expect(orderBy).toMatch(/, "page" ASC$/);
    },
  );

  it("falls back to the read's own default when no sort is asked for", async () => {
    await getTopQueries("prj_1", "sc-domain:example.com", window, { limit: 10, offset: 0 });

    expect(statement().sql).toContain('ORDER BY SUM("clicks") DESC, "query" ASC');
  });
});
