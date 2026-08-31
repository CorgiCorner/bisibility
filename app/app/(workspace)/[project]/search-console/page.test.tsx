import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SearchInsightsPage from "./page";

const mocks = vi.hoisted(() => ({
  addKeywords: vi.fn(),
  bandList: vi.fn(),
  bodySection: vi.fn(),
  cancelSelection: vi.fn(),
  completeSelection: vi.fn(),
  context: vi.fn(),
  costContext: vi.fn(),
  compareIdentity: vi.fn(),
  defaultMarket: vi.fn(),
  deploymentConfig: vi.fn(),
  disconnectConnection: vi.fn(),
  exportAction: vi.fn(),
  firstView: vi.fn(),
  loadProperties: vi.fn(),
  loadRows: vi.fn(),
  liveness: vi.fn(),
  markets: vi.fn(),
  noData: vi.fn(),
  noProperty: vi.fn(),
  oauth: vi.fn(),
  overlapList: vi.fn(),
  pageDetail: vi.fn(),
  queryDetail: vi.fn(),
  readable: vi.fn(),
  resolve: vi.fn(),
  scope: vi.fn(),
  syncPlan: vi.fn(),
  selectProperty: vi.fn(),
  sync: vi.fn(),
  pauseImport: vi.fn(),
  resumeImport: vi.fn(),
  retryImport: vi.fn(),
  trustSection: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("@/components/search-insights/SearchInsightsEmptyStates", () => ({
  SearchInsightsNoDataState: (props: unknown) => {
    mocks.noData(props);
    return <div data-testid="no-data" />;
  },
  SearchInsightsNoPropertyState: (props: unknown) => {
    mocks.noProperty(props);
    return <div data-testid="no-property" />;
  },
}));
vi.mock("@/components/search-insights/SearchInsightsLoadingSkeletons", () => ({
  SearchInsightsBodyLoading: () => <div data-testid="body-skeleton" />,
  SearchInsightsTrustStripLoading: () => <div data-testid="strip-skeleton" />,
}));
vi.mock("@/components/search-insights/SearchInsightsWorkspace", () => ({
  SearchInsightsWorkspace: (props: {
    children?: React.ReactNode;
    trustStrip?: React.ReactNode;
  }) => {
    mocks.workspace(props);
    return (
      <div data-testid="search-insights-workspace">
        {props.trustStrip}
        {props.children}
      </div>
    );
  },
}));
vi.mock("@/components/shell/PageContent", () => ({
  PageContent: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("./SearchInsightsSections", () => ({
  SearchInsightsBodySection: (props: unknown) => {
    mocks.bodySection(props);
    return <div data-testid="body-section" />;
  },
  SearchInsightsTrustStripSection: (props: unknown) => {
    mocks.trustSection(props);
    return <div data-testid="trust-section" />;
  },
}));
vi.mock("@/lib/actions/providers", () => ({
  cancelGooglePropertySelection: mocks.cancelSelection,
  completeGooglePropertySelection: mocks.completeSelection,
  disconnectGoogleSearchConsole: mocks.disconnectConnection,
}));
vi.mock("@/lib/actions/search-insights", () => ({
  exportSearchInsightsCsv: mocks.exportAction,
  loadSearchInsightsProperties: mocks.loadProperties,
  selectSearchInsightsProperty: mocks.selectProperty,
  pauseSearchInsightsImport: mocks.pauseImport,
  resumeSearchInsightsImport: mocks.resumeImport,
  retrySearchInsightsImport: mocks.retryImport,
  syncSearchInsightsNow: mocks.sync,
}));
vi.mock("@/lib/actions/search-insights-drawers", () => ({
  loadSearchInsightsBandList: mocks.bandList,
  loadSearchInsightsOverlapList: mocks.overlapList,
  loadSearchInsightsPageDetail: mocks.pageDetail,
  loadSearchInsightsQueryDetail: mocks.queryDetail,
}));
vi.mock("@/lib/actions/search-insights-rows", () => ({ loadSearchInsightsRows: mocks.loadRows }));
vi.mock("@/lib/actions/keyword", () => ({ addKeywordsMatrix: mocks.addKeywords }));
vi.mock("@/lib/queries/_auth", () => ({
  requireReadableProject: mocks.readable,
  resolveProjectAccess: mocks.resolve,
}));
vi.mock("@/lib/settings/search-sync-metrics", () => ({
  loadSearchSyncPreflightPlan: mocks.syncPlan,
}));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/ops/worker-temporal-identity", () => ({
  compareWorkerTemporalIdentity: mocks.compareIdentity,
}));
vi.mock("@/lib/temporal/deployment-config", () => ({
  temporalDeploymentConfig: mocks.deploymentConfig,
}));
vi.mock("@/lib/queries/cost-calculator", () => ({ getProjectCostContext: mocks.costContext }));
vi.mock("@/lib/queries/keywords", () => ({ getKeywordDefaultMarket: mocks.defaultMarket }));
vi.mock("@/lib/queries/project-markets", () => ({ getProjectMarkets: mocks.markets }));
vi.mock("@/lib/search-insights/queries/context", () => ({
  getSearchInsightsContext: mocks.context,
  loadSearchInsightsScope: mocks.scope,
}));
vi.mock("@/lib/search-insights/queries/first-view", () => ({
  getSearchInsightsFirstView: mocks.firstView,
}));
vi.mock("@/lib/search-insights/queries/oauth-return", () => ({
  resolveSearchInsightsOauthReturn: mocks.oauth,
}));

const scope = { period: { id: "28" }, projectId: "internal_1", property: "sc-domain:example.com" };

const connected = {
  connection: {
    property: {
      displayName: "example.com",
      kind: "domain",
      kindLabel: "domain",
      value: "sc-domain:example.com",
    },
    status: "connected",
  },
  counts: { pages: 212, queries: 1284 },
  importState: { newestFinalizedDate: "2026-07-08" },
  period: { days: 28, id: "28", label: "28 finalized days", sub: "vs previous 28" },
  window: {
    current: { end: "2026-07-08", start: "2026-06-11" },
    previous: { end: "2026-06-10", start: "2026-05-14" },
  },
  yoy: { monthsImported: 9, required: 13 },
};

async function renderPage(query: Record<string, unknown> = {}) {
  return render(
    await SearchInsightsPage({
      params: Promise.resolve({ project: "prj_1" }),
      searchParams: Promise.resolve(query),
    }),
  );
}

describe("SearchInsightsPage", () => {
  beforeEach(() => {
    mocks.syncPlan.mockResolvedValue({ daysTotal: 488, pace: "normal", retentionMonths: 16 });
    vi.clearAllMocks();
    mocks.resolve.mockResolvedValue({ publicId: "prj_1" });
    mocks.scope.mockResolvedValue(scope);
    mocks.context.mockResolvedValue(connected);
    mocks.oauth.mockResolvedValue({ error: null, provider: null, setup: null });
    mocks.firstView.mockReturnValue(Promise.resolve({}));
    mocks.readable.mockResolvedValue({ actor: { memberships: [] }, project: { id: "internal_1" } });
    mocks.liveness.mockResolvedValue({
      alertDeliveryTaskQueue: "alert-deliveries",
      namespace: "default",
      status: "ok",
      taskQueue: "rank-checks",
    });
    mocks.deploymentConfig.mockReturnValue({
      alertDeliveryTaskQueue: "alert-deliveries",
      namespace: "default",
      taskQueue: "rank-checks",
    });
    mocks.compareIdentity.mockReturnValue({
      detail:
        "app: default / rank-checks / alert-deliveries · worker: default / rank-checks / alert-deliveries",
      status: "match",
    });
    mocks.markets.mockResolvedValue({ markets: [], maxMarkets: 5 });
    mocks.defaultMarket.mockResolvedValue({ device: "desktop", locationKey: "us-en" });
    mocks.costContext.mockResolvedValue({ costPerCheckCents: null, depth: 100 });
  });

  it("hands the drawer stack its reads and the Rank Tracker write it may offer", async () => {
    await renderPage();

    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        drawers: expect.objectContaining({
          addKeywordsAction: mocks.addKeywords,
          defaultDevice: "desktop",
          defaultMarketKey: "us-en",
          loadBandListAction: mocks.bandList,
          loadOverlapListAction: mocks.overlapList,
          loadPageDetailAction: mocks.pageDetail,
          loadQueryDetailAction: mocks.queryDetail,
          period: "28",
          property: "sc-domain:example.com",
          projectId: "prj_1",
        }),
      }),
    );
  });

  it("guards the project and hands the context and actions to the workspace", async () => {
    await renderPage();

    expect(mocks.resolve).toHaveBeenCalledWith("prj_1");
    expect(mocks.scope).toHaveBeenCalledWith("prj_1", { period: undefined, property: undefined });
    expect(mocks.context).toHaveBeenCalledWith("prj_1", {
      period: undefined,
      property: undefined,
      scope,
    });
    expect(screen.getByTestId("search-insights-workspace")).toBeInTheDocument();
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        completePropertySelectionAction: mocks.completeSelection,
        context: connected,
        exportAction: mocks.exportAction,
        loadPropertiesAction: mocks.loadProperties,
        oauth: { error: null, provider: null, setup: null },
        projectId: "prj_1",
        selectPropertyAction: mocks.selectProperty,
        syncAction: mocks.sync,
      }),
    );
  });

  it("passes the read-only archived property contract into the server scope", async () => {
    const archivedScope = { ...scope, property: "sc-domain:archived.example.com" };
    mocks.scope.mockResolvedValue(archivedScope);
    await renderPage({ property: "sc-domain:archived.example.com" });

    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: undefined,
      property: "sc-domain:archived.example.com",
    });
    expect(mocks.context).toHaveBeenCalledWith("prj_1", {
      period: undefined,
      property: "sc-domain:archived.example.com",
      scope: archivedScope,
    });
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        drawers: expect.objectContaining({ property: "sc-domain:archived.example.com" }),
      }),
    );
    expect(mocks.bodySection).toHaveBeenCalledWith(
      expect.objectContaining({ property: "sc-domain:archived.example.com" }),
    );
  });

  it("streams the strip and the body from one read the page never waits on", async () => {
    await renderPage({ period: ["90", "7"] });

    // One scope for the whole render: the authorization, the stored credential and the import
    // row are read once, not once per section.
    expect(mocks.scope).toHaveBeenCalledTimes(1);
    expect(mocks.context).toHaveBeenCalledWith("prj_1", { period: "90", scope });
    expect(mocks.firstView).toHaveBeenCalledWith("prj_1", { period: "90", scope });
    // One promise, two sections: the stored rows are read once for both.
    const view = mocks.firstView.mock.results[0]?.value;
    expect(mocks.trustSection).toHaveBeenCalledWith(expect.objectContaining({ view }));
    expect(mocks.bodySection).toHaveBeenCalledWith(
      expect.objectContaining({ loadRowsAction: mocks.loadRows, period: "28", view }),
    );
  });

  it("passes worker liveness and Temporal identity agreement to the trust strip", async () => {
    const heartbeat = {
      alertDeliveryTaskQueue: "worker-alert-deliveries",
      namespace: "worker-namespace",
      status: "stale" as const,
      taskQueue: "worker-rank-checks",
    };
    const appIdentity = {
      alertDeliveryTaskQueue: "app-alert-deliveries",
      namespace: "app-namespace",
      taskQueue: "app-rank-checks",
    };
    const temporalIdentityComparison = {
      detail:
        "app: app-namespace / app-rank-checks / app-alert-deliveries · worker: worker-namespace / worker-rank-checks / worker-alert-deliveries",
      status: "mismatch" as const,
    };
    mocks.liveness.mockResolvedValue(heartbeat);
    mocks.deploymentConfig.mockReturnValue(appIdentity);
    mocks.compareIdentity.mockReturnValue(temporalIdentityComparison);

    await renderPage();

    expect(mocks.liveness).toHaveBeenCalledTimes(1);
    expect(mocks.compareIdentity).toHaveBeenCalledWith(appIdentity, heartbeat);
    expect(mocks.trustSection).toHaveBeenCalledWith(
      expect.objectContaining({
        workerStatus: { status: "stale", temporalIdentityComparison },
      }),
    );
  });

  it("threads a GA4 setup into the body while preserving the healthy GSC view", async () => {
    const ga4Setup = {
      error: "Couldn't load your GA4 properties. Google Analytics is temporarily unavailable.",
      failureClass: "provider_5xx",
      properties: [],
      provider: "ga4",
    };
    mocks.oauth.mockResolvedValue({ error: null, provider: "ga4", setup: ga4Setup });

    await renderPage({
      connect: "ga4",
      google: "select",
      period: "28",
      property: "sc-domain:bisibility.com",
      provider: "ga4",
    });

    expect(mocks.bodySection).toHaveBeenCalledWith(
      expect.objectContaining({ ga4Oauth: { error: null, provider: "ga4", setup: ga4Setup } }),
    );
    expect(mocks.scope).toHaveBeenCalledWith("prj_1", {
      period: "28",
      property: "sc-domain:bisibility.com",
    });
    expect(screen.getByTestId("body-section")).toBeInTheDocument();
    expect(mocks.trustSection).toHaveBeenCalled();
  });

  it("offers the connection instead of a body when no property is selected", async () => {
    mocks.scope.mockResolvedValue({ ...scope, property: null });
    mocks.context.mockResolvedValue({
      ...connected,
      connection: { property: null, status: "not_connected" },
      window: null,
    });

    await renderPage();

    expect(mocks.firstView).not.toHaveBeenCalled();
    // The drawer host is not mounted without a property, so nothing it would need is read.
    expect(mocks.markets).not.toHaveBeenCalled();
    expect(mocks.costContext).not.toHaveBeenCalled();
    expect(mocks.workspace).toHaveBeenCalledWith(expect.objectContaining({ drawers: undefined }));
    expect(mocks.noProperty).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "prj_1", reauth: false }),
    );
    expect(screen.queryByTestId("body-section")).not.toBeInTheDocument();
  });

  it("asks for a reconnect when the stored authorization stopped working", async () => {
    mocks.scope.mockResolvedValue({ ...scope, property: null });
    mocks.context.mockResolvedValue({
      ...connected,
      connection: { property: null, status: "needs_reauth" },
      window: null,
    });

    await renderPage();

    expect(mocks.noProperty).toHaveBeenCalledWith(expect.objectContaining({ reauth: true }));
  });

  it("keeps the strip while a connected property still has no finalized day", async () => {
    mocks.context.mockResolvedValue({ ...connected, window: null });

    await renderPage();

    expect(mocks.trustSection).toHaveBeenCalled();
    expect(mocks.bodySection).not.toHaveBeenCalled();
    expect(mocks.noData).toHaveBeenCalledWith(
      expect.objectContaining({
        facts: expect.objectContaining({
          completedDays: 0,
          connectionStatus: "connected",
          firstViewReady: false,
          state: undefined,
          workerStatus: expect.objectContaining({ status: "ok" }),
        }),
        pauseAction: mocks.pauseImport,
        projectId: "prj_1",
        resumeAction: mocks.resumeImport,
        retryAction: mocks.retryImport,
      }),
    );
  });

  it("resolves the Google return so the property choice finishes on this page", async () => {
    mocks.oauth.mockResolvedValue({ error: "Consent was refused.", setup: null });

    await renderPage({ google: "error", provider: "gsc", reason: "access_denied" });

    expect(mocks.oauth).toHaveBeenCalledWith("prj_1", {
      google: "error",
      provider: "gsc",
      reason: "access_denied",
    });
    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({ oauth: { error: "Consent was refused.", setup: null } }),
    );
  });
});
