import KeywordsPage from "@/app/(regional)/app/(workspace)/[project]/rank-tracker/page";
import { RankTrackerFeatureBoundary } from "@/components/rank-tracker/RankTrackerFeatureBoundary";
import { redirect } from "@/tests/next-navigation";
import { render } from "@testing-library/react";
import { cloneElement, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCheckHealth: vi.fn(),
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
  listRankCheckRuns: vi.fn(),
  listSavedKeywords: vi.fn(),
  listSavedViews: vi.fn(),
  loadWorkspaceBudgetSummary: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  savedKeywordCount: vi.fn(),
}));

const state = vi.hoisted(() => ({ initialAddOpen: undefined as boolean | undefined }));

vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: vi.fn(async () => ({ locale: "en", timeZone: "UTC" })),
}));

vi.mock("@/components/keywords/grid/KeywordsGrid", () => ({
  KeywordsGrid: ({ initialAddOpen }: { initialAddOpen?: boolean }) => {
    state.initialAddOpen = initialAddOpen;
    return null;
  },
}));
vi.mock("@/components/keywords/saved/SavedKeywordsWorkspace", () => ({
  SavedKeywordsWorkspace: () => null,
}));
vi.mock("@/components/rank-runs/RunsSection", () => ({ RunsSection: () => null }));
vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({ RankTrackerTabs: () => null }));
vi.mock("@/lib/auth/authorize", () => ({ getProjectRole: () => "owner" }));
vi.mock("@/lib/auth/capabilities", () => ({
  canDeleteProjectSavedView: () => true,
  canProjectAction: () => true,
}));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  getQueryActor: async () => ({ id: "user_1" }),
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
vi.mock("@/lib/queries/project-markets", () => ({ getProjectMarkets: mocks.getProjectMarkets }));
vi.mock("@/lib/queries/rank-check-runs", () => ({
  getRankCheckRunCount: mocks.getRankCheckRunCount,
  listRankCheckRuns: mocks.listRankCheckRuns,
}));
vi.mock("@/lib/queries/rank-tracker-list", () => ({
  getRankTrackerKeywordList: mocks.getRankTrackerKeywordList,
}));
vi.mock("@/lib/queries/saved-keywords", () => ({
  listSavedKeywords: mocks.listSavedKeywords,
  savedKeywordCount: mocks.savedKeywordCount,
}));
vi.mock("@/lib/queries/saved-views", () => ({
  getSavedView: mocks.getSavedView,
  listSavedViews: mocks.listSavedViews,
  listSessionSavedViews: mocks.listSavedViews,
}));
vi.mock("@/lib/queries/rank-tracker-personal-context", async () => {
  const { personalContextFixture } = await import("./personal-context-test-fixture");
  return {
    loadRankTrackerPersonalContext: async (
      projectId: string,
      params: Record<string, string | string[] | undefined>,
    ) => personalContextFixture(projectId, params, await mocks.listSavedViews()),
  };
});
vi.mock("@/lib/queries/workspace-budget-summary", () => ({
  loadWorkspaceBudgetSummary: mocks.loadWorkspaceBudgetSummary,
}));

async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  const page = (await KeywordsPage({
    params: Promise.resolve({ project: "prj_1" }),
    searchParams: Promise.resolve(searchParams),
  })) as ReactElement<{ children: ReactElement }>;
  const boundary = page.props.children as ReactElement<
    Parameters<typeof RankTrackerFeatureBoundary>[0]
  >;

  expect(boundary.type).toBe(RankTrackerFeatureBoundary);
  render(cloneElement(page, undefined, await RankTrackerFeatureBoundary(boundary.props)));
}

describe("KeywordsPage canonicalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.initialAddOpen = undefined;
    redirect.mockImplementation((href: string) => {
      throw new Error(`NEXT_REDIRECT:${href}`);
    });
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.getCheckHealth.mockResolvedValue({ budget: {}, providerConnected: true });
    mocks.getKeywordCount.mockResolvedValue(9);
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
    mocks.getKeywordTagSuggestions.mockResolvedValue([]);
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
    mocks.getRankCheckRunCount.mockResolvedValue(0);
    mocks.listRankCheckRuns.mockResolvedValue({ data: [], nextCursor: null });
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

  it("preserves the legacy add entry", async () => {
    await renderPage({ add: "1" });
    expect(state.initialAddOpen).toBe(true);
  });

  it("canonicalizes a zero-result page to one with full query semantics", async () => {
    mocks.listSavedViews.mockResolvedValue([
      {
        canDelete: true,
        config: {
          filters: {
            change: "any",
            contains: "",
            intents: [],
            lastCheck: "any",
            position: [],
            serp: [],
            tags: ["saved"],
            topics: [],
            urlChanged: false,
            volMax: 50,
            volMin: 0,
            wrongUrl: false,
          },
          lens: { device: "desktop", locationId: null },
          search: "saved",
          surface: "keywords",
          version: 1,
        },
        id: `viw_${"a".repeat(24)}`,
        name: "Saved",
        surface: "keywords",
        canEdit: true,
        visibility: "project",
        projectId: "prj_1",
        revision: 1,
        createdAt: "2026-10-14T00:00:00Z",
      },
    ]);
    await expect(
      renderPage({
        action: "filter",
        add: "1",
        page: "99",
        q: "no matches",
        tab: "tracked",
        tags: "",
        view: `viw_${"a".repeat(24)}`,
      }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const href = String(redirect.mock.calls[0]?.[0]);
    expect(href).toContain("page=1");
    expect(href).toContain("q=no+matches");
    expect(href).toContain("tags=");
    expect(href).toContain(`view=viw_${"a".repeat(24)}`);
    expect(href).toContain("tab=tracked");
    expect(href).toContain("add=1");
    expect(href).toContain("action=filter");
  });

  it("redirects an out-of-range flat page to the last valid page", async () => {
    mocks.getRankTrackerKeywordList.mockResolvedValueOnce({
      facets: { intents: [], positions: [], tags: [], topics: [] },
      locations: [],
      matchedTargetCount: 51,
      page: 3,
      pageCount: 3,
      pageSize: 25,
      resolvedLens: { device: "desktop", locationId: null },
      rows: [],
      totalCount: 51,
    });
    await expect(
      renderPage({
        action: "filter",
        add: "1",
        page: "99",
        pageSize: "25",
        tags: "",
        tab: "tracked",
      }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("page=3"));
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("tags="));
    expect(redirect).toHaveBeenCalledWith(expect.stringContaining("action=filter"));
  });

  it("rejects malformed device without broadening the URL or reading ranking results", async () => {
    const page = (await KeywordsPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve({
        action: "filter",
        add: "1",
        device: "tablet",
        q: "",
        tab: "tracked",
        tags: "",
      }),
    })) as ReactElement<{ children: ReactElement<{ status: string }> }>;
    expect(page.props.children.props.status).toBe("invalid_url");
    expect(redirect).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerKeywordList).not.toHaveBeenCalled();
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
  });
});
