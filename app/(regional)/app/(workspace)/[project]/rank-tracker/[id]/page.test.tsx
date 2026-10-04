import { keywordRows } from "@/components/keywords/keywords-fixtures";
import type { RetrievedResults, StoredResultsIndexEntry } from "@/lib/checks/contract";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import KeywordDetailPage from "./page";

const mocks = vi.hoisted(() => ({
  trafficProps: vi.fn(),
  syncTraffic: vi.fn(),
  getKeywordDetail: vi.fn(),
  getKeywordCompetitors: vi.fn(),
  storedResultsIndex: vi.fn(),
  loadRetrievedResultsForChecks: vi.fn(),
  loadRetrievedResults: vi.fn(),
  getKeywordMarketTargets: vi.fn(),
  getKeywordTagSuggestions: vi.fn(),
  getKeywordTargetContext: vi.fn(),
  loadRankTrackerCostContext: vi.fn(),
  getProjectMarkets: vi.fn(),
  requireReadableProject: vi.fn(),
  resolveRegionalDocumentLocale: vi.fn(),
  resolveProjectAccess: vi.fn(),
}));

vi.mock("@/lib/queries/competitor-policies", () => ({
  getKeywordCompetitors: mocks.getKeywordCompetitors,
}));
vi.mock("@/i18n/document-locale.server", () => ({
  resolveRegionalDocumentLocale: mocks.resolveRegionalDocumentLocale,
}));

vi.mock("@/components/keywords/KeywordHeaderCard", () => ({
  KeywordHeaderCard: () => <div data-testid="header-card" />,
}));
vi.mock("@/components/keywords/KeywordPendingDetail", () => ({
  KeywordPendingDetail: ({ history }: { history?: React.ReactNode }) => (
    <div data-testid="pending-detail">{history}</div>
  ),
}));
vi.mock("@/components/keywords/add/KeywordManagementMessagesBoundary", async () => {
  const { featureMessagesElement, projectRankTrackerFeatureTestMessages } = await import(
    "@/i18n/test-support/render-with-feature-messages"
  );
  return {
    KeywordManagementMessagesBoundary: ({ children }: { children: React.ReactNode }) =>
      featureMessagesElement(children, { messages: projectRankTrackerFeatureTestMessages }),
  };
});
vi.mock("@/components/keywords/KeywordTrafficCard", () => ({
  KeywordTrafficCard: (props: unknown) => {
    mocks.trafficProps(props);
    return <div data-testid="traffic-card" />;
  },
}));
const positionHistoryProps = vi.fn();
const checkScope = {
  device: "mobile",
  engine: "Google",
  location: { ...keywordRows[0].location, languageLabel: "English" },
};
const normalDetailState = {
  ...checkScope,
  checkState: "ranked" as const,
  completedComparableChecks: [
    {
      checkedAt: "2026-08-09T10:00:00.000Z",
      position: 4,
      rankingUrl: "https://example.com/old",
    },
    {
      checkedAt: "2026-08-10T10:00:00.000Z",
      position: 3,
      rankingUrl: "https://example.com/new",
    },
  ],
  hasRankData: true,
  latestAttemptHealth: "ok" as const,
  position: 3,
};

