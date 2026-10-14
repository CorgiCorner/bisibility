import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankTrackerKeywordList } from "./rank-tracker-list";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), select: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./_auth", () => ({ getQueryActor: mocks.actor }));
vi.mock("./rank-tracker-selection-core", () => ({ selectRankTrackerReportKeywords: mocks.select }));
const options = (): RankTrackerReportOptions => ({
  asOf: reportPolicy().asOf,
  limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
  loadMetadata: async () => new Map(),
  policyAt: () => reportPolicy(),
});
const selection = () => ({
  evaluation: "shared_kernel",
  facets: { intents: [], positions: [], tags: [], topics: [] },
  locations: [],
  query: defaultRankTrackerQueryState,
  report: { selectionDigest: "full-scope", metric: { counts: { expected: 103 }, value: 50 } },
  rows: Array.from({ length: 103 }, (_, i) => ({ id: `kw_${i}` })),
  selectedKeywordIds: Array.from({ length: 103 }, (_, i) => `kw_${i}`),
  selectionDigest: "full-scope",
  totalCount: 103,
});

describe("getRankTrackerKeywordList shared whole scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.actor.mockResolvedValue({ id: "verified-session" });
    mocks.select.mockImplementation(async (_context, input) => ({
      ...selection(),
      query: input.query,
    }));
  });
  it("passes the verified session and public project ref to the shared authorized selection", async () => {
    await getRankTrackerKeywordList(
      { projectRef: "prj_public", query: defaultRankTrackerQueryState },
      options(),
    );
    expect(mocks.select).toHaveBeenCalledWith(
      { actor: { id: "verified-session" }, transport: "session" },
      expect.objectContaining({ projectRef: "prj_public" }),
      expect.any(Object),
    );
  });
  it("keeps whole-scope 103 counts, selected IDs and summary independent of 25/50-page rows", async () => {
    const first = await getRankTrackerKeywordList(
      { projectRef: "prj_public", query: { ...defaultRankTrackerQueryState, pageSize: 25 } },
      options(),
    );
    const second = await getRankTrackerKeywordList(
      { projectRef: "prj_public", query: { ...defaultRankTrackerQueryState, pageSize: 50 } },
      options(),
    );
    expect(first.rows).toHaveLength(25);
    expect(second.rows).toHaveLength(50);
    expect(first.report).toEqual(second.report);
    expect(first.selectedKeywordIds).toEqual(second.selectedKeywordIds);
    expect(first.matchedTargetCount).toBe(103);
    expect(first.report?.metric.counts.expected).toBe(103);
  });
  it("returns actual rows of the canonical final page rather than mixing that page number with empty rows", async () => {
    const result = await getRankTrackerKeywordList(
      {
        projectRef: "prj_public",
        query: { ...defaultRankTrackerQueryState, page: 99, pageSize: 25 },
      },
      options(),
    );
    expect(result).toMatchObject({ page: 5, pageCount: 5, matchedTargetCount: 103 });
    expect(result.rows).toHaveLength(3);
  });
  it("retains an unavailable market lens and its empty selection without widening", async () => {
    mocks.select.mockImplementationOnce(async (_context, input) => ({
      ...selection(),
      query: input.query,
      rows: [],
      selectedKeywordIds: [],
    }));
    const result = await getRankTrackerKeywordList(
      {
        projectRef: "prj_public",
        query: {
          ...defaultRankTrackerQueryState,
          lens: { device: "desktop", locationId: "stale" },
        },
      },
      options(),
    );
    expect(result.resolvedLens).toEqual({ device: "desktop", locationId: "stale" });
    expect(result.rows).toEqual([]);
    expect(result.page).toBe(1);
  });
  it("refuses an absent server policy before session or data access", async () => {
    await expect(
      Reflect.apply(getRankTrackerKeywordList, null, [
        { projectRef: "prj_public", query: defaultRankTrackerQueryState },
      ]),
    ).rejects.toThrow("policy");
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rejects grouped mode before authorization and data access", async () => {
    await expect(
      getRankTrackerKeywordList(
        { projectRef: "prj_public", query: { ...defaultRankTrackerQueryState, grouped: true } },
        options(),
      ),
    ).rejects.toThrow("flat mode only");
    expect(mocks.actor).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
