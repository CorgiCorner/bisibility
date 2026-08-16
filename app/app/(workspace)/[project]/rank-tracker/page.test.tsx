import { checkRunsFixtureView } from "@/components/checks/runs/check-runs-fixtures";
import { upcomingViewFixture } from "@/components/checks/upcoming/upcoming-fixtures";
import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KeywordsPage from "./page";

const mocks = vi.hoisted(() => ({
  getCheckHealth: vi.fn(),
  getCheckRunsView: vi.fn(),
  getKeywordCount: vi.fn(),
  getKeywordDefaultMarket: vi.fn(),
  getKeywordRows: vi.fn(),
  getKeywordTagSuggestions: vi.fn(),
  getPreferences: vi.fn(),
  getProjectCostContext: vi.fn(),
  getProjectMarkets: vi.fn(),
  getSavedView: vi.fn(),
  getRequestSerpProviderChain: vi.fn(),
  getUpcomingView: vi.fn(),
  listSavedKeywords: vi.fn(),
  listSavedViews: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  savedKeywordCount: vi.fn(),
}));

let capturedInitialAction: RankTrackerAction | null | undefined;
let capturedInitialAddOpen: boolean | undefined;
let capturedInitialDensity: string | undefined;

vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({
  RankTrackerTabs: (props: { activeTab: string; savedCount: number; trackedCount: number }) => (
    <div data-testid="rank-tracker-tabs">
      {props.activeTab}:{props.trackedCount}:{props.savedCount}
    </div>
  ),
}));
vi.mock("@/components/checks/ChecksWorkspace", () => ({
  ChecksWorkspace: (props: { projectId: string; providerOptions: unknown[] }) => (
    <div data-testid="checks-workspace">
      {props.projectId}:{props.providerOptions.length}
    </div>
  ),
}));
vi.mock("@/components/keywords/grid/KeywordsGrid", () => ({
  KeywordsGrid: (props: {
    initialAction?: RankTrackerAction | null;
    initialAddOpen?: boolean;
    initialDensity?: string;
  }) => {
    capturedInitialAction = props.initialAction;
    capturedInitialAddOpen = props.initialAddOpen;
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
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/lib/queries/account", () => ({ getPreferences: mocks.getPreferences }));
vi.mock("@/lib/queries/check-health", () => ({ getCheckHealth: mocks.getCheckHealth }));
vi.mock("@/lib/queries/check-runs", () => ({
  getCheckRunsView: mocks.getCheckRunsView,
  getUpcomingView: mocks.getUpcomingView,
}));
vi.mock("@/lib/queries/cost-calculator", () => ({
  getProjectCostContext: mocks.getProjectCostContext,
}));
vi.mock("@/lib/queries/keywords", () => ({
  getKeywordCount: mocks.getKeywordCount,
  getKeywordDefaultMarket: mocks.getKeywordDefaultMarket,
  getKeywordRows: mocks.getKeywordRows,
  getKeywordTagSuggestions: mocks.getKeywordTagSuggestions,
  KEYWORD_LIST_MAX: 1000,
}));
vi.mock("@/lib/queries/project-markets", () => ({
  getProjectMarkets: mocks.getProjectMarkets,
}));
vi.mock("@/lib/queries/saved-keywords", () => ({
  listSavedKeywords: mocks.listSavedKeywords,
  savedKeywordCount: mocks.savedKeywordCount,
}));
vi.mock("@/lib/queries/saved-views", () => ({
  getSavedView: mocks.getSavedView,
  listSavedViews: mocks.listSavedViews,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestSerpProviderChain: mocks.getRequestSerpProviderChain,
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
    capturedInitialAction = undefined;
    capturedInitialAddOpen = undefined;
    capturedInitialDensity = undefined;
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getCheckHealth.mockResolvedValue({ budget: {}, providerConnected: true });
    mocks.getCheckRunsView.mockResolvedValue(checkRunsFixtureView);
    mocks.getKeywordCount.mockResolvedValue(9);
    mocks.getKeywordDefaultMarket.mockResolvedValue({
      city: null,
      country: "United States",
      device: "desktop",
      displayName: "United States",
      locationKey: "US",
      source: "explicit",
    });
    mocks.getKeywordRows.mockResolvedValue([]);
    mocks.getKeywordTagSuggestions.mockResolvedValue([]);
    mocks.getProjectCostContext.mockResolvedValue({ costPerCheckCents: 1 });
    mocks.getProjectMarkets.mockResolvedValue({
      markets: [],
      maxMarkets: 5,
      monthlyCostCents: 0,
      perMarketChecks: 0,
      projectId: "prj_1",
    });
    mocks.getSavedView.mockResolvedValue(null);
    mocks.getRequestSerpProviderChain.mockResolvedValue([
      { isPrimary: true, provider: "dataforseo" },
    ]);
    mocks.getUpcomingView.mockResolvedValue(upcomingViewFixture);
    mocks.getPreferences.mockResolvedValue({
      dateFormat: "iso",
      density: "standard",
      landing: "dashboard",
      theme: "system",
    });
    mocks.listSavedKeywords.mockResolvedValue({ rows: [], total: 2 });
    mocks.listSavedViews.mockResolvedValue([]);
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [{ projectId: "project_1", role: "owner" }] },
      project: { id: "project_1", publicId: "prj_1" },
    });
    mocks.savedKeywordCount.mockResolvedValue(2);
  });

  it("keeps Tracked as the default branch and renders both counts", async () => {
    await renderPage({});

    expect(screen.getByTestId("rank-tracker-tabs")).toHaveTextContent("tracked:0:2");
    expect(screen.getByTestId("tracked-grid")).toBeInTheDocument();
    expect(screen.queryByTestId("saved-workspace")).not.toBeInTheDocument();
    expect(capturedInitialAction).toBeNull();
    expect(capturedInitialDensity).toBe("standard");
    expect(mocks.getKeywordRows).toHaveBeenCalledWith("prj_1");
    expect(mocks.getCheckHealth).toHaveBeenCalledWith("prj_1");
    expect(mocks.getProjectCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
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

  it("preserves the legacy add entry", async () => {
    await renderPage({ add: "1" });
    expect(capturedInitialAddOpen).toBe(true);
  });

  it("renders the Saved branch for the ?tab=saved deep link", async () => {
    await renderPage({ tab: "saved" });

    expect(screen.getByTestId("saved-workspace")).toHaveTextContent("9:2");
    expect(screen.queryByTestId("tracked-grid")).not.toBeInTheDocument();
    expect(mocks.listSavedKeywords).toHaveBeenCalledWith("prj_1");
    expect(mocks.getProjectCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("renders the Checks branch for the ?tab=checks deep link", async () => {
    await renderPage({ tab: "checks" });

    expect(screen.getByTestId("rank-tracker-tabs")).toHaveTextContent("checks:9:2");
    expect(screen.getByTestId("checks-workspace")).toHaveTextContent("prj_1:1");
    expect(screen.queryByTestId("tracked-grid")).not.toBeInTheDocument();
    expect(mocks.getCheckRunsView).toHaveBeenCalledWith(
      "prj_1",
      expect.objectContaining({ limit: 50, range: "7d", status: "all" }),
    );
    expect(mocks.getUpcomingView).toHaveBeenCalledWith(
      "prj_1",
      expect.objectContaining({ now: expect.any(Date) }),
    );
    expect(mocks.getRequestSerpProviderChain).toHaveBeenCalledWith("project_1");
  });
});
