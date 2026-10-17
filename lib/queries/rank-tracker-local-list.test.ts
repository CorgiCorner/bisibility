import { localFixtureAsOf, localFixtureSelection } from "@/lib/dashboard-local/test-fixtures";
import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { RankReportSnapshotConflictError } from "@/lib/rank-reports/errors";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRankTrackerLocalList } from "./rank-tracker-local-list";
import { localListFixture } from "./rank-tracker-local-test-fixture";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  read: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  tx: { $executeRaw: vi.fn() },
  count: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: mocks.transaction, keyword: { count: mocks.count } },
}));
vi.mock("@/lib/dashboard-local/context", () => ({ loadDashboardLocalContext: mocks.context }));
vi.mock("@/lib/dashboard-local/read", () => ({ readLocalReportInTransaction: mocks.read }));
vi.mock("./rank-tracker-report-selection", () => ({
  selectRankTrackerReportKeywordsInTransaction: mocks.select,
}));
vi.mock("./_auth", () => ({
  requireReadableProject: async () => ({
    actor: { id: "verified-session" },
    project: { id: "internal-project" },
  }),
}));
const project = "prj_abcdefghijklmnopqrstuvwx";
function query() {
  return {
    ...structuredClone(defaultRankTrackerQueryState),
    pageSize: 25 as const,
    reportScope: {
      view: "local" as const,
      subject: localFixtureSelection,
      comparisonDays: 28 as const,
      asOf: localFixtureAsOf.toISOString(),
    },
  };
}
function options(): RankTrackerReportOptions {
  return {
    asOf: localFixtureAsOf,
    limits: { maxTargets: 100, maxItems: 1000, maxChecks: 1000 },
    policyAt: () => localListFixture().policy,
    loadMetadata: async () => new Map(),
  };
}
describe("real Local list read boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const f = localListFixture();
    mocks.count.mockResolvedValue(60);
    mocks.transaction.mockImplementation((read) => read(mocks.tx));
    mocks.context.mockResolvedValue({
      state: "ready",
      selection: localFixtureSelection,
      choices: [{ label: "Synthetic", selection: localFixtureSelection }],
    });
    mocks.read.mockResolvedValue(f.report);
    mocks.select.mockResolvedValue({
      rows: f.organic,
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [],
      totalCount: 60,
    });
  });
  it("retains whole-cohort summary on pages 1 and 3 while sending only visible facts", async () => {
    const first = await loadRankTrackerLocalList(project, query(), options()),
      third = await loadRankTrackerLocalList(project, { ...query(), page: 3 }, options());
    expect(first.local.summary).toEqual(third.local.summary);
    expect(first.local.summary?.expected).toBe(60);
    expect(first.rows).toHaveLength(25);
    expect(third.rows).toHaveLength(10);
    expect(first.local.facts).toHaveLength(25);
    expect(third.local.facts).toHaveLength(10);
    expect(new Set(first.rows.map((row) => row.id))).toEqual(
      new Set(first.local.facts.map((fact) => fact.keywordId)),
    );
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "RepeatableRead",
      maxWait: 2_000,
      timeout: 15_000,
    });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledTimes(2);
    expect(mocks.read).toHaveBeenCalledWith(
      mocks.tx,
      project,
      { actor: { id: "verified-session" } },
      localFixtureSelection,
      expect.any(Object),
      expect.objectContaining({ asOf: localFixtureAsOf }),
    );
    expect(first.report).toBeUndefined();
    expect(first.selectionDigest).not.toBe("local-synthetic-selection");
  });
  it("grouped facts match every visible child, without page-sized summary", async () => {
    const result = await loadRankTrackerLocalList(
      project,
      { ...query(), grouped: true },
      options(),
    );
    expect(result.groups).toHaveLength(1);
    expect(result.local.facts).toHaveLength(60);
    expect(result.matchedTargetCount).toBe(60);
    expect(result.matchedGroupCount).toBe(1);
  });
  it.each([7, 28, 90] as const)(
    "forwards the canonical %s-day period and explicit device/market lens",
    async (days) => {
      const input = {
        ...query(),
        reportScope: { ...query().reportScope, comparisonDays: days },
        lens: { device: "mobile" as const, locationId: "country:PL:pl" },
      };
      await loadRankTrackerLocalList(project, input, options());
      expect(mocks.read).toHaveBeenCalledWith(
        mocks.tx,
        project,
        { actor: { id: "verified-session" } },
        localFixtureSelection,
        {
          device: "mobile",
          marketIds: [],
          range: `${days}d`,
          tag: null,
          canonicalLocationKey: "country:PL:pl",
        },
        expect.any(Object),
      );
      expect(mocks.select.mock.calls[0]?.[2].query.lens).toEqual(input.lens);
    },
  );
  it.each(["missing", "unavailable", "invalid", "capacity"])(
    "%s subject never reads a broadened General or Local fallback",
    async (state) => {
      mocks.context.mockResolvedValue({ state, selection: null, choices: [] });
      const result = await loadRankTrackerLocalList(project, query(), options());
      expect(result.local.context.state).toBe(state);
      expect(result.rows).toEqual([]);
      expect(result.local.summary).toBeNull();
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
    },
  );
  it("a valid past snapshot conflict is controlled Local unavailable without stale facts or a broadened report", async () => {
    mocks.read.mockRejectedValue(new RankReportSnapshotConflictError());
    const result = await loadRankTrackerLocalList(project, query(), options());
    expect(result).toMatchObject({
      rows: [],
      groups: [],
      matchedTargetCount: 0,
      report: undefined,
      local: { context: { state: "unavailable", selection: null }, summary: null, facts: [] },
    });
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.select).toHaveBeenCalledOnce();
  });
  it("explicitly cleared subject does not borrow the first current choice", async () => {
    mocks.context.mockResolvedValue({
      state: "missing",
      selection: null,
      choices: [{ label: "Synthetic", selection: localFixtureSelection }],
    });
    await loadRankTrackerLocalList(
      project,
      { ...query(), reportScope: { ...query().reportScope, subject: null } },
      options(),
    );
    expect(mocks.context).toHaveBeenCalledWith(
      project,
      { actor: { id: "verified-session" } },
      undefined,
      null,
      localFixtureAsOf,
    );
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
