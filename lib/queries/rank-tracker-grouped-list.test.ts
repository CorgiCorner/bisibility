import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";

const mocks = vi.hoisted(() => ({
  exact: vi.fn(),
  hydrate: vi.fn(),
  queryRaw: vi.fn(),
  read: vi.fn(),
  requiresExact: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("./_auth", () => ({ requireReadableProject: mocks.read }));
vi.mock("./keyword-row-loader", () => ({ loadKeywordRowsByInternalIds: mocks.hydrate }));
vi.mock("./rank-tracker-grouped-exact", () => ({ exactRankTrackerGroupedRows: mocks.exact }));
vi.mock("./rank-tracker-selection-core", () => ({ requiresExactRows: mocks.requiresExact }));

const raw = {
  facets: { intents: [], positions: [], tags: [], topics: [] },
  groups: [
    {
      members: [{ id: "keyword_internal", marketStatus: "active", publicId: "kw_public" }],
      term: "alpha",
    },
  ],
  locations: [{ count: 1, displayName: "United States", id: "US:en", kind: "country" }],
  matchedGroupCount: 1,
  matchedTargetCount: 1,
  totalCount: 2,
};

const row = {
  device: "Desktop",
  difficulty: 10,
  hasRankData: true,
  id: "kw_public",
  keyword: "Alpha",
  lastCheckAt: "2026-09-01T00:00:00.000Z",
  location: { canonicalKey: "US:en", displayName: "United States", hl: "en" },
  locationName: "United States",
  position: 4,
  positionBaseline: 8,
  rankingPages: 1,
  rankingPath: null,
  rankingUrl: "https://example.com/alpha",
  schedule: { frequency: "daily" },
  sparkline: [8, 4],
  tags: [],
  targetUrl: null,
  volume: 1000,
};

describe("getRankTrackerGroupedList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.read.mockResolvedValue({ project: { domain: "example.com", id: "project_internal" } });
    mocks.queryRaw.mockResolvedValue([raw]);
    mocks.hydrate.mockResolvedValue([row]);
    mocks.requiresExact.mockReturnValue(false);
  });

  it("authorizes before grouped SQL and returns group rows with target counts", async () => {
    const result = await getRankTrackerGroupedList({
      projectRef: "prj_public",
      query: { ...defaultRankTrackerQueryState, grouped: true },
    });

    expect(mocks.read).toHaveBeenCalledWith("prj_public");
    expect(mocks.queryRaw.mock.calls[0][0].values).toContain("project_internal");
    expect(mocks.hydrate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "project_internal" }),
      ["keyword_internal"],
    );
    expect(result).toMatchObject({ matchedGroupCount: 1, matchedTargetCount: 1, pageCount: 1 });
    expect(result.groups[0]).toMatchObject({ kind: "group", subRows: [{ id: "kw_public" }] });
  });

  it("uses the exact aggregate reference for target-dependent filters", async () => {
    mocks.requiresExact.mockReturnValue(true);
    mocks.exact.mockReturnValue({ groups: [], matchedGroupCount: 0, matchedTargetCount: 0 });

    const result = await getRankTrackerGroupedList({
      projectRef: "prj_public",
      query: {
        ...defaultRankTrackerQueryState,
        filters: { ...defaultRankTrackerQueryState.filters, wrongUrl: true },
        grouped: true,
      },
    });

    expect(mocks.queryRaw.mock.calls[0][0].sql).not.toContain("LIMIT ? OFFSET ?");
    expect(mocks.exact).toHaveBeenCalledWith(
      [expect.objectContaining({ id: "kw_public", marketStatus: "active" })],
      expect.objectContaining({ grouped: true }),
    );
    expect(result).toMatchObject({ groups: [], matchedGroupCount: 0, matchedTargetCount: 0 });
  });

  it.each(["frequency", "location", "targetRanking", "tags", "topic", "intent", "device"] as const)(
    "uses exact aggregate sorting for %s",
    async (field) => {
      mocks.exact.mockReturnValue({ groups: [], matchedGroupCount: 0, matchedTargetCount: 0 });

      await getRankTrackerGroupedList({
        projectRef: "prj_public",
        query: {
          ...defaultRankTrackerQueryState,
          grouped: true,
          sort: { direction: "asc", field },
        },
      });

      expect(mocks.queryRaw.mock.calls[0][0].sql).not.toContain("LIMIT ? OFFSET ?");
      expect(mocks.exact).toHaveBeenCalledOnce();
    },
  );

  it("uses the last canonical group page without reloading members", async () => {
    mocks.queryRaw.mockResolvedValueOnce([{ ...raw, groups: [], matchedGroupCount: 1 }]);

    const result = await getRankTrackerGroupedList({
      projectRef: "prj_public",
      query: { ...defaultRankTrackerQueryState, grouped: true, page: 99, pageSize: 25 },
    });

    expect(result).toMatchObject({ groups: [], page: 1, pageCount: 1 });
    expect(mocks.hydrate).toHaveBeenCalledWith(expect.anything(), []);
  });
});
