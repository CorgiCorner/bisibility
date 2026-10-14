import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), group: vi.fn(), select: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./_auth", () => ({ getQueryActor: mocks.actor }));
vi.mock("./rank-tracker-selection-core", () => ({ selectRankTrackerReportKeywords: mocks.select }));
vi.mock("./rank-tracker-report-grouped", () => ({ groupRankTrackerReportRows: mocks.group }));
const options = (): RankTrackerReportOptions => ({
  asOf: reportPolicy().asOf,
  limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
  loadMetadata: async () => new Map(),
  policyAt: () => reportPolicy(),
});
const query = { ...defaultRankTrackerQueryState, grouped: true };

describe("getRankTrackerGroupedList uses the same selected target cohort", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "verified-session" });
    mocks.select.mockImplementation(async (_context, input) => ({
      evaluation: "shared_kernel",
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [],
      policy: reportPolicy(),
      query: input.query,
      report: { selectionDigest: "same-full-cohort", metric: { counts: { expected: 103 } } },
      rows: [{ id: "kw_selected" }],
      resolutions: [],
      selectedKeywordIds: Array.from({ length: 103 }, (_, i) => `kw_${i}`),
      selectionDigest: "same-full-cohort",
      totalCount: 200,
    }));
    mocks.group.mockReturnValue(Array.from({ length: 51 }, (_, i) => ({ id: `group_${i}` })));
  });
  it("authorizes once through the same reader and passes its complete filtered rows to grouping", async () => {
    const result = await getRankTrackerGroupedList({ projectRef: "prj_public", query }, options());
    expect(mocks.select).toHaveBeenCalledWith(
      { actor: { id: "verified-session" }, transport: "session" },
      { projectRef: "prj_public", query },
      expect.any(Object),
    );
    expect(mocks.group).toHaveBeenCalledWith(
      [{ id: "kw_selected" }],
      [],
      expect.any(Object),
      query,
    );
    expect(result).toMatchObject({
      matchedGroupCount: 51,
      matchedTargetCount: 103,
      selectionDigest: "same-full-cohort",
    });
  });
  it("keeps whole-target summary independent of group-page size and count", async () => {
    const first = await getRankTrackerGroupedList(
      { projectRef: "prj_public", query: { ...query, pageSize: 25 } },
      options(),
    );
    const second = await getRankTrackerGroupedList(
      { projectRef: "prj_public", query: { ...query, pageSize: 50 } },
      options(),
    );
    expect(first.groups).toHaveLength(25);
    expect(second.groups).toHaveLength(50);
    expect(first.report).toEqual(second.report);
    expect(first.selectedKeywordIds).toEqual(second.selectedKeywordIds);
  });
  it("returns the final canonical group page's rows on an out-of-range request", async () => {
    const result = await getRankTrackerGroupedList(
      { projectRef: "prj_public", query: { ...query, page: 99, pageSize: 25 } },
      options(),
    );
    expect(result).toMatchObject({ page: 3, pageCount: 3 });
    expect(result.groups).toHaveLength(1);
  });
  it("refuses missing server policy before authorization or grouping", async () => {
    await expect(
      Reflect.apply(getRankTrackerGroupedList, null, [{ projectRef: "prj_public", query }]),
    ).rejects.toThrow("policy");
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.group).not.toHaveBeenCalled();
  });
});