vi.mock("@/components/keywords/PositionHistoryCard", () => ({
  PositionHistoryCard: (props: { chartState?: unknown; keyword: unknown; timeZone: string }) => {
    positionHistoryProps(props);
    return <div data-testid="position-history" />;
  },
}));
vi.mock("@/lib/actions/traffic-sync", () => ({ syncProjectTraffic: mocks.syncTraffic }));
vi.mock("@/lib/actions/retrieved-results", () => ({
  loadRetrievedResults: mocks.loadRetrievedResults,
}));
vi.mock("@/lib/queries/retrieved-results", () => ({
  storedResultsIndex: mocks.storedResultsIndex,
  loadRetrievedResultsForChecks: mocks.loadRetrievedResultsForChecks,
}));
vi.mock("@/lib/rank-check/raw-retention", () => ({ getRankCheckRawRetentionDays: () => 90 }));
vi.mock("@/components/keywords/RankingUrlHistory", () => ({
  RankingUrlHistory: () => <div data-testid="ranking-history" />,
}));
vi.mock("@/lib/actions/alerts", () => ({ createKeywordAlertRule: vi.fn() }));
vi.mock("@/lib/actions/keyword", () => ({
  addKeywords: vi.fn(),
  addKeywordsMatrix: vi.fn(),
  updateKeyword: vi.fn(),
}));
vi.mock("@/lib/actions/keyword-bulk", () => ({ bulkDeleteKeywords: vi.fn() }));
vi.mock("@/lib/actions/keyword-schedule", () => ({ updateKeywordSchedule: vi.fn() }));
vi.mock("@/lib/actions/rankCheck", () => ({ runCheckNow: vi.fn() }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.requireReadableProject,
  resolveProjectAccess: mocks.resolveProjectAccess,
}));
vi.mock("@/components/keywords/rank-tracker-cost-context", () => ({
  loadRankTrackerCostContext: mocks.loadRankTrackerCostContext,
}));
vi.mock("@/lib/queries/keywords", () => ({
  getKeywordDetail: mocks.getKeywordDetail,
  getKeywordTagSuggestions: mocks.getKeywordTagSuggestions,
}));
vi.mock("@/lib/queries/keyword-market-targets", () => ({
  getKeywordMarketTargets: mocks.getKeywordMarketTargets,
}));
vi.mock("@/lib/queries/keyword-target-context", () => ({
  getKeywordTargetContext: mocks.getKeywordTargetContext,
}));
vi.mock("@/lib/queries/project-markets", () => ({
  getProjectMarkets: mocks.getProjectMarkets,
}));

const savedResults: Extract<RetrievedResults, { tier: "full" }>[] = [0, 1].map((index) => ({
  checkId: `check_saved_${index}`,
  checkedAt: `2026-09-0${8 - index}T00:10:00.000Z`,
  provider: index === 0 ? "serpapi" : "dataforseo",
  providerLabel: index === 0 ? "SerpApi" : "DataForSEO",
  tier: "full",
  requestedDepth: 20,
  retrievedPositions: 2,
  trackedPosition: null,
  stoppedAtResult: false,
  rows: [
    {
      position: index + 1,
      domain: "competitor.example.com",
      url: "https://competitor.example.com/page",
      title: "Provider result",
      tracked: false,
    },
  ],
  features: [],
  aiOverview: null,
  fullDetailUntil: null,
}));
const savedEntries: StoredResultsIndexEntry[] = savedResults.map((result) => ({
  checkId: result.checkId,
  checkedAt: result.checkedAt,
  provider: result.provider,
  providerLabel: result.providerLabel,
  tier: result.tier,
  position: null,
  degradedToCountry: false,
  requestedDepth: result.requestedDepth,
  retrievedPositions: result.retrievedPositions,
  stoppedAtResult: result.stoppedAtResult,
  fullDetailUntil: result.fullDetailUntil,
}));

