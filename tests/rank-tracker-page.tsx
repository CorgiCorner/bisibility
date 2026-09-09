import KeywordsPage from "@/app/app/(workspace)/[project]/rank-tracker/page";
import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import { permanentRedirect, redirect } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCheckHealth: vi.fn(),
  resolveLegacyMarketRef: vi.fn(),
  getKeywordCount: vi.fn(),
  getRankCheckRunCount: vi.fn(),
  getKeywordDefaultMarket: vi.fn(),
  getKeywordTagSuggestions: vi.fn(),
  getPreferences: vi.fn(),
  loadRankTrackerCostContext: vi.fn(),
  getProjectMarkets: vi.fn(),
  getRankTrackerGroupedList: vi.fn(),
  getRankTrackerKeywordList: vi.fn(),
  getSavedView: vi.fn(),
  isProviderConnected: vi.fn(),
  listSavedKeywords: vi.fn(),
  listSavedViews: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  savedKeywordCount: vi.fn(),
}));

export const captured = {
  gridProps: {} as Record<string, unknown>,
  initialAction: undefined as RankTrackerAction | null | undefined,
  initialDensity: undefined as string | undefined,
};

vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({
  RankTrackerTabs: (props: { activeTab: string; savedCount: number; trackedCount: number }) => (
    <div data-testid="rank-tracker-tabs">
      {props.activeTab}:{props.trackedCount}:{props.savedCount}
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
    captured.gridProps = props;
    captured.initialAction = props.initialAction;
    captured.initialDensity = props.initialDensity;
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
  getKeywordTagSuggestions: mocks.getKeywordTagSuggestions,
}));
vi.mock("@/lib/queries/rank-tracker-grouped-list", () => ({
  getRankTrackerGroupedList: mocks.getRankTrackerGroupedList,
}));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRunCount: mocks.getRankCheckRunCount,
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
vi.mock("@/lib/queries/saved-views", () => ({
  getSavedView: mocks.getSavedView,
  listSavedViews: mocks.listSavedViews,
}));

export function getPageMocks() {
  return mocks;
}

export function setupPageTest() {
  vi.clearAllMocks();
  redirect.mockImplementation((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  });
  permanentRedirect.mockImplementation((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  });
  mocks.resolveLegacyMarketRef.mockResolvedValue(null);
  captured.gridProps = {};
  captured.initialAction = undefined;
  captured.initialDensity = undefined;
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
  mocks.getRankTrackerGroupedList.mockResolvedValue({
    facets: { intents: [], positions: [], tags: [], topics: [] },
    groups: [],
    locations: [],
    matchedGroupCount: 0,
    matchedTargetCount: 0,
    page: 1,
    pageCount: 0,
    pageSize: 25,
    resolvedLens: { device: "all", locationId: null },
    totalCount: 9,
  });
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
  mocks.loadRankTrackerCostContext.mockResolvedValue({ costPerCheckCents: 1, spentCents: 3900 });
  mocks.getProjectMarkets.mockResolvedValue({
    markets: [],
    maxMarkets: 5,
    monthlyCostCents: 0,
    perMarketChecks: 0,
    projectId: "prj_1",
  });
  mocks.getSavedView.mockResolvedValue(null);
  mocks.isProviderConnected.mockResolvedValue(true);
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
}

export async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  render(
    await KeywordsPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}

export async function renderPageAt(
  params: { market?: string; project: string },
  searchParams: Record<string, string | string[] | undefined>,
) {
  render(
    await KeywordsPage({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(searchParams),
    }),
  );
}
