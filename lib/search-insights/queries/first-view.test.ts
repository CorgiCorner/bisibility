import { FIRST_VIEW_ROW_BUFFER, KNOWN_DATA_INCIDENTS } from "@/lib/search-insights/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SearchInsightsScope } from "./context";

const mocks = vi.hoisted(() => ({
  coverage: vi.fn(),
  deploymentMode: vi.fn(),
  pages: vi.fn(),
  queries: vi.fn(),
  scope: vi.fn(),
  sessionsTotals: vi.fn(),
  signals: vi.fn(),
  totals: vi.fn(),
  tracked: vi.fn(),
}));

vi.mock("@/lib/deployment/deployment", () => ({ deploymentMode: mocks.deploymentMode }));
vi.mock("./context", () => ({ loadSearchInsightsScope: mocks.scope }));
vi.mock("./coverage", () => ({
  EMPTY_COVERAGE: { capHitDays: 0, clicksShare: 0, impressionsShare: 0 },
  getQueryCoverage: mocks.coverage,
}));
vi.mock("./kpis", async () => {
  const model = await import("./kpis-model");
  return {
    EMPTY_WINDOW_SESSIONS: { current: 0, previous: 0 },
    EMPTY_WINDOW_TOTALS: { current: model.EMPTY_TOTALS, previous: model.EMPTY_TOTALS },
    getOrganicSessionsTotals: mocks.sessionsTotals,
    getWindowTotals: mocks.totals,
  };
});
vi.mock("./signals", () => ({
  EMPTY_SIGNALS: { bandCount: 0, overlapCount: 0 },
  getSearchInsightsSignals: mocks.signals,
}));
vi.mock("./top-rows", () => ({
  EMPTY_ROWS: { rows: [], total: 0 },
  getTopPages: mocks.pages,
  getTopQueries: mocks.queries,
}));
vi.mock("./tracked", () => ({ getTrackedQueryTexts: mocks.tracked }));

const { getSearchInsightsFirstView, getSearchInsightsFirstViewSignals, getSearchInsightsRowsPage } =
  await import("./first-view");

const incident = KNOWN_DATA_INCIDENTS[0];
const scope = {
  period: { days: 28, id: "28" },
  projectId: "project_1",
  property: "sc-domain:example.com",
  window: {
    current: { end: "2026-07-08", start: "2026-06-11" },
    previous: { end: "2026-06-10", start: "2026-05-14" },
  },
};

function sessionsImport(overrides: Record<string, unknown> = {}) {
  return {
    capHitDays: 0,
    cursorDate: "2026-05-13",
    daysDone: 30,
    daysTotal: 488,
    earliestTargetDate: "2025-03-14",
    finalizedThroughDate: "2026-07-08",
    lastProbeAt: null,
    lastSyncStartedAt: null,
    newestFinalizedDate: "2026-07-08",
    pausedReason: null,
    state: "running",
    ...overrides,
  };
}

