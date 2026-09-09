import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankTrackerKeywordList } from "./rank-tracker-list";

const mocks = vi.hoisted(() => ({
  hydrate: vi.fn(),
  exact: vi.fn(),
  queryRaw: vi.fn(),
  requireReadableProject: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.requireReadableProject }));
vi.mock("./keyword-row-loader", () => ({ loadKeywordRowsByInternalIds: mocks.hydrate }));
vi.mock("./rank-tracker-list-exact", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./rank-tracker-list-exact")>();
  return { ...actual, exactRankTrackerRows: mocks.exact };
});

const metadata = {
  facets: {
    intents: [],
    positions: [
      { count: 0, id: "top3", label: "Top 3" },
      { count: 0, id: "top10", label: "Top 10" },
      { count: 0, id: "11-50", label: "11-50" },
      { count: 0, id: "51-100", label: "51-100" },
    ],
    tags: [],
    topics: [],
  },
  keywordIds: [],
  locations: [{ count: 8, displayName: "United States", id: "US:en", kind: "country" }],
  matchedTargetCount: 51,
  totalCount: 80,
};

describe("getRankTrackerKeywordList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireReadableProject.mockResolvedValue({
      project: { domain: "example.com", id: "internal_1" },
    });
    mocks.queryRaw.mockResolvedValue([metadata]);
    mocks.hydrate.mockResolvedValue([]);
    mocks.exact.mockImplementation((rows) => rows);
  });

  it("authorizes the public ref and sends only internal id to SQL", async () => {
    await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: defaultRankTrackerQueryState,
    });
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_public");
    const statement = mocks.queryRaw.mock.calls[0][0];
    expect(statement.values).toContain("internal_1");
    expect(statement.values).not.toContain("prj_public");
  });

  it("reports the last canonical page while retaining empty requested-page rows", async () => {
    const result = await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: {
        ...defaultRankTrackerQueryState,
        page: 99,
        pageSize: 25,
      },
    });
    expect(result).toMatchObject({
      matchedTargetCount: 51,
      page: 3,
      pageCount: 3,
      rows: [],
      totalCount: 80,
    });
    expect(mocks.hydrate).toHaveBeenCalledWith(expect.objectContaining({ id: "internal_1" }), []);
  });

  it("reports page one when an out-of-range request has zero matches", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{ ...metadata, matchedTargetCount: 0 }]);
    const result = await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: { ...defaultRankTrackerQueryState, page: 99, pageSize: 25 },
    });
    expect(result).toMatchObject({ matchedTargetCount: 0, page: 1, pageCount: 0, rows: [] });
  });

  it("applies exact candidates before count and page", async () => {
    mocks.queryRaw.mockResolvedValue([{ ...metadata, keywordIds: ["internal_a", "internal_b"] }]);
    mocks.hydrate.mockResolvedValue([
      {
        id: "kw_a",
        hasRankData: true,
        position: 2,
        rankingUrl: "https://example.com/a",
        targetUrl: "/a",
        serpFeatures: [],
      },
      {
        id: "kw_b",
        hasRankData: true,
        position: 3,
        rankingUrl: "https://example.com/b",
        targetUrl: "/target",
        serpFeatures: [],
      },
    ]);
    mocks.exact.mockReturnValueOnce([{ id: "kw_b" }]);
    const result = await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
        pageSize: 25,
      },
    });
    expect(result).toMatchObject({ matchedTargetCount: 1, pageCount: 1, totalCount: 80 });
    expect(result.rows.map((row: { id: string }) => row.id)).toEqual(["kw_b"]);
    expect(mocks.queryRaw.mock.calls[0][0].sql).not.toContain("LIMIT ? OFFSET ?");
  });

  it("falls an unknown location back to all while preserving full options", async () => {
    const result = await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: {
        ...defaultRankTrackerQueryState,
        lens: { device: "desktop", locationId: "stale" },
      },
    });
    expect(result.resolvedLens).toEqual({ device: "desktop", locationId: null });
    expect(result.locations).toHaveLength(1);
  });

  it("derives exact counts, facets, and page rows from the fully filtered candidate set", async () => {
    mocks.queryRaw.mockResolvedValue([
      { ...metadata, keywordIds: ["a", "b", "c"], totalCount: 80 },
    ]);
    mocks.hydrate.mockResolvedValue([
      { id: "a", intent: "commercial", position: 2, tags: ["A"], topic: "Docs" },
      { id: "b", intent: "commercial", position: 8, tags: ["A", "B"], topic: "Docs" },
      { id: "c", intent: "informational", position: 60, tags: ["B"], topic: "Blog" },
    ]);
    mocks.exact.mockImplementation((rows) => rows.slice(1));
    const result = await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
        pageSize: 25,
      },
    });
    expect(result).toMatchObject({
      facets: metadata.facets,
      matchedTargetCount: 2,
      pageCount: 1,
      totalCount: 80,
    });
    expect(result.rows.map((row: { id: string }) => row.id)).toEqual(["b", "c"]);
  });

  it.each([
    { filters: { ...defaultRankTrackerQueryState.filters, change: "down" as const } },
    { filters: { ...defaultRankTrackerQueryState.filters, urlChanged: true } },
    { sort: { direction: "desc" as const, field: "change" as const } },
    { sort: { direction: "desc" as const, field: "sparkline" as const } },
  ])("keeps helper-dependent movement and URL history selection uncapped", async (override) => {
    await getRankTrackerKeywordList({
      projectRef: "prj_public",
      query: { ...defaultRankTrackerQueryState, ...override },
    });
    expect(mocks.queryRaw.mock.calls[0][0].sql).not.toContain("LIMIT ? OFFSET ?");
  });

  it("rejects grouped mode before data access", async () => {
    await expect(
      getRankTrackerKeywordList({
        projectRef: "prj_public",
        query: {
          ...defaultRankTrackerQueryState,
          grouped: true,
        },
      }),
    ).rejects.toThrow("flat mode only");
    expect(mocks.requireReadableProject).not.toHaveBeenCalled();
  });
});
