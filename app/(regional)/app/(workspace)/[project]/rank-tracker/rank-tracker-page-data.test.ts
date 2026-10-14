import { emptyKeywordFilters } from "@/lib/keywords/keyword-filter-model";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRankTrackerPageList } from "./rank-tracker-page-data";

const mocks = vi.hoisted(() => ({ grouped: vi.fn(), flat: vi.fn(), reportFactory: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/queries/rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: mocks.reportFactory,
}));

vi.mock("@/lib/queries/rank-tracker-grouped-list", () => ({
  getRankTrackerGroupedList: mocks.grouped,
}));
vi.mock("@/lib/queries/rank-tracker-list", () => ({ getRankTrackerKeywordList: mocks.flat }));

// Routing-only fixture: forwarding identity is tested, not a policy default or database read.
const report: RankTrackerReportOptions = {
  asOf: reportPolicy().asOf,
  limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
  loadMetadata: async () => new Map(),
  policyAt: (asOf) => ({ ...reportPolicy(), asOf }),
};

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
    mocks.reportFactory.mockRejectedValue(new Error("Explicit report must bypass session factory"));
    mocks.flat.mockResolvedValue(flat);
    mocks.grouped.mockResolvedValue(grouped);
  });

  function markets(count: number) {
    return Array.from({ length: count }, (_, index) => ({
      id: `mkt_${index}`,
      status: index === 0 ? ("active" as const) : ("paused" as const),
    }));
  }

  it.each([
    [1, true],
    [2, false],
  ] as const)("honors %s-market explicit grouped=%s", async (count, groupedChoice) => {
    const result = await loadRankTrackerPageList(
      "prj_1",
      { ...query, grouped: groupedChoice },
      markets(count),
      { explicitGrouping: true, report },
    );
    expect(result.query.grouped).toBe(groupedChoice);
    expect(result.mode).toBe(groupedChoice ? "grouped-server" : "flat-server");
  });

  it.each([0, 1, 2])(
    "derives automatic General grouping from %i registered project markets",
    async (count) => {
      const result = await loadRankTrackerPageList(
        "prj_1",
        { ...query, grouped: count <= 1 },
        markets(count),
        { report },
      );
      expect(result.mode).toBe(count > 1 ? "grouped-server" : "flat-server");
      expect(result.query.grouped).toBe(count > 1);
      expect(mocks.reportFactory).not.toHaveBeenCalled();
      expect(count > 1 ? mocks.grouped : mocks.flat).toHaveBeenCalledOnce();
      expect(count > 1 ? mocks.grouped : mocks.flat).toHaveBeenCalledWith(
        { projectRef: "prj_1", query: { ...query, grouped: count > 1 } },
        report,
      );
      expect(count > 1 ? mocks.flat : mocks.grouped).not.toHaveBeenCalled();
    },
  );

  it.each([
    { count: 0, grouped: false },
    { count: 0, grouped: true },
    { count: 1, grouped: false },
    { count: 1, grouped: true },
    { count: 2, grouped: false },
    { count: 2, grouped: true },
  ])(
    "preserves validated explicit grouped=$grouped with $count markets",
    async ({ count, grouped }) => {
      const result = await loadRankTrackerPageList("prj_1", { ...query, grouped }, markets(count), {
        explicitGrouping: true,
        report,
      });
      expect(result.mode).toBe(grouped ? "grouped-server" : "flat-server");
      expect(result.query.grouped).toBe(grouped);
      expect(mocks.reportFactory).not.toHaveBeenCalled();
      expect(grouped ? mocks.grouped : mocks.flat).toHaveBeenCalledWith(
        { projectRef: "prj_1", query: { ...query, grouped } },
        report,
      );
      expect(grouped ? mocks.flat : mocks.grouped).not.toHaveBeenCalled();
    },
  );

  it("keeps multi-market grouping with one filtered market and one paginated row", async () => {
    mocks.grouped.mockResolvedValue({ ...grouped, matchedTargetCount: 1, page: 3, pageCount: 4 });
    const filtered = {
      ...query,
      page: 3,
      savedViewId: "viw_old",
      lens: { ...query.lens, locationId: "country:us@en" },
    };
    const result = await loadRankTrackerPageList("prj_1", filtered, markets(2), { report });
    expect(result.mode).toBe("grouped-server");
    expect(mocks.grouped).toHaveBeenCalledWith(
      { projectRef: "prj_1", query: { ...filtered, grouped: true } },
      report,
    );
    expect(mocks.flat).not.toHaveBeenCalled();
  });

  it("retains the canonical page from the selected list instead of rewriting its input scope", async () => {
    mocks.flat.mockResolvedValue({ ...flat, page: 2, pageCount: 2 });
    const requested = { ...query, page: 99 };
    const result = await loadRankTrackerPageList("prj_1", requested, markets(1), { report });
    expect(result).toMatchObject({ mode: "flat-server", page: 2, pageCount: 2 });
    expect(mocks.flat).toHaveBeenCalledWith(
      { projectRef: "prj_1", query: { ...requested, grouped: false } },
      report,
    );
    expect(mocks.reportFactory).not.toHaveBeenCalled();
  });

  it("updates grouping when a market is added or archived, even with empty list facets", async () => {
    expect((await loadRankTrackerPageList("prj_1", query, markets(1), { report })).mode).toBe(
      "flat-server",
    );
    expect((await loadRankTrackerPageList("prj_1", query, markets(2), { report })).mode).toBe(
      "grouped-server",
    );
    expect(
      (await loadRankTrackerPageList("prj_1", { ...query, grouped: true }, markets(1), { report }))
        .mode,
    ).toBe("flat-server");
  });
});
