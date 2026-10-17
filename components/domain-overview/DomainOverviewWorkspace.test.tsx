import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { renderWithDomainOverviewMessages as render } from "@/i18n/test-support/render-with-feature-messages";
import { routerMock } from "@/tests/next-navigation";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import { domainOverviewReportFixture, domainOverviewScopeFixture } from "./fixtures";

const context = {
  catalogScopes: [],
  competitorDomains: ["competitor.example.com"],
  costContext: { capCents: 5000, spentCents: 100 },
  defaultTarget: "example.com",
  providerStatus: "connected" as const,
  recentTargets: [],
  trackedScopes: [],
};
const initialEstimate = {
  cached: false,
  costCents: 4,
  freshCostCents: 6,
  historyCostCents: 12,
  keywordPageCostCents: 2,
  loading: false,
  pagePageCostCents: 3,
  valid: true,
};

describe("DomainOverviewWorkspace", () => {
  it.each([
    { providerStatus: "no_provider", withScope: true },
    { providerStatus: "needs_reauth", withScope: true },
    { providerStatus: "no_provider", withScope: false },
    { providerStatus: "needs_reauth", withScope: false },
  ] as const)(
    "shows a provider action above and below the form for $providerStatus; scope available: $withScope",
    ({ providerStatus, withScope }) => {
      render(
        <SessionSpendProvider>
          <DomainOverviewWorkspace
            analyzeAction={vi.fn()}
            context={{ ...context, providerStatus, supportingProviders: ["Fixture provider"] }}
            initialEstimate={initialEstimate}
            initialOutcome={null}
            initialTarget="example.com"
            loadHistoryAction={vi.fn()}
            loadKeywordsPageAction={vi.fn()}
            loadPagesPageAction={vi.fn()}
            researchScope={withScope ? domainOverviewScopeFixture : undefined}
            projectId="prj_1"
            projectRef="prj_1"
          />
        </SessionSpendProvider>,
      );
      const reconnect = providerStatus === "needs_reauth";
      expect(screen.getAllByRole("link")).toHaveLength(2);
      const emptyPanel = screen.getByRole("region", {
        name: reconnect ? "Reconnect to load new results" : "Connect a provider to get started",
      });
      expect(within(emptyPanel).getAllByRole("link")).toHaveLength(1);
      expect(
        within(emptyPanel).getByRole("link", {
          name: reconnect ? "Reconnect provider" : "Connect provider",
        }),
      ).toHaveAttribute("href", "/app/prj_1/integrations");
      expect(
        screen.getAllByRole("link", {
          name: reconnect ? "Reconnect provider" : "Open Integrations",
        })[0],
      ).toHaveAttribute("href", "/app/prj_1/integrations");
      expect(screen.getAllByText("Supported providers: Fixture provider.")).toHaveLength(2);
      expect(screen.getByRole("textbox", { name: "Domain or subdomain" })).toBeDisabled();
      expect(screen.queryByText("Connect DataForSEO to analyze domains")).not.toBeInTheDocument();
    },
  );

  it.each(["no_provider", "needs_reauth"] as const)(
    "keeps saved domain results local under %s",
    (providerStatus) => {
      const history = vi.fn();
      const keywords = vi.fn();
      const pages = vi.fn();
      render(
        <SessionSpendProvider>
          <DomainOverviewWorkspace
            analyzeAction={vi.fn()}
            context={{ ...context, providerStatus, supportingProviders: ["Fixture provider"] }}
            initialEstimate={initialEstimate}
            initialOutcome={domainOverviewReportFixture}
            initialTarget="example.com"
            loadHistoryAction={history}
            loadKeywordsPageAction={keywords}
            loadPagesPageAction={pages}
            researchScope={domainOverviewScopeFixture}
            projectId="prj_1"
            projectRef="prj_1"
          />
        </SessionSpendProvider>,
      );
      expect(screen.getByText("Top organic keywords")).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /Load history|Load next/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("region", {
          name: /Connect a provider to get started|Reconnect to load new results/,
        }),
      ).not.toBeInTheDocument();
      expect(history).not.toHaveBeenCalled();
      expect(keywords).not.toHaveBeenCalled();
      expect(pages).not.toHaveBeenCalled();
    },
  );

  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("runs an explicit priced analysis and publishes a shareable URL", async () => {
    const analyzeAction = vi.fn().mockResolvedValue(domainOverviewReportFixture);
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={analyzeAction}
          context={context}
          initialEstimate={initialEstimate}
          initialOutcome={null}
          initialTarget="example.com"
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={vi.fn()}
          loadPagesPageAction={vi.fn()}
          researchScope={domainOverviewScopeFixture}
          projectId="prj_1"
          projectRef="prj_1"
        />
      </SessionSpendProvider>,
    );
    const analyzeButton = screen.getByRole("button", { name: /analyze domain/i });
    expect(analyzeButton).toHaveAttribute("data-size", expect.stringMatching(/^(xs|sm)$/));
    expect(analyzeButton).toHaveStyle({ height: "37px", minHeight: "37px" });
    fireEvent.click(analyzeButton);
    await waitFor(() => expect(analyzeAction).toHaveBeenCalledTimes(1));
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: false, maxCostCents: 4, target: "example.com" }),
    );
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(
        "/app/prj_1/domain-overview?domain=example.com&researchScope=US%3Aen&scope=root",
      ),
    );
    expect(routerMock.push).not.toHaveBeenCalled();
  });

  it("keeps the analysis form visible while the first report loads", async () => {
    const analyzeAction = vi.fn().mockReturnValue(new Promise(() => undefined));
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={analyzeAction}
          context={context}
          initialEstimate={initialEstimate}
          initialOutcome={null}
          initialTarget="example.com"
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={vi.fn()}
          loadPagesPageAction={vi.fn()}
          researchScope={domainOverviewScopeFixture}
          projectId="prj_1"
          projectRef="prj_1"
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /analyze domain/i }));

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "Domain or subdomain" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: /analyzing domain/i })).toBeDisabled();
    expect(screen.getByLabelText(/domain overview loading/i)).toBeInTheDocument();
  });

  it("caps a fresh refresh with the full estimate even when the report is cached", async () => {
    const analyzeAction = vi.fn().mockResolvedValue(domainOverviewReportFixture);
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={analyzeAction}
          context={context}
          initialEstimate={{ ...initialEstimate, cached: true, costCents: 0 }}
          initialOutcome={domainOverviewReportFixture}
          initialTarget="example.com"
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={vi.fn()}
          loadPagesPageAction={vi.fn()}
          researchScope={domainOverviewScopeFixture}
          projectId="prj_1"
          projectRef="prj_1"
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh now.*\$0\.06/i }));
    await waitFor(() => expect(analyzeAction).toHaveBeenCalledTimes(1));
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({ fresh: true, maxCostCents: 6 }),
    );
  });

  it("keeps the cached report visible when a fresh refresh fails", async () => {
    const analyzeAction = vi.fn().mockResolvedValue({
      costCents: 0,
      ok: false,
      reason: "rate_limited",
      resetAt: Date.now() + 60_000,
    });
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={analyzeAction}
          context={context}
          initialEstimate={{ ...initialEstimate, cached: true, costCents: 0 }}
          initialOutcome={domainOverviewReportFixture}
          initialTarget="example.com"
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={vi.fn()}
          loadPagesPageAction={vi.fn()}
          researchScope={domainOverviewScopeFixture}
          projectId="prj_1"
          projectRef="prj_1"
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh now.*\$0\.06/i }));
    await waitFor(() => expect(analyzeAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /refresh now/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /analyze domain/i })).not.toBeInTheDocument();
  });

  it("loads the next explicitly priced keyword page and appends it to the fetched rows", async () => {
    const firstPage = domainOverviewReportFixture.keywords;
    if (!firstPage.ok) throw new Error("Keyword fixture must be available");
    const loadKeywordsPageAction = vi.fn().mockResolvedValue({
      cached: false,
      costCents: 2,
      data: {
        costCents: 2,
        rows: [{ ...firstPage.data.rows[0], keyword: "loaded keyword" }],
        totalCount: 938,
      },
      fetchedAt: "2026-08-12T13:00:00.000Z",
      ok: true,
    });
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={vi.fn()}
          context={context}
          initialEstimate={{ ...initialEstimate, cached: true, costCents: 0 }}
          initialOutcome={domainOverviewReportFixture}
          initialTarget="example.com"
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={loadKeywordsPageAction}
          loadPagesPageAction={vi.fn()}
          researchScope={domainOverviewScopeFixture}
          projectId="prj_1"
          projectRef="prj_1"
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /load next 100 keywords/i }));
    await waitFor(() => expect(loadKeywordsPageAction).toHaveBeenCalledOnce());
    expect(loadKeywordsPageAction).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100, maxCostCents: 2, offset: 100 }),
    );
    expect(await screen.findByText("loaded keyword")).toBeInTheDocument();
    expect(screen.getAllByTestId("domain-keyword-row")).toHaveLength(101);
  });

  it("keeps the current report visible while pricing a new draft", async () => {
    vi.useFakeTimers();
    const analyzeAction = vi.fn().mockResolvedValue(domainOverviewReportFixture);
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={analyzeAction}
          context={context}
          initialEstimate={{ ...initialEstimate, cached: true, costCents: 0 }}
          initialOutcome={domainOverviewReportFixture}
          initialTarget="example.com"
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={vi.fn()}
          loadPagesPageAction={vi.fn()}
          researchScope={domainOverviewScopeFixture}
          projectId="prj_1"
          projectRef="prj_1"
        />
      </SessionSpendProvider>,
    );

    const targetInput = screen.getByRole("textbox", { name: "Domain or subdomain" });
    fireEvent.change(targetInput, {
      target: { value: "other.example.com" },
    });
    expect(screen.getByRole("button", { name: /analyze domain/i })).toBeInTheDocument();
    expect(screen.getByText("Top organic keywords")).toBeInTheDocument();
    expect(screen.getByText(/results below are still for/i)).toHaveTextContent("example.com");
    expect(routerMock.push).not.toHaveBeenCalled();
    const form = targetInput.closest("form");
    if (!form) throw new Error("Expected the analysis form");
    fireEvent.submit(form);
    expect(analyzeAction).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Recent domain analyses")).not.toBeInTheDocument();
    // Finish the scheduled estimate before jsdom teardown; it must remain estimate-only.
    await act(() => vi.advanceTimersByTimeAsync(320));
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: true, target: "other.example.com" }),
    );
  });
});
