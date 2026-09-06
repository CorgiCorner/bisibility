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
  loadTrackDialog: vi.fn(),
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
  signals: vi.fn(),
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
  SearchInsightsNoDataSection: (props: unknown) => {
    mocks.noData(props);
    return <div data-testid="no-data" />;
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
  loadSearchInsightsTrackDialog: mocks.loadTrackDialog,
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
  getSearchInsightsFirstViewSignals: mocks.signals,
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
  counts: { queries: 1284 },
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

/**
 * Run `body` with an unhandled-rejection listener attached and return whatever Node reported.
 * Node raises the event only after the microtask queue drains, so two macrotask turns pass
 * before the listener is removed; without them the assertion would pass against unfixed code.
 */
async function collectUnhandledRejections(body: () => Promise<void>) {
  const seen: unknown[] = [];
  const listener = (reason: unknown) => seen.push(reason);
  process.on("unhandledRejection", listener);
  try {
    await body();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
  } finally {
    process.off("unhandledRejection", listener);
  }
  return seen;
}

async function paintBefore(pendingRead: ReturnType<typeof vi.fn>) {
  pendingRead.mockReturnValue(new Promise(() => undefined));
  return Promise.race([
    renderPage().then(() => "painted" as const),
    new Promise<"blocked">((resolve) => setTimeout(() => resolve("blocked"), 100)),
  ]);
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
    mocks.signals.mockReturnValue(Promise.resolve({ bandCount: 34, overlapCount: 12 }));
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

  it("hands the drawer stack its actions and the Rank Tracker write it may offer", async () => {
    await renderPage();

    expect(mocks.workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        drawers: expect.objectContaining({
          addKeywordsAction: mocks.addKeywords,
          loadBandListAction: mocks.bandList,
          loadOverlapListAction: mocks.overlapList,
          loadPageDetailAction: mocks.pageDetail,
          loadQueryDetailAction: mocks.queryDetail,
          loadTrackDialogAction: mocks.loadTrackDialog,
          period: "28",
          property: "sc-domain:example.com",
          projectId: "prj_1",
        }),
      }),
    );
  });

  it("does not read the Track dialog payload during the initial render", async () => {
    await renderPage();

    expect(mocks.markets).not.toHaveBeenCalled();
    expect(mocks.defaultMarket).not.toHaveBeenCalled();
    expect(mocks.costContext).not.toHaveBeenCalled();
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

  it("does not await worker liveness before first paint", async () => {
    await expect(paintBefore(mocks.liveness)).resolves.toBe("painted");
  });

  it("does not await signals before first paint", async () => {
    await expect(paintBefore(mocks.signals)).resolves.toBe("painted");
  });

  it("returns the page when the signals read rejects", async () => {
    mocks.signals.mockReturnValue(Promise.reject(new Error("signals unavailable")));

    await expect(renderPage()).resolves.toBeDefined();
    expect(screen.getByTestId("body-section")).toBeInTheDocument();
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

  it("starts one view and one signals read from one scope and shares each promise", async () => {
    await renderPage({ period: ["90", "7"] });

    // One scope for the whole render: the authorization, the stored credential and the import
    // row are read once, not once per section.
    expect(mocks.scope).toHaveBeenCalledTimes(1);
    expect(mocks.context).toHaveBeenCalledWith("prj_1", { period: "90", scope });
    expect(mocks.firstView).toHaveBeenCalledWith("prj_1", { period: "90", scope });
    expect(mocks.firstView).toHaveBeenCalledTimes(1);
    expect(mocks.signals).toHaveBeenCalledTimes(1);
    expect(mocks.signals).toHaveBeenCalledWith(scope);
    // One view promise for both consumers and one signals promise for its only consumer.
    const view = mocks.firstView.mock.results[0]?.value;
    const signals = mocks.signals.mock.results[0]?.value;
    expect(mocks.trustSection).toHaveBeenCalledWith(expect.objectContaining({ view }));
    expect(mocks.bodySection).toHaveBeenCalledWith(
      expect.objectContaining({ loadRowsAction: mocks.loadRows, period: "28", signals, view }),
    );
  });

  // The same mark is applied to the view promise at page.tsx, by symmetry with this one, but no
  // test here covers it: every scenario tried reported no unhandled rejection against UNFIXED
  // code, so any assertion would have been a guard that cannot fail. It is left uncovered and
  // stated rather than guarded by something that only ever passes.
  it("marks the status promise handled when neither of its consumers renders", async () => {
    // Without a property the trust strip and the no-data state are both absent, but the status
    // read is still started.
    const unhandled = await collectUnhandledRejections(async () => {
      mocks.scope.mockResolvedValue({ ...scope, property: null });
      mocks.context.mockResolvedValue({
        ...connected,
        connection: { property: null, status: "not_connected" },
        window: null,
      });
      mocks.liveness.mockRejectedValueOnce(new Error("liveness read failed"));
      await renderPage();
    });

    expect(unhandled).toEqual([]);
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
    const status = await mocks.trustSection.mock.calls[0]?.[0].status;
    expect(mocks.compareIdentity).toHaveBeenCalledWith(appIdentity, heartbeat);
    expect(mocks.trustSection).toHaveBeenCalledWith(
      expect.objectContaining({
        status: expect.any(Promise),
      }),
    );
    expect(status.workerStatus).toEqual({ status: "stale", temporalIdentityComparison });
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
    const noDataProps = mocks.noData.mock.calls[0]?.[0];
    const status = await noDataProps.status;
    expect(mocks.noData).toHaveBeenCalledWith(
      expect.objectContaining({
        pauseAction: mocks.pauseImport,
        projectId: "prj_1",
        resumeAction: mocks.resumeImport,
        retryAction: mocks.retryImport,
        status: expect.any(Promise),
      }),
    );
    expect(status).toEqual(
      expect.objectContaining({
        facts: expect.objectContaining({
          connectionStatus: "connected",
          observability: undefined,
          runtime: expect.objectContaining({
            workerStatus: expect.objectContaining({ status: "ok" }),
          }),
          state: undefined,
        }),
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
