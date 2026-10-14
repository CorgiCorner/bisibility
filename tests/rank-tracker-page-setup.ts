import { permanentRedirect, redirect } from "@/tests/next-navigation";
import { vi } from "vitest";
import type { getPageMocks, captured as pageCaptured } from "./rank-tracker-page";
import {
  PAGE_ACTOR_ID,
  PAGE_PROJECT_ID,
  PAGE_PROJECT_REF,
  pageActor,
  pageFlatList,
  pageGroupedList,
  pagePreference,
  pageReadable,
} from "./rank-tracker-page-fixtures";
import { pageReportOptions } from "./rank-tracker-page-report-fixtures";

export function initializePageActor(
  mocks: ReturnType<typeof getPageMocks>,
  actorId = PAGE_ACTOR_ID,
) {
  mocks.getQueryActor.mockResolvedValue(pageActor(actorId));
  mocks.requireReadableProject.mockResolvedValue(pageReadable(pageActor(actorId)));
}

export function initializePageFixture(
  mocks: ReturnType<typeof getPageMocks>,
  captured: typeof pageCaptured,
) {
  vi.clearAllMocks();
  redirect.mockImplementation((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  });
  permanentRedirect.mockImplementation((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  });
  Object.assign(captured, {
    gridProps: {},
    initialAction: undefined,
    initialDensity: undefined,
    presentation: null,
    reportOptions: null,
    personalPreferences: null,
    notice: null,
  });
  initializePageActor(mocks);
  mocks.resolveLegacyMarketRef.mockResolvedValue(null);
  mocks.resolveProjectAccess.mockResolvedValue({
    mode: "member",
    projectId: PAGE_PROJECT_ID,
    publicId: PAGE_PROJECT_REF,
  });
  mocks.getPersonalSurfacePreference.mockResolvedValue(pagePreference());
  mocks.listSessionSavedViews.mockResolvedValue([]);
  mocks.scopeLocations.mockResolvedValue(
    ["US", "krakow"].map((canonicalKey) => ({ locationRef: { canonicalKey } })),
  );
  mocks.scopeMarkets.mockResolvedValue([]);
  mocks.scopeTags.mockResolvedValue([{ name: "Service" }]);
  mocks.createSessionRankTrackerReportOptions.mockImplementation(async () => {
    const actor = await mocks.getQueryActor();
    captured.reportOptions = pageReportOptions(actor.id);
    return captured.reportOptions;
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
  mocks.getRankTrackerGroupedList.mockImplementation(async ({ query }) => pageGroupedList(query));
  mocks.getRankTrackerKeywordList.mockImplementation(async ({ query }) => pageFlatList(query));
  mocks.getKeywordTagSuggestions.mockResolvedValue([]);
  mocks.loadRankTrackerCostContext.mockResolvedValue({ costPerCheckCents: 1, spentCents: 3900 });
  mocks.getProjectMarkets.mockResolvedValue({
    markets: [],
    maxMarkets: 5,
    monthlyCostCents: 0,
    perMarketChecks: 0,
    projectId: PAGE_PROJECT_ID,
  });
  mocks.isProviderConnected.mockResolvedValue(true);
  mocks.getPreferences.mockResolvedValue({
    dateFormat: "iso",
    density: "standard",
    landing: "dashboard",
    theme: "system",
  });
  mocks.listSavedKeywords.mockResolvedValue({ rows: [], total: 2 });
  mocks.savedKeywordCount.mockResolvedValue(2);
}