describe("getSearchInsightsFirstView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deploymentMode.mockReturnValue("self-host");
    mocks.scope.mockResolvedValue(scope);
    mocks.totals.mockResolvedValue({
      current: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
      previous: { clicks: 11_534, ctr: 0.0244, impressions: 471_690, position: 20 },
    });
    mocks.coverage.mockResolvedValue({ capHitDays: 1, clicksShare: 62, impressionsShare: 41 });
    mocks.queries.mockResolvedValue({
      rows: [{ clicks: 1, ctr: 0, impressions: 1, position: 6, query: "rank tracker" }],
      total: 1_284,
    });
    mocks.pages.mockResolvedValue({ rows: [], total: 212 });
    mocks.signals.mockResolvedValue({ bandCount: 34, overlapCount: 12 });
    mocks.tracked.mockResolvedValue(new Set(["rank tracker"]));
  });

  it("loads the whole first view against the current window and the frozen deployment mode", async () => {
    const view = await getSearchInsightsFirstView("prj_1", { period: "28" });
    expect(mocks.scope).toHaveBeenCalledWith("prj_1", { period: "28" });
    expect(mocks.queries).toHaveBeenCalledWith("project_1", scope.property, scope.window.current, {
      limit: FIRST_VIEW_ROW_BUFFER,
      offset: 0,
    });
    expect(view.deploymentMode).toBe("self-host");
    expect(view.coverage.clicksShare).toBe(62);
    expect(mocks.signals).not.toHaveBeenCalled();
    expect(view.kpis[0]).toMatchObject({ delta: "+8.2%", value: "12,480" });
  });

  it("reads the scope the page already resolved instead of loading a second one", async () => {
    const view = await getSearchInsightsFirstView("prj_1", {
      period: "28",
      scope: scope as SearchInsightsScope,
    });

    expect(mocks.scope).not.toHaveBeenCalled();
    expect(view.kpis[0]).toMatchObject({ value: "12,480" });
  });

  it("loads signals independently from the scope the page already resolved", async () => {
    const signals = await getSearchInsightsFirstViewSignals(scope as SearchInsightsScope);

    expect(mocks.scope).not.toHaveBeenCalled();
    expect(mocks.signals).toHaveBeenCalledTimes(1);
    expect(mocks.signals).toHaveBeenCalledWith(
      scope.projectId,
      scope.property,
      scope.window.current,
    );
    expect(signals).toEqual({ bandCount: 34, overlapCount: 12 });
  });

  it.each([
    ["property", { property: null }],
    ["window", { window: null }],
  ])("uses empty signals when the resolved scope has no %s", async (_missing, override) => {
    const signals = await getSearchInsightsFirstViewSignals({
      ...scope,
      ...override,
    } as SearchInsightsScope);

    expect(signals).toEqual({ bandCount: 0, overlapCount: 0 });
    expect(mocks.signals).not.toHaveBeenCalled();
  });

  it("asks about the tracked state of the queries it actually loaded", async () => {
    const view = await getSearchInsightsFirstView("prj_1");
    expect(mocks.tracked).toHaveBeenCalledWith("project_1", ["rank tracker"]);
    expect(view.trackedTexts).toEqual(["rank tracker"]);
  });

  it("suppresses deltas until the selected preset's previous window is covered", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      importFacts: { readyThrough: { d7: { current: true, previous: false } } },
      period: { id: "7" },
    });
    const view = await getSearchInsightsFirstView("prj_1");
    expect(view.kpis.every(({ delta, prev }) => delta === "new" && prev === "no data")).toBe(true);
  });

  it("does not compare the first look even when its prior day is recorded", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      importFacts: { readyThrough: { d1: { current: true, previous: true } } },
      organicSessions: {
        importState: sessionsImport(),
        property: "123456789",
        status: "connected",
      },
      period: { days: 1, id: "1" },
      window: {
        current: { end: "2026-07-08", start: "2026-07-08" },
        previous: { end: "2026-07-07", start: "2026-07-07" },
      },
    });
    mocks.sessionsTotals.mockResolvedValue({ current: 9_120, previous: 8_004 });

    const view = await getSearchInsightsFirstView("prj_1");

    expect(view.kpis.map(({ delta, dir, prev }) => ({ delta, dir, prev }))).toEqual([
      { delta: "new", dir: "flat", prev: "no data" },
      { delta: "new", dir: "flat", prev: "no data" },
      { delta: "new", dir: "flat", prev: "no data" },
      { delta: "new", dir: "flat", prev: "no data" },
    ]);
    expect(view.sessionsKpi).toMatchObject({ delta: "new", dir: "flat", prev: "no data" });
  });

  it("reads sessions for the first look when GA4 covers only its boundary day", async () => {
    const boundaryOnlySessions = {
      importState: sessionsImport({ cursorDate: "2026-07-07" }),
      property: "123456789",
      status: "connected" as const,
    };
    mocks.scope.mockResolvedValue({
      ...scope,
      organicSessions: boundaryOnlySessions,
      period: { days: 1, id: "1" },
      window: {
        current: { end: "2026-07-08", start: "2026-07-08" },
        previous: { end: "2026-07-07", start: "2026-07-07" },
      },
    });
    mocks.sessionsTotals.mockResolvedValue({ current: 9_120, previous: 8_004 });

    const firstLook = await getSearchInsightsFirstView("prj_1");

    expect(firstLook.sessionsReadable).toBe(true);
    expect(firstLook.sessionsKpi).toMatchObject({ value: "73.08%" });
    expect(firstLook.clicksToSessionsKpi).toMatchObject({ kind: "visible" });
    expect(mocks.pages).toHaveBeenLastCalledWith(
      "project_1",
      scope.property,
      { end: "2026-07-08", start: "2026-07-08" },
      { limit: FIRST_VIEW_ROW_BUFFER, offset: 0 },
      "123456789",
    );

    mocks.sessionsTotals.mockClear();
    mocks.scope.mockResolvedValue({
      ...scope,
      organicSessions: boundaryOnlySessions,
      period: { days: 7, id: "7" },
    });

    const preset = await getSearchInsightsFirstView("prj_1");

    expect(preset.sessionsKpi).toBeNull();
    expect(preset.sessionsReadable).toBe(false);
    expect(mocks.sessionsTotals).not.toHaveBeenCalled();
    expect(mocks.pages).toHaveBeenLastCalledWith(
      "project_1",
      scope.property,
      scope.window.current,
      { limit: FIRST_VIEW_ROW_BUFFER, offset: 0 },
      null,
    );
  });

  it("keeps covered 7-day KPI output byte-identical", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      importFacts: { readyThrough: { d7: { current: true, previous: true } } },
      organicSessions: {
        importState: sessionsImport(),
        property: "123456789",
        status: "connected",
      },
      period: { days: 7, id: "7" },
    });
    mocks.sessionsTotals.mockResolvedValue({ current: 9_120, previous: 8_004 });

    const view = await getSearchInsightsFirstView("prj_1");

    expect(view.kpis).toEqual([
      {
        delta: "+8.2%",
        dir: "up",
        label: "Clicks",
        prev: "11,534",
        source: "GSC",
        value: "12,480",
      },
      {
        delta: "+3.1%",
        dir: "up",
        label: "Impressions",
        prev: "471,690",
        source: "GSC",
        value: "486,310",
      },
      {
        delta: "+0.13 pp",
        dir: "up",
        label: "CTR",
        prev: "2.44%",
        source: "GSC",
        value: "2.57%",
      },
      {
        delta: "1.6 better",
        dir: "up",
        label: "Avg position",
        prev: "20.0",
        source: "GSC",
        value: "18.4",
      },
    ]);
    expect(view.sessionsKpi).toMatchObject({ delta: "+3.69 pp", dir: "up", prev: "69.39%" });
  });

  it("carries a published provider anomaly that overlaps the compared period", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      window: {
        current: { end: incident.to, start: incident.from },
        previous: { end: incident.from, start: incident.from },
      },
    });
    const view = await getSearchInsightsFirstView("prj_1");
    expect(view.incidents).toEqual([incident]);
  });

  it("does not carry an anomaly that only falls between year-over-year windows", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      period: { comparison: "year_over_year", days: 7, id: "7" },
      window: {
        current: { end: "2026-05-07", start: "2026-05-01" },
        previous: { end: "2025-05-07", start: "2025-05-01" },
      },
    });

    const view = await getSearchInsightsFirstView("prj_1");

    expect(view.incidents).toEqual([]);
  });

  it("suppresses sessions until the connected import covers the compared window", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      organicSessions: {
        importState: sessionsImport({ finalizedThroughDate: "2026-07-07" }),
        property: "123456789",
        status: "connected",
      },
    });
    const view = await getSearchInsightsFirstView("prj_1");
    expect(mocks.pages).toHaveBeenCalledWith(
      "project_1",
      scope.property,
      scope.window.current,
      { limit: FIRST_VIEW_ROW_BUFFER, offset: 0 },
      null,
    );
    expect(mocks.sessionsTotals).not.toHaveBeenCalled();
    expect(view.sessionsKpi).toBeNull();
    expect(view.sessionsReadable).toBe(false);
  });

  it("reads sessions from an import that covers the compared window", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      organicSessions: {
        importState: sessionsImport(),
        property: "123456789",
        status: "connected",
      },
    });
    mocks.sessionsTotals.mockResolvedValue({ current: 9_120, previous: 8_004 });

    const view = await getSearchInsightsFirstView("prj_1");

    expect(mocks.pages).toHaveBeenCalledWith(
      "project_1",
      scope.property,
      scope.window.current,
      { limit: FIRST_VIEW_ROW_BUFFER, offset: 0 },
      "123456789",
    );
    expect(mocks.sessionsTotals).toHaveBeenCalledWith("project_1", "123456789", scope.window);
    expect(view.sessionsKpi).toMatchObject({ label: "Clicks to sessions", source: "GSC" });
    expect(view.sessionsReadable).toBe(true);
  });

  it("exposes a hidden reconciliation state instead of a card with no value", async () => {
    mocks.scope.mockResolvedValue({
      ...scope,
      organicSessions: {
        importState: sessionsImport(),
        property: "123456789",
        status: "connected",
      },
    });
    mocks.totals.mockResolvedValue({
      current: { clicks: 0, ctr: 0, impressions: 100, position: 0 },
      previous: { clicks: 8, ctr: 0.01, impressions: 100, position: 0 },
    });
    mocks.sessionsTotals.mockResolvedValue({ current: 4, previous: 4 });

    const view = await getSearchInsightsFirstView("prj_1");

    expect(view.clicksToSessionsKpi).toEqual({
      kind: "hidden",
      reason: "zero_clicks",
      source: "GSC",
    });
    expect(view.sessionsKpi).toBeNull();
  });

  it("renders an empty view rather than querying a property with no finalized day", async () => {
    mocks.scope.mockResolvedValue({ ...scope, window: null });
    const view = await getSearchInsightsFirstView("prj_1");

    expect(view.queries).toEqual({ rows: [], total: 0 });
    expect(view.kpis).toHaveLength(4);
    expect(view.deploymentMode).toBe("self-host");
    expect(mocks.totals).not.toHaveBeenCalled();
    expect(mocks.coverage).not.toHaveBeenCalled();
  });
});

