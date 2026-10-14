import { localFixtureAsOf, localFixtureSelection } from "@/lib/dashboard-local/test-fixtures";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRankTrackerPageList } from "./rank-tracker-page-data";

const mocks = vi.hoisted(() => ({
  flat: vi.fn(),
  grouped: vi.fn(),
  local: vi.fn(),
  options: vi.fn(),
}));
vi.mock("@/lib/queries/rank-tracker-list", () => ({ getRankTrackerKeywordList: mocks.flat }));
vi.mock("@/lib/queries/rank-tracker-grouped-list", () => ({
  getRankTrackerGroupedList: mocks.grouped,
}));
vi.mock("@/lib/queries/rank-tracker-local-list", () => ({ loadRankTrackerLocalList: mocks.local }));
vi.mock("@/lib/queries/rank-tracker-personal-context", () => ({
  loadRankTrackerPersonalContext: vi.fn(),
}));
vi.mock("@/lib/queries/rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: mocks.options,
}));
const project = "prj_abcdefghijklmnopqrstuvwx",
  scope = {
    view: "general" as const,
    subject: null,
    comparisonDays: 28 as const,
    asOf: localFixtureAsOf.toISOString(),
  };
function query() {
  return { ...structuredClone(defaultRankTrackerQueryState), page: 3, reportScope: scope };
}
describe("actual Rank Tracker automatic grouping and scope dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(localFixtureAsOf);
    mocks.options.mockResolvedValue({ asOf: localFixtureAsOf });
    mocks.flat.mockImplementation(async ({ query }) => ({ rows: [], resolvedLens: query.lens }));
    mocks.grouped.mockImplementation(async ({ query }) => ({
      groups: [],
      resolvedLens: query.lens,
    }));
    mocks.local.mockResolvedValue({ mode: "flat-server" });
  });
  it.each([
    { markets: [] },
    { markets: [{ id: "one", status: "active" as const }] },
    {
      markets: [
        { id: "one", status: "active" as const },
        { id: "two", status: "active" as const },
      ],
    },
  ])("dispatches the real automatic grouping with markets %j", async ({ markets }) => {
    const result = await loadRankTrackerPageList(project, query(), markets);
    const grouped = markets.length > 1,
      selected = grouped ? mocks.grouped : mocks.flat;
    expect(result.mode).toBe(grouped ? "grouped-server" : "flat-server");
    expect(result.query.reportScope).toEqual(scope);
    expect(selected).toHaveBeenCalledWith(
      {
        projectRef: project,
        query: expect.objectContaining({ grouped, reportScope: scope, page: 3 }),
      },
      expect.objectContaining({ asOf: localFixtureAsOf }),
    );
    expect(mocks.options).toHaveBeenCalledWith(localFixtureAsOf, 28);
    expect(mocks.local).not.toHaveBeenCalled();
  });
  it("preserves an explicit grouping choice without markets", async () => {
    const result = await loadRankTrackerPageList(project, { ...query(), grouped: true }, [], {
      explicitGrouping: true,
    });
    expect(result.mode).toBe("grouped-server");
    expect(mocks.grouped).toHaveBeenCalledOnce();
  });
  it.each([
    { markets: [] },
    {
      markets: [
        { id: "one", status: "active" as const },
        { id: "two", status: "active" as const },
      ],
    },
  ])(
    "Local follows the same automatic grouping with markets %j and never requests the General list",
    async ({ markets }) => {
      const requested = {
        ...query(),
        reportScope: { ...scope, view: "local" as const, subject: localFixtureSelection },
      };
      await loadRankTrackerPageList(project, requested, markets);
      expect(mocks.local).toHaveBeenCalledWith(
        project,
        expect.objectContaining({
          grouped: markets.length > 1,
          reportScope: requested.reportScope,
        }),
        expect.objectContaining({ asOf: localFixtureAsOf }),
      );
      expect(mocks.flat).not.toHaveBeenCalled();
      expect(mocks.grouped).not.toHaveBeenCalled();
    },
  );
});