describe("KeywordDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    positionHistoryProps.mockClear();
    mocks.storedResultsIndex.mockResolvedValue([]);
    mocks.getKeywordCompetitors.mockResolvedValue([]);
    mocks.loadRetrievedResultsForChecks.mockResolvedValue([savedResults[0]]);
    mocks.loadRetrievedResults.mockResolvedValue([savedResults[1]]);
    mocks.resolveProjectAccess.mockResolvedValue({
      mode: "member",
      projectId: "project_1",
      publicId: "prj_1",
    });
    mocks.resolveRegionalDocumentLocale.mockResolvedValue({ locale: "en", timeZone: "UTC" });
    mocks.getKeywordTagSuggestions.mockResolvedValue([]);
    mocks.getKeywordMarketTargets.mockResolvedValue([]);
    mocks.loadRankTrackerCostContext.mockResolvedValue({ costPerCheckCents: null });
    mocks.getProjectMarkets.mockResolvedValue({
      markets: [],
      maxMarkets: 5,
      monthlyCostCents: 0,
      perMarketChecks: 0,
      projectId: "prj_1",
    });
    mocks.getKeywordTargetContext.mockResolvedValue({
      projectMarkets: {
        markets: [],
        maxMarkets: 5,
        monthlyCostCents: 0,
        perMarketChecks: 0,
        projectId: "prj_1",
      },
      targets: [],
    });
    mocks.requireReadableProject.mockResolvedValue({
      actor: {
        id: "user_1",
        memberships: [{ projectId: "project_1", role: "owner" }],
      },
      project: { id: "project_1" },
    });
  });

  it("keeps saved position and URL history visible when the latest check is not ranked", async () => {
    mocks.getKeywordDetail.mockResolvedValue({
      ...normalDetailState,
      checkState: "not_ranked",
      position: 101,
      positionHistory: [],
      positionObservations: [
        { checkedAt: "2026-09-22T10:00:00Z", label: "Sep 22", position: 5 },
        { checkedAt: "2026-09-26T23:35:00Z", label: "Sep 26", position: null },
      ],
      rankingUrlHistory: [{ url: "https://example.com/flow" }],
      providerConnected: true,
      traffic: { hasAnalyticsConnection: false, pages: [], query: null },
    });
    render(
      await KeywordDetailPage({ params: Promise.resolve({ id: "kw_pending", project: "prj_1" }) }),
    );
    expect(screen.getByTestId("pending-detail")).toContainElement(
      screen.getByTestId("position-history"),
    );
    expect(screen.getByTestId("ranking-history")).toBeInTheDocument();
  });

  it("renders traffic below pending rank-check detail", async () => {
    mocks.getKeywordDetail.mockResolvedValue({
      checkState: "never_checked",
      hasRankData: false,
      providerConnected: false,
      traffic: { hasAnalyticsConnection: false, pages: [], query: null },
    });

    render(
      await KeywordDetailPage({
        params: Promise.resolve({ id: "kw_pending", project: "prj_1" }),
      }),
    );

    expect(screen.queryByTestId("retrieved-results-card")).not.toBeInTheDocument();
    const pending = screen.getByTestId("pending-detail");
    const traffic = screen.getByTestId("traffic-card");
    expect(mocks.trafficProps).toHaveBeenLastCalledWith(
      expect.objectContaining({
        canSync: true,
        projectRef: "prj_1",
        syncTrafficAction: mocks.syncTraffic,
      }),
    );
    expect(pending.nextElementSibling).toBe(traffic);
    expect(mocks.getKeywordDetail).toHaveBeenCalledWith("prj_1", "kw_pending");
    expect(mocks.loadRankTrackerCostContext).toHaveBeenCalledWith("prj_1");
    expect(mocks.requireReadableProject).toHaveBeenCalledWith("prj_1");
  });

  it("keeps the scoped SERP directly after position history and before traffic", async () => {
    mocks.storedResultsIndex.mockResolvedValue(savedEntries);
    mocks.getKeywordDetail.mockResolvedValue({
      ...normalDetailState,
      cpcKnown: true,
      difficultyKnown: true,
      positionHistory: [
        { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 4 },
        { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
      ],
      rankingUrlHistory: [{ url: "/old" }, { url: "/new" }],
      traffic: {
        hasAnalyticsConnection: true,
        pages: [{ path: "/headless-cms" }],
        query: { provider: "gsc" },
      },
      volumeKnown: true,
    });

    render(
      await KeywordDetailPage({
        params: Promise.resolve({ id: "kw_ranked", project: "prj_1" }),
      }),
    );

    const header = screen.getByTestId("header-card");
    const chart = screen.getByTestId("position-history");
    const traffic = screen.getByTestId("traffic-card");
    const history = screen.getByTestId("ranking-history");
    const retrieved = screen.getByTestId("retrieved-results-card");
    expect(header.nextElementSibling).toBe(chart);
    expect(chart.nextElementSibling).toBe(retrieved);
    expect(retrieved.nextElementSibling).toBe(traffic);
    expect(mocks.trafficProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ canSync: true, syncTrafficAction: mocks.syncTraffic }),
    );
    expect(traffic.nextElementSibling).toBe(history);
    expect(screen.getByLabelText("Check scope")).toHaveTextContent("United StatesEnglishMobile");
  });

  it.each(["ok", "failed", "running"])(
    "keeps provider SERPs and comparison without a domain match when attempt health is %s",
    async (latestAttemptHealth) => {
      mocks.getKeywordDetail.mockResolvedValue({
        ...checkScope,
        id: "kw_unranked",
        checkState: "not_ranked",
        hasRankData: false,
        position: 101,
        latestAttemptHealth,
        rankingUrl: null,
        providerConnected: true,
        traffic: { hasAnalyticsConnection: false, pages: [], query: null },
      });
      mocks.storedResultsIndex.mockResolvedValue(savedEntries);
      render(
        await KeywordDetailPage({
          params: Promise.resolve({ id: "kw_unranked", project: "prj_1" }),
        }),
      );
      expect(screen.getByTestId("pending-detail")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Provider result" })).toHaveAttribute(
        "href",
        "https://competitor.example.com/page",
      );
      expect(screen.getByRole("region", { name: "Retrieved results" })).toBeInTheDocument();
      expect(mocks.loadRetrievedResultsForChecks).toHaveBeenCalledWith({
        checkIds: ["check_saved_0"],
        projectId: "project_1",
      });
      const compare = screen.getByRole("button", { name: "Compare two" });
      expect(compare).toBeEnabled();
      fireEvent.click(compare);
      expect(await screen.findByText(/These checks used different providers/)).toBeInTheDocument();
      await waitFor(() =>
        expect(mocks.loadRetrievedResults).toHaveBeenCalledWith({
          checkIds: ["check_saved_1"],
          projectId: "prj_1",
        }),
      );
      expect(screen.getByRole("heading", { name: "SERP snapshots" })).toBeInTheDocument();
      expect(screen.queryByTestId("position-history")).not.toBeInTheDocument();
    },
  );

  it("passes costContext.timezone to PositionHistoryCard", async () => {
    mocks.loadRankTrackerCostContext.mockResolvedValue({
      costPerCheckCents: null,
      timezone: "Europe/Madrid",
    });
    mocks.getKeywordDetail.mockResolvedValue({
      ...normalDetailState,
      positionHistory: [
        { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 4 },
        { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
      ],
      rankingUrlHistory: [{ url: "/old" }, { url: "/new" }],
      traffic: { hasAnalyticsConnection: false, pages: [], query: null },
    });

    render(
      await KeywordDetailPage({
        params: Promise.resolve({ id: "kw_ranked", project: "prj_1" }),
      }),
    );

    expect(positionHistoryProps).toHaveBeenCalledWith(
      expect.objectContaining({ timeZone: "Europe/Madrid" }),
    );
  });

  it("falls back to UTC when costContext lacks a timezone", async () => {
    mocks.loadRankTrackerCostContext.mockResolvedValue({ costPerCheckCents: null });
    mocks.getKeywordDetail.mockResolvedValue({
      ...normalDetailState,
      positionHistory: [
        { checkedAt: "2026-08-09T10:00:00.000Z", label: "Yesterday", position: 4 },
        { checkedAt: "2026-08-10T10:00:00.000Z", label: "Today", position: 3 },
      ],
      rankingUrlHistory: [{ url: "/old" }, { url: "/new" }],
      traffic: { hasAnalyticsConnection: false, pages: [], query: null },
    });

    render(
      await KeywordDetailPage({
        params: Promise.resolve({ id: "kw_ranked", project: "prj_1" }),
      }),
    );

    expect(positionHistoryProps).toHaveBeenCalledWith(expect.objectContaining({ timeZone: "UTC" }));
  });
});
