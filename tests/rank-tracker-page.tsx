import KeywordsPage from "@/app/(regional)/app/(workspace)/[project]/rank-tracker/page";
import { KeywordPresentationDraftContext } from "@/components/keywords/grid/KeywordPresentationDraftProvider";
import type { KeywordsGridProps } from "@/components/keywords/grid/keywords-grid-types";
import {
  projectRankTrackerFeatureTestMessages,
  renderWithFeatureMessages as render,
} from "@/i18n/test-support/render-with-feature-messages";
import type { RankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import type { KeywordPersonalViewContext } from "@/lib/saved-views/keyword-personal-context";
import type { TablePresentation } from "@/lib/saved-views/presentation-model";
import { type ReactNode, useContext } from "react";
import { vi } from "vitest";
import { PAGE_PROJECT_REF, pagePreference, pageView } from "./rank-tracker-page-fixtures";
import { initializePageActor, initializePageFixture } from "./rank-tracker-page-setup";

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
  getQueryActor: vi.fn(),
  isProviderConnected: vi.fn(),
  listSavedKeywords: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveProjectAccess: vi.fn(),
  savedKeywordCount: vi.fn(),
  getPersonalSurfacePreference: vi.fn(),
  listSessionSavedViews: vi.fn(),
  scopeLocations: vi.fn(),
  scopeMarkets: vi.fn(),
  scopeTags: vi.fn(),
  createSessionRankTrackerReportOptions: vi.fn(),
}));

export const captured = {
  gridProps: {} as Record<string, unknown>,
  initialAction: undefined as RankTrackerAction | null | undefined,
  initialDensity: undefined as string | undefined,
  presentation: null as TablePresentation | null,
  reportOptions: null as RankTrackerReportOptions | null,
  personalPreferences: null as KeywordPersonalViewContext | null,
  notice: null as { status: string; href: string } | null,
};

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    keyword: { findMany: mocks.scopeLocations },
    projectMarket: { findMany: mocks.scopeMarkets },
    tag: { findMany: mocks.scopeTags },
  },
}));
vi.mock("@/lib/project-surface-preferences/query", () => ({
  getPersonalSurfacePreference: mocks.getPersonalSurfacePreference,
}));
vi.mock("@/lib/queries/rank-tracker-session-report", () => ({
  createSessionRankTrackerReportOptions: mocks.createSessionRankTrackerReportOptions,
}));
vi.mock("@/components/rank-tracker/RankTrackerFeatureBoundary", () => ({
  RankTrackerFeatureBoundary: ({ children }: { children: ReactNode }) => children,
}));
vi.mock("@/components/rank-tracker/RankTrackerTabs", () => ({
  RankTrackerTabs: (props: { activeTab: string; savedCount: number; trackedCount: number }) => (
    <div data-testid="rank-tracker-tabs">
      {props.activeTab}:{props.trackedCount}:{props.savedCount}
    </div>
  ),
}));
vi.mock("@/components/keywords/grid/KeywordsGrid", () => ({
  KeywordsGrid: (props: Readonly<KeywordsGridProps>) => {
    captured.gridProps = { ...props };
    captured.personalPreferences = props.personalPreferences ?? null;
    captured.initialAction = props.initialAction;
    captured.initialDensity = props.initialDensity;
    captured.presentation = useContext(KeywordPresentationDraftContext)?.draft ?? null;
    return <div data-testid="tracked-grid" />;
  },
}));
// Only the async notice leaf is synchronous here; status is produced by the actual context and resolver.
vi.mock("@/components/saved-views/PersonalViewScopeNotice", () => ({
  PersonalViewScopeNotice: (props: { status: string; href: string }) => {
    captured.notice = props;
    return (
      <section>
        <p role="status">{props.status}</p>
        <a href={props.href}>General</a>
      </section>
    );
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
  getQueryActor: mocks.getQueryActor,
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
  listSessionSavedViews: mocks.listSessionSavedViews,
}));

export function getPageMocks() {
  return mocks;
}
export function getPageReportOptions() {
  if (!captured.reportOptions)
    throw new Error("Page fixture requires the session report port to have been constructed");
  return captured.reportOptions;
}
export function getPagePersonalPreferences() {
  if (!captured.personalPreferences)
    throw new Error("Page fixture requires a rendered personal context");
  return captured.personalPreferences;
}
export function setupPageDefaultView(version: 1 | 2 = 2, grouped = true) {
  const view = pageView(version, grouped);
  mocks.listSessionSavedViews.mockResolvedValue([view]);
  mocks.getPersonalSurfacePreference.mockResolvedValue({
    ...pagePreference(),
    defaultTarget: { kind: "saved_view", viewId: view.id },
    revision: 7,
  });
  return view;
}
export function setupPageActor(actorId?: string) {
  initializePageActor(mocks, actorId);
}
export function setupPageTest() {
  initializePageFixture(mocks, captured);
}

export async function renderPage(searchParams: Record<string, string | string[] | undefined>) {
  return render(
    await KeywordsPage({
      params: Promise.resolve({ project: PAGE_PROJECT_REF }),
      searchParams: Promise.resolve(searchParams),
    }),
    { messages: projectRankTrackerFeatureTestMessages },
  );
}
export async function renderPageAt(
  params: { market?: string; project: string },
  searchParams: Record<string, string | string[] | undefined>,
) {
  return render(
    await KeywordsPage({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(searchParams),
    }),
    { messages: projectRankTrackerFeatureTestMessages },
  );
}
