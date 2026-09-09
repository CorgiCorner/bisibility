import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRankTrackerPageList } from "./rank-tracker-page-data";

const mocks = vi.hoisted(() => ({ grouped: vi.fn(), flat: vi.fn() }));

vi.mock("@/lib/queries/rank-tracker-grouped-list", () => ({
  getRankTrackerGroupedList: mocks.grouped,
}));
vi.mock("@/lib/queries/rank-tracker-list", () => ({ getRankTrackerKeywordList: mocks.flat }));

const query = {
  filters: emptyKeywordFilters,
  grouped: false,
  lens: { device: "all" as const, locationId: null },
  page: 1,
  pageSize: 25 as const,
  savedViewId: null,
  search: "",
  sort: { direction: "asc" as const, field: "position" as const },
};
const flat = {
  facets: { intents: [], positions: [], tags: [], topics: [] },
  locations: [],
  matchedTargetCount: 1,
  page: 1,
  pageCount: 1,
  pageSize: 25 as const,
  resolvedLens: query.lens,
  rows: [],
  totalCount: 1,
};
const grouped = {
  facets: flat.facets,
  groups: [],
  locations: flat.locations,
  matchedGroupCount: 0,
  matchedTargetCount: 0,
  page: 1,
  pageCount: 0,
  pageSize: 25 as const,
  resolvedLens: query.lens,
  totalCount: 1,
};

describe("loadRankTrackerPageList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.flat.mockResolvedValue(flat);
    mocks.grouped.mockResolvedValue(grouped);
  });

  it("uses the server grouped list for an explicit grouped URL", async () => {
    const result = await loadRankTrackerPageList("prj_1", { ...query, grouped: true }, true);

    expect(result.mode).toBe("grouped-server");
    expect(mocks.grouped).toHaveBeenCalledWith({
      projectRef: "prj_1",
      query: expect.objectContaining({ grouped: true }),
    });
    expect(mocks.flat).not.toHaveBeenCalled();
  });

  it("defaults from raw locations and preserves an explicit flat choice", async () => {
    mocks.flat.mockResolvedValue({
      ...flat,
      locations: [
        { count: 1, displayName: "Spain", id: "country:es@es", kind: "country" },
        { count: 1, displayName: "United States", id: "country:us@en", kind: "country" },
      ],
    });

    const defaulted = await loadRankTrackerPageList("prj_1", query, false);
    const explicitFlat = await loadRankTrackerPageList("prj_1", query, true);

    expect(defaulted.mode).toBe("grouped-server");
    expect(explicitFlat.mode).toBe("flat-server");
    expect(mocks.grouped).toHaveBeenCalledTimes(1);
  });
});
