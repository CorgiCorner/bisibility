import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { reportPolicy } from "@/lib/rank-reports/report-test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRankTrackerGroupedList } from "./rank-tracker-grouped-list";
import { getRankTrackerKeywordList } from "./rank-tracker-list";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

const mocks = vi.hoisted(() => ({ select: vi.fn(), group: vi.fn() }));
vi.mock("./_auth", () => ({ getQueryActor: async () => ({ id: "actor" }) }));
vi.mock("./rank-tracker-selection-core", () => ({ selectRankTrackerReportKeywords: mocks.select }));
vi.mock("./rank-tracker-report-grouped", () => ({ groupRankTrackerReportRows: mocks.group }));
const options = (): RankTrackerReportOptions => ({
  asOf: reportPolicy().asOf,
  limits: { maxChecks: 1000, maxItems: 1000, maxTargets: 1000 },
  loadMetadata: async () => new Map(),
  policyAt: () => reportPolicy(),
});
const rows = Array.from({ length: 27 }, (_, index) => ({
  id: `kw_${index}`,
  device: index < 25 ? "Desktop" : "Mobile",
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.select.mockImplementation(async (_context, input) => ({
    query: input.query,
    rows,
    resolutions: [],
    policy: reportPolicy(),
    facets: {},
    locations: [],
    selectedKeywordIds: rows.map(({ id }) => id),
    totalCount: rows.length,
  }));
  mocks.group.mockReturnValue(Array.from({ length: 27 }, (_, index) => ({ id: `group_${index}` })));
});

describe("internal filtered-view device metadata", () => {
  it("retains both devices when a paginated flat page contains only desktop targets", async () => {
    const first = await getRankTrackerKeywordList(
      {
        projectRef: "prj_1",
        query: { ...defaultRankTrackerQueryState, grouped: false, page: 1, pageSize: 25 },
      },
      options(),
    );
    expect(first.rows).toHaveLength(25);
    expect(first.rows.every((row) => row.device === "Desktop")).toBe(true);
    expect(first.viewDevices).toEqual(["desktop", "mobile"]);
    const second = await getRankTrackerKeywordList(
      {
        projectRef: "prj_1",
        query: { ...defaultRankTrackerQueryState, grouped: false, page: 2, pageSize: 25 },
      },
      options(),
    );
    expect(second.rows).toHaveLength(2);
    expect(second.viewDevices).toEqual(first.viewDevices);
    expect(mocks.select).toHaveBeenCalledTimes(2);
  });
  it("uses the full filtered target selection before grouped pagination", async () => {
    const result = await getRankTrackerGroupedList(
      {
        projectRef: "prj_1",
        query: { ...defaultRankTrackerQueryState, grouped: true, page: 2, pageSize: 25 },
      },
      options(),
    );
    expect(result.groups).toHaveLength(2);
    expect(result.viewDevices).toEqual(["desktop", "mobile"]);
    expect(mocks.group).toHaveBeenCalledWith(rows, [], expect.any(Object), expect.any(Object));
  });
  it("supports mobile as a subset and reports a truly single-device filtered view", async () => {
    const subset = ["Desktop", "Desktop", "Desktop", "Desktop", "Mobile", "Mobile"].map(
      (device, index) => ({ id: `kw_${index}`, device }),
    );
    mocks.select.mockImplementation(async (_context, input) => ({
      query: input.query,
      rows: subset,
      selectedKeywordIds: subset.map(({ id }) => id),
    }));
    expect(
      (
        await getRankTrackerKeywordList(
          { projectRef: "prj_1", query: { ...defaultRankTrackerQueryState, grouped: false } },
          options(),
        )
      ).viewDevices,
    ).toEqual(["desktop", "mobile"]);
    mocks.select.mockImplementation(async (_context, input) => ({
      query: input.query,
      rows: subset.slice(4),
      selectedKeywordIds: ["kw_4", "kw_5"],
    }));
    expect(
      (
        await getRankTrackerKeywordList(
          { projectRef: "prj_1", query: { ...defaultRankTrackerQueryState, grouped: false } },
          options(),
        )
      ).viewDevices,
    ).toEqual(["mobile"]);
  });
});