describe("getSearchInsightsRowsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.scope.mockResolvedValue(scope);
    mocks.queries.mockResolvedValue({
      rows: [
        { clicks: 1, ctr: 0, impressions: 1, position: 6, query: "rank tracker" },
        { clicks: 1, ctr: 0, impressions: 1, position: 8, query: "serp checker" },
      ],
      total: 1_284,
    });
    mocks.pages.mockResolvedValue({ rows: [], total: 212 });
    mocks.tracked.mockResolvedValue(new Set(["rank tracker"]));
  });

  it("binds the page to the property and window the scope resolved, not to the caller", async () => {
    const page = await getSearchInsightsRowsPage("prj_1", {
      kind: "queries",
      limit: 1_000,
      offset: 50,
      period: "28",
      property: "sc-domain:archived.example.com",
    });

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: "28",
      property: "sc-domain:archived.example.com",
    });
    expect(mocks.queries).toHaveBeenCalledWith("project_1", scope.property, scope.window.current, {
      limit: 1_000,
      offset: 50,
    });
    expect(page).toMatchObject({ kind: "queries", total: 1_284 });
  });

  it("asks about the tracked state of the texts this page returned, under the internal id", async () => {
    const page = await getSearchInsightsRowsPage("prj_1", {
      kind: "queries",
      limit: 50,
      offset: 0,
      property: scope.property,
    });

    expect(mocks.tracked).toHaveBeenCalledWith("project_1", ["rank tracker", "serp checker"]);
    expect(page).toMatchObject({ trackedTexts: ["rank tracker"] });
  });

  it("reads the page rows without asking Rank Tracker anything", async () => {
    const page = await getSearchInsightsRowsPage("prj_1", {
      kind: "pages",
      limit: 50,
      offset: 0,
      property: scope.property,
    });

    expect(mocks.pages).toHaveBeenCalledWith(
      "project_1",
      scope.property,
      scope.window.current,
      { limit: 50, offset: 0 },
      null,
    );
    expect(page).toEqual({ kind: "pages", rows: [], total: 212 });
    expect(mocks.queries).not.toHaveBeenCalled();
    expect(mocks.tracked).not.toHaveBeenCalled();
  });

  it.each(["pages", "queries"] as const)(
    "returns an empty %s page rather than aggregating a window that does not exist",
    async (kind) => {
      mocks.scope.mockResolvedValue({ ...scope, window: null });

      const page = await getSearchInsightsRowsPage("prj_1", {
        kind,
        limit: 50,
        offset: 0,
        property: scope.property,
      });

      expect(page).toMatchObject({ kind, rows: [], total: 0 });
      expect(mocks.queries).not.toHaveBeenCalled();
      expect(mocks.pages).not.toHaveBeenCalled();
      expect(mocks.tracked).not.toHaveBeenCalled();
    },
  );

  it("returns an empty page for a project with no connected property", async () => {
    mocks.scope.mockResolvedValue({ ...scope, property: null });

    const page = await getSearchInsightsRowsPage("prj_1", {
      kind: "queries",
      limit: 50,
      offset: 0,
      property: scope.property,
    });

    expect(page).toEqual({ kind: "queries", rows: [], total: 0, trackedTexts: [] });
    expect(mocks.queries).not.toHaveBeenCalled();
  });
});
