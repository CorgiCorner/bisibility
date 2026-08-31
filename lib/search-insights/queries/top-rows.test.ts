import { ROWS_PAGE_LIMIT } from "@/lib/search-insights/constants";
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

  it("joins page sessions by the normalized landing path in one grouped follow-up query", async () => {
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
        { keyHash: dimensionKeyHash([normalizeLandingPath(page)]), sessions: 1_200n },
      ]);

    const result = await getTopPages(
      "project_1",
      "sc-domain:example.com",
      window,
      { limit: 50, offset: 0 },
      "123456789",
    );

    expect(result.rows[0]?.sessions).toBe(1_200);
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'FROM "organic_sessions_page_daily"',
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

    expect(result.rows[0]?.sessions).toBeNull();
    expect(mocks.prisma.$queryRaw).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.$queryRaw.mock.calls[1]?.[0].sql).toContain(
      'FROM "organic_sessions_page_daily"',
    );
  });
});
