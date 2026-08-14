import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DomainOverviewPage from "./page";

const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  context: vi.fn(),
  market: vi.fn(),
  resolve: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/components/domain-overview/DomainOverviewWorkspace", () => ({
  DomainOverviewWorkspace: (props: unknown) => {
    mocks.workspace(props);
    return <div data-testid="domain-overview-workspace" />;
  },
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/lib/actions/domain-overview", () => ({
  analyzeDomainOverviewAction: mocks.analyze,
  loadDomainHistoryAction: vi.fn(),
  loadDomainKeywordsPageAction: vi.fn(),
  loadDomainPagesPageAction: vi.fn(),
  selectDomainOverviewMarketAction: vi.fn(),
  saveSelectedKeywordsAction: vi.fn(),
}));
vi.mock("@/lib/queries/_auth", () => ({ resolveProjectAccess: mocks.resolve }));
vi.mock("@/lib/queries/domain-overview", () => ({
  getDomainOverviewMarket: mocks.market,
  getDomainOverviewPageContext: mocks.context,
}));

const defaultMarket = {
  canonicalKey: "US/US-TX/Austin",
  cityName: "Austin",
  countryCode: "US",
  displayName: "Austin",
  kind: "city" as const,
  languageCode: "en",
  languageLabel: "English",
  locationCode: 1_026_201,
  regionName: "Texas",
};

describe("DomainOverviewPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ publicId: "prj_1" });
    mocks.context.mockResolvedValue({
      catalogMarkets: [],
      competitorDomains: [],
      costContext: { capCents: 5000, spentCents: 0 },
      defaultMarket,
      defaultTarget: "example.com",
      providerStatus: "connected",
      recentTargets: [],
      trackedMarkets: [],
    });
    mocks.market.mockResolvedValue(defaultMarket);
  });

  it("renders idle without probing a paid provider path", async () => {
    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({}),
      }),
    );
    expect(screen.getByTestId("domain-overview-workspace")).toBeInTheDocument();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialOutcome: null, initialTarget: "", market: defaultMarket }),
    );
  });

  it("loads a shareable cached report without allowing a fresh charge", async () => {
    mocks.analyze
      .mockResolvedValueOnce({
        cached: true,
        estimate: true,
        estimatedCostCents: 4,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: 1_026_201,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      })
      .mockResolvedValueOnce({ costCents: 0, ok: false, reason: "snapshot_expired" });
    mocks.analyze.mockResolvedValueOnce({
      cached: false,
      estimate: true,
      estimatedCostCents: 6,
      freshEstimatedCostCents: 6,
      historyEstimatedCostCents: 12,
      historyMode: "lazy",
      keywordPageEstimatedCostCents: 2,
      languageCode: "en",
      locationCode: 1_026_201,
      ok: true,
      pagePageEstimatedCostCents: 3,
      provider: "dataforseo",
      scope: "root",
      target: "example.com",
    });
    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({
          domain: "example.com",
          market: "US/US-TX/Austin",
          scope: "root",
        }),
      }),
    );
    expect(mocks.market).toHaveBeenCalledWith("prj_1", "US/US-TX/Austin");
    expect(mocks.analyze).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ estimateOnly: false, maxCostCents: 0 }),
    );
    expect(mocks.analyze).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ estimateOnly: true, target: "example.com" }),
    );
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialScope: "root", initialTarget: "example.com" }),
    );
  });

  it("reopens a cached no-data recent instead of returning to the analysis form", async () => {
    const cachedNoData = {
      cached: true,
      cachedUntil: "2026-08-12T20:00:00.000Z",
      costCents: 0,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      historyMode: "lazy",
      keywords: { cached: true, costCents: 0, data: { rows: [], totalCount: 0 }, ok: true },
      languageCode: "en",
      locationCode: 1_026_201,
      ok: true,
      overview: null,
      pages: { cached: true, costCents: 0, data: { rows: [], totalCount: 0 }, ok: true },
      previousFetchedAt: null,
      previousOverview: null,
      previousSourceSnapshotAt: null,
      provider: "dataforseo",
      scope: "root",
      sourceSnapshotAt: "2026-08-05T00:00:00.000Z",
      state: "no_data",
      target: "no-data.example.com",
    };
    mocks.analyze
      .mockResolvedValueOnce({
        cached: true,
        estimate: true,
        estimatedCostCents: 0,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: 1_026_201,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "no-data.example.com",
      })
      .mockResolvedValueOnce(cachedNoData);

    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({
          domain: "no-data.example.com",
          market: "US/US-TX/Austin",
          scope: "root",
        }),
      }),
    );

    expect(mocks.analyze).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        estimateOnly: false,
        maxCostCents: 0,
        target: "no-data.example.com",
      }),
    );
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialEstimate: expect.objectContaining({ costCents: 0 }) }),
    );
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        initialOutcome: cachedNoData,
        initialTarget: "no-data.example.com",
      }),
    );
  });

  it("keeps a durable partial report across a report URL remount", async () => {
    const cachedPartial = {
      cached: true,
      cachedUntil: "2026-08-12T20:00:00.000Z",
      costCents: 0,
      fetchedAt: "2026-08-12T08:00:00.000Z",
      historyMode: "lazy",
      keywords: { costCents: 0, ok: false, reason: "lookup_failed" },
      languageCode: "en",
      locationCode: 1_026_201,
      ok: true,
      overview: { count: 120 },
      pages: { cached: true, costCents: 0, data: { rows: [], totalCount: 0 }, ok: true },
      previousFetchedAt: null,
      previousOverview: null,
      previousSourceSnapshotAt: null,
      provider: "dataforseo",
      scope: "root",
      sourceSnapshotAt: "2026-08-05T00:00:00.000Z",
      state: "partial",
      target: "example.com",
    };
    mocks.analyze
      .mockResolvedValueOnce({
        cached: true,
        estimate: true,
        estimatedCostCents: 0,
        freshEstimatedCostCents: 6,
        historyEstimatedCostCents: 12,
        historyMode: "lazy",
        keywordPageEstimatedCostCents: 2,
        languageCode: "en",
        locationCode: 1_026_201,
        ok: true,
        pagePageEstimatedCostCents: 3,
        provider: "dataforseo",
        scope: "root",
        target: "example.com",
      })
      .mockResolvedValueOnce(cachedPartial);

    render(
      await DomainOverviewPage({
        params: Promise.resolve({ project: "prj_1" }),
        searchParams: Promise.resolve({
          domain: "example.com",
          market: "US/US-TX/Austin",
          scope: "root",
        }),
      }),
    );

    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ initialOutcome: cachedPartial, initialTarget: "example.com" }),
    );
  });
});
