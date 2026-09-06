import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import { permanentRedirect, redirect } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KeywordsPage from "./page";

const mocks = vi.hoisted(() => ({
  getCheckHealth: vi.fn(),
  resolveLegacyMarketRef: vi.fn(),
  getKeywordCount: vi.fn(),
  getRankCheckRunCount: vi.fn(),
  getKeywordDefaultMarket: vi.fn(),
  getKeywordRows: vi.fn(),
  getKeywordTagSuggestions: vi.fn(),
  getPreferences: vi.fn(),
  loadRankTrackerCostContext: vi.fn(),
  getProjectMarkets: vi.fn(),
  getRankTrackerKeywordList: vi.fn(),
  getSavedView: vi.fn(),
  isProviderConnected: vi.fn(),
  listRankCheckRuns: vi.fn(),
  listSavedKeywords: vi.fn(),
  listSavedViews: vi.fn(),
  loadWorkspaceBudgetSummary: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  savedKeywordCount: vi.fn(),
}));

const historyPage = { data: [{}], nextCursor: null };
const plannedPage = { data: [{}, {}], nextCursor: null };

let capturedInitialAction: RankTrackerAction | null | undefined;
let capturedInitialDensity: string | undefined;
let capturedGridProps: Record<string, unknown> = {};

vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({
  RankTrackerTabs: (props: {
    activeTab: string;
    runsCount: number;
    savedCount: number;
    trackedCount: number;
  }) => (
    <div data-testid="rank-tracker-tabs">
      {props.activeTab}:{props.trackedCount}:{props.savedCount}:{props.runsCount}
    </div>
  ),
}));
vi.mock("@/components/rank-runs/RunsSection", () => ({
  RunsSection: (props: {
    initialHistory: { data: unknown[] };
    initialPlanned: { data: unknown[] };
    projectRef: string;
  }) => (
    <div data-testid="runs-section">
      {props.projectRef}:{props.initialHistory.data.length}:{props.initialPlanned.data.length}
    </div>
  ),
}));
vi.mock("@/components/keywords/grid/KeywordsGrid", () => ({
  KeywordsGrid: (props: {
    initialAction?: RankTrackerAction | null;
    initialAddOpen?: boolean;
    initialDensity?: string;
    [key: string]: unknown;
  }) => {
    capturedGridProps = props;
    capturedInitialAction = props.initialAction;
    capturedInitialDensity = props.initialDensity;
    return <div data-testid="tracked-grid" />;
  },
}));
vi.mock("@/components/keywords/saved/SavedKeywordsWorkspace", () => ({
  SavedKeywordsWorkspace: (props: { initialSavedCount: number; trackedCount: number }) => (
    <div data-testid="saved-workspace">
      {props.trackedCount}:{props.initialSavedCount}
    </div>
  ),
}));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: () => "owner" }));
vi.mock("@/lib/auth/capabilities", () => ({
  canDeleteProjectSavedView: () => true,
  canProjectAction: () => true,
}));
vi.mock("@/lib/dates/request", () => ({
  getResolvedDateFormat: vi.fn().mockResolvedValue({ preference: "auto", resolved: "month_first" }),
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/check-health", () => ({ getCheckHealth: mocks.getCheckHealth }));
vi.mock("@/components/keywords/rank-tracker-cost-context", () => ({
  loadRankTrackerCostContext: mocks.loadRankTrackerCostContext,
}));
vi.mock("@/lib/queries/integrations", () => ({ isProviderConnected: mocks.isProviderConnected }));
vi.mock("@/lib/queries/keywords", () => ({
  getKeywordCount: mocks.getKeywordCount,
  getKeywordDefaultMarket: mocks.getKeywordDefaultMarket,
  getKeywordRows: mocks.getKeywordRows,
  getKeywordTagSuggestions: mocks.getKeywordTagSuggestions,
  KEYWORD_LIST_MAX: 1000,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRunCount: mocks.getRankCheckRunCount,
  listRankCheckRuns: mocks.listRankCheckRuns,
}));
vi.mock("@/lib/queries/rank-tracker-list", () => ({
  getRankTrackerKeywordList: mocks.getRankTrackerKeywordList,
}));
vi.mock("@/lib/markets/market-context", () => ({
  resolveLegacyMarketRef: mocks.resolveLegacyMarketRef,
}));
vi.mock("@/lib/queries/project-markets", () => ({ getProjectMarkets: mocks.getProjectMarkets }));
vi.mock("@/lib/queries/saved-keywords", () => ({
  listSavedKeywords: mocks.listSavedKeywords,
  savedKeywordCount: mocks.savedKeywordCount,
}));
vi.mock("@/lib/queries/workspace-budget-summary", () => ({
  loadWorkspaceBudgetSummary: mocks.loadWorkspaceBudgetSummary,
}));
vi.mock("@/lib/queries/saved-views", () => ({
  getSavedView: mocks.getSavedView,
  listSavedViews: mocks.listSavedViews,
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  render(
    await KeywordsPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

describe("KeywordsPage tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.resolveLegacyMarketRef.mockResolvedValue(null);
    capturedGridProps = {};
    capturedInitialAction = undefined;
    capturedInitialDensity = undefined;
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getCheckHealth.mockResolvedValue({ budget: {}, providerConnected: true });
    mocks.getKeywordCount.mockResolvedValue(9);
    mocks.getRankCheckRunCount.mockResolvedValue(25);
    mocks.getKeywordDefaultMarket.mockResolvedValue({
      city: null,
      country: "United States",
      device: "desktop",
      displayName: "United States",
      locationKey: "US",
      source: "explicit",
    });
    mocks.getKeywordRows.mockResolvedValue([]);
    mocks.getRankTrackerKeywordList.mockResolvedValue({
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [],
      matchedTargetCount: 0,
      page: 1,
      pageCount: 1,
      pageSize: 25,
      resolvedLens: { device: "all", locationId: null },
      rows: [],
      totalCount: 9,
    });
    mocks.getKeywordTagSuggestions.mockResolvedValue([]);
    mocks.loadRankTrackerCostContext.mockResolvedValue({
      costPerCheckCents: 1,
      spentCents: 3900,
    });
    mocks.getProjectMarkets.mockResolvedValue({
      markets: [],
      maxMarkets: 5,
      monthlyCostCents: 0,
      perMarketChecks: 0,
      projectId: "prj_1",
    });
    mocks.getSavedView.mockResolvedValue(null);
    mocks.listRankCheckRuns.mockImplementation((_projectId: string, url: URL) =>
      Promise.resolve(url.searchParams.get("segment") === "planned" ? plannedPage : historyPage),
    );
    mocks.isProviderConnected.mockResolvedValue(true);
    mocks.getPreferences.mockResolvedValue({
      dateFormat: "iso",
      density: "standard",
      landing: "dashboard",
      theme: "system",
    });
    mocks.listSavedKeywords.mockResolvedValue({ rows: [], total: 2 });
    mocks.listSavedViews.mockResolvedValue([]);
    mocks.loadWorkspaceBudgetSummary.mockResolvedValue(null);
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "owner" }] },
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.savedKeywordCount.mockResolvedValue(2);
  });

  it("keeps Tracked as the default branch and renders both counts", async () => {
    await renderPage({});

    expect(screen.getByTestId("rank-tracker-tabs")).toHaveTextContent("tracked:9:2:25");
    expect(screen.getByTestId("tracked-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-workspace")).not.toBeInTheDocument();
    expect(capturedInitialAction).toBeNull();
    expect(capturedInitialDensity).toBe("standard");
    expect(mocks.getRankTrackerKeywordList).toHaveBeenCalledWith({
      projectRef: "prj_1",
      query: expect.objectContaining({ grouped: false, page: 1 }),
    });
    expect(mocks.getKeywordRows).not.toHaveBeenCalled();
    expect(capturedGridProps.listMode).toBe("flat-server");
    expect(mocks.getCheckHealth).toHaveBeenCalledWith("prj_1");
    expect(mocks.isProviderConnected).toHaveBeenCalledWith("prj_1", "gsc");
    expect(mocks.loadRankTrackerCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("promotes the legacy market lens to the market route", async () => {
    mocks.resolveLegacyMarketRef.mockResolvedValue("pmkt_one");

    await expect(renderPage({ market: "location_internal_1", tab: "saved" })).rejects.toThrow(
      "NEXT_REDIRECT:/app/prj_1/m/pmkt_one/rank-tracker?tab=saved",
    );
    expect(mocks.resolveLegacyMarketRef).toHaveBeenCalledWith("project_1", "location_internal_1");
  });

  it("drops a legacy market value this project cannot resolve", async () => {
    await expect(renderPage({ market: "loc_gone" })).rejects.toThrow(
      "NEXT_REDIRECT:/app/prj_1/rank-tracker",
    );
  });

  it("leaves the market route alone, so the segment is never undone by the legacy lens", async () => {
    render(
      await KeywordsPage({
        params: Promise.resolve({ market: "pmkt_one", project: "prj_1" }),
        searchParams: Promise.resolve({ market: "loc_frankfurt" }),
      }),
    );

    expect(permanentRedirect).not.toHaveBeenCalled();
    expect(mocks.resolveLegacyMarketRef).not.toHaveBeenCalled();
  });

  it("uses the grouped client fallback only when grouped is explicit", async () => {
    mocks.getKeywordRows.mockResolvedValue([]);
    await renderPage({ grouped: "1" });

    expect(mocks.getKeywordRows).toHaveBeenCalledWith("prj_1");
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(capturedGridProps.listMode).toBe("grouped-client");
  });

  it("canonicalizes stale saved-view identity and preserves explicit and orthogonal state", async () => {
    await expect(
      renderPage({
        action: "filter",
        add: "1",
        q: "",
        tab: "tracked",
        tags: "",
        view: "viw_stale",
      }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const href = String(redirect.mock.calls[0]?.[0]);
    expect(href).not.toContain("view=");
    expect(href).toContain("q=");
    expect(href).toContain("tags=");
    expect(href).toContain("tab=tracked");
    expect(href).toContain("add=1");
    expect(href).toContain("action=filter");
  });

  it("canonicalizes a stale location once and accepts the canonical reload", async () => {
    await expect(
      renderPage({ action: "filter", location: "stale", q: "kept", tab: "tracked" }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const href = String(redirect.mock.calls[0]?.[0]);
    expect(href).toContain("location=");
    expect(href).not.toContain("location=stale");
    expect(href).toContain("q=kept");
    expect(href).toContain("tab=tracked");
    expect(href).toContain("action=filter");

    redirect.mockClear();
    await renderPage(Object.fromEntries(new URL(href, "https://example.com").searchParams));
    expect(redirect).not.toHaveBeenCalled();
  });

  it("passes each validated action and rejects unknown input", async () => {
    for (const action of ["add", "import", "export", "filter"] as const) {
      await renderPage({ action });
      expect(capturedInitialAction).toBe(action);
    }
    await renderPage({ action: "run-check" });
    expect(capturedInitialAction).toBeNull();
    await renderPage({ action: "unknown" });
    expect(capturedInitialAction).toBeNull();
  });

  it("renders the Saved branch for the ?tab=saved deep link", async () => {
    await renderPage({ tab: "saved" });

    expect(screen.getByTestId("saved-workspace")).toHaveTextContent("9:2");
    expect(screen.queryByTestId("tracked-grid")).not.toBeInTheDocument();
    expect(mocks.listSavedKeywords).toHaveBeenCalledWith("prj_1");
    expect(mocks.loadRankTrackerCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("renders the Runs branch for the ?tab=runs deep link", async () => {
    await renderPage({ tab: "runs" });

    expect(screen.getByTestId("rank-tracker-tabs")).toHaveTextContent("runs:9:2:25");
    expect(screen.getByTestId("runs-section")).toHaveTextContent("prj_1:1:2");
    expect(screen.queryByTestId("tracked-grid")).not.toBeInTheDocument();
    expect(mocks.listRankCheckRuns).toHaveBeenCalledTimes(2);
    expect(mocks.listRankCheckRuns).toHaveBeenCalledWith("project_1", expect.any(URL));
    const segments = mocks.listRankCheckRuns.mock.calls.map(([, url]) =>
      (url as URL).searchParams.get("segment"),
    );
    expect(segments).toEqual(["history", "planned"]);
  });

  it("redirects the retired checks deep link to runs and preserves its run", async () => {
    await expect(
      renderPage({ run: "check_abcdefghijklmnopqrstuvwx", tab: "checks" }),
    ).rejects.toThrow("NEXT_REDIRECT:");

    expect(redirect).toHaveBeenCalledWith(
      "/app/prj_1/rank-tracker?run=check_abcdefghijklmnopqrstuvwx&tab=runs",
    );
  });
});
