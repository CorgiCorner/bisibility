import { HEADER_CONTEXT_LABEL } from "@/components/shell/HeaderContextSlot";
import { asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { permanentRedirect, redirect, setNavigationState } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCheckHealth: vi.fn(),
  getKeywordDefaultMarket: vi.fn(),
  getKeywordTagSuggestions: vi.fn(),
  getPreferences: vi.fn(),
  getProjectMarkets: vi.fn(),
  getRankCheckRunCount: vi.fn(),
  isProviderConnected: vi.fn(),
  listHeaderMarkets: vi.fn(),
  listSavedViews: vi.fn(),
  loadRankTrackerCostContext: vi.fn(),
  loadRankTrackerPageList: vi.fn(),
  requireMarketContext: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  resolveRankTrackerPageQuery: vi.fn(),
  savedKeywordCount: vi.fn(),
}));

let capturedGridProps: Record<string, unknown> = {};

vi.mock("@/app/app/(workspace)/workspace-shell", () => ({
  WorkspaceShell: ({
    children,
    context,
  }: {
    children: React.ReactNode;
    context: React.ReactNode;
  }) => (
    <div>
      {context}
      {children}
    </div>
  ),
}));
vi.mock("@/components/keywords/grid/KeywordsGrid", () => ({
  KeywordsGrid: (props: Record<string, unknown>) => {
    capturedGridProps = props;
    return (
      <table aria-label="Rank Tracker grid">
        <tbody>
          <tr>
            <td>
              <button type="button">Filters</button>
            </td>
            <td>
              <button type="button">Run checks</button>
            </td>
          </tr>
        </tbody>
      </table>
    );
  },
}));
vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({
  RankTrackerTabs: () => <button type="button">Tracked</button>,
}));
vi.mock("@/components/ui/Tooltip", () => import("@/tests/tooltip-stub"));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: () => "owner" }));
vi.mock("@/lib/auth/capabilities", () => ({ canProjectAction: () => true }));
vi.mock("@/lib/markets/market-context", () => ({
  requireMarketContext: mocks.requireMarketContext,
  resolveLegacyMarketRef: vi.fn(),
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
vi.mock("@/lib/queries/header-markets", () => ({ listHeaderMarkets: mocks.listHeaderMarkets }));
vi.mock("@/lib/queries/integrations", () => ({ isProviderConnected: mocks.isProviderConnected }));
vi.mock("@/lib/queries/keywords", () => ({
  getKeywordDefaultMarket: mocks.getKeywordDefaultMarket,
  getKeywordTagSuggestions: mocks.getKeywordTagSuggestions,
}));
vi.mock("@/lib/queries/project-markets", () => ({ getProjectMarkets: mocks.getProjectMarkets }));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRunCount: mocks.getRankCheckRunCount,
}));
vi.mock("@/lib/queries/saved-keywords", () => ({ savedKeywordCount: mocks.savedKeywordCount }));
vi.mock("@/lib/queries/saved-views", () => ({ listSavedViews: mocks.listSavedViews }));
vi.mock("./../../../rank-tracker/rank-tracker-page-data", () => ({
  loadRankTrackerPageList: mocks.loadRankTrackerPageList,
  resolveRankTrackerPageQuery: mocks.resolveRankTrackerPageQuery,
}));

import HeaderContextRoute from "@/app/app/(workspace)/[project]/@context/m/[market]/[...page]/page";
import ProjectLayout from "@/app/app/(workspace)/[project]/layout";
import MarketLayout from "@/app/app/(workspace)/[project]/m/[market]/layout";
import MarketRankTrackerPage from "./page";

const PROJECT = asProjectRef(`prj_${"a".repeat(24)}`);
const MARKET = asMarketRef(`pmkt_${"b".repeat(24)}`);
const MARKET_LOCATION_ID = "loc_belgium";
const MARKET_LOCATION_KEY = "BE@ar";

function pageQuery(locationId: string | null) {
  return {
    filters: {},
    grouped: false,
    lens: { device: "all" as const, locationId },
    page: 1,
    pageSize: 25,
    savedViewId: null,
    search: "",
    sort: { direction: "asc" as const, field: "keyword" as const },
  };
}

async function renderMarketRankTrackerRoute() {
  const params = Promise.resolve({ market: MARKET, project: PROJECT });
  setNavigationState({ pathname: marketPath(PROJECT, MARKET, "rank-tracker") });
  const page = await MarketRankTrackerPage({ params, searchParams: Promise.resolve({}) });
  const marketLayout = await MarketLayout({ children: page, params });
  const context = await HeaderContextRoute({
    params: Promise.resolve({ market: MARKET, page: ["rank-tracker"], project: PROJECT }),
  });
  render(
    await ProjectLayout({
      children: marketLayout,
      context,
      params: Promise.resolve({ project: PROJECT }),
    }),
  );
}

describe("market Rank Tracker route composition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedGridProps = {};
    redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    permanentRedirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.getCheckHealth.mockResolvedValue({ providerConnected: true });
    mocks.getKeywordDefaultMarket.mockResolvedValue(null);
    mocks.getKeywordTagSuggestions.mockResolvedValue([]);
    mocks.getPreferences.mockResolvedValue({ density: "standard" });
    mocks.getProjectMarkets.mockResolvedValue({ markets: [] });
    mocks.getRankCheckRunCount.mockResolvedValue(0);
    mocks.isProviderConnected.mockResolvedValue(true);
    mocks.listHeaderMarkets.mockResolvedValue([
      { countryCode: "BE", keywordCount: 7, languageCode: "ar", name: "Belgium", ref: MARKET },
    ]);
    mocks.listSavedViews.mockResolvedValue([]);
    mocks.loadRankTrackerCostContext.mockResolvedValue(null);
    mocks.loadRankTrackerPageList.mockImplementation(async (_projectRef, query) => ({
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [],
      matchedTargetCount: 7,
      mode: "flat-server",
      page: 1,
      pageCount: 1,
      pageSize: 25,
      query,
      rows: [],
      totalCount: 7,
      totalKeywordCount: 7,
    }));
    mocks.requireMarketContext.mockResolvedValue({
      locationKey: MARKET_LOCATION_KEY,
      market: { locationId: MARKET_LOCATION_ID, ref: MARKET },
      projectId: "project_1",
      projectRef: PROJECT,
    });
    mocks.requireReadableProject.mockResolvedValue({
      actor: { id: "user_1", memberships: [] },
      project: { id: "project_1", publicId: PROJECT },
    });
    mocks.resolveProjectAccess.mockResolvedValue({ projectId: "project_1", publicId: PROJECT });
    mocks.resolveRankTrackerPageQuery.mockResolvedValue({
      activeView: null,
      groupedWasSpecified: false,
      malformedDevice: false,
      query: pageQuery(null),
      staleView: false,
    });
    mocks.savedKeywordCount.mockResolvedValue(0);
  });

  it("renders the shell, switcher, grid, and controls for a seeded market", async () => {
    await renderMarketRankTrackerRoute();

    expect(screen.getByRole("group", { name: HEADER_CONTEXT_LABEL })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Belgium" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Rank Tracker grid" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Filters" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run checks" })).toBeInTheDocument();
    expect(mocks.loadRankTrackerPageList).toHaveBeenCalledWith(
      PROJECT,
      expect.objectContaining({ lens: { device: "all", locationId: MARKET_LOCATION_KEY } }),
      false,
    );
    expect(capturedGridProps.lens).toEqual({ device: "all", locationId: MARKET_LOCATION_KEY });
  });
});
