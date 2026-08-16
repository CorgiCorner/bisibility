import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type { DomainOverviewMarketOption } from "@/lib/domain-overview/market-options";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import { domainOverviewMarketFixture, domainOverviewReportFixture } from "./fixtures";

vi.mock("@/components/markets/MarketCombobox", () => ({
  MarketCombobox: ({
    onChange,
  }: {
    onChange: (value: DomainOverviewMarketOption) => void;
    value: string;
  }) => (
    <>
      <button
        aria-label="Market"
        onClick={() =>
          onChange({
            ...domainOverviewMarketFixture,
            cityName: null,
            kind: "country",
            provenance: null,
            regionName: null,
            researchAvailable: true,
          })
        }
        type="button"
      >
        Market
      </button>
      <button
        aria-label="Other market"
        onClick={() =>
          onChange({
            canonicalKey: "GB",
            cityName: null,
            countryCode: "GB",
            displayName: "United Kingdom",
            kind: "country",
            languageCode: "en",
            languageLabel: "English",
            locationCode: 2826,
            provenance: null,
            regionName: null,
            researchAvailable: true,
          })
        }
        type="button"
      >
        United Kingdom
      </button>
    </>
  ),
}));

const context = {
  catalogMarkets: [],
  competitorDomains: ["competitor.example.com"],
  costContext: { capCents: 5000, spentCents: 100 },
  defaultTarget: "example.com",
  providerStatus: "connected" as const,
  recentTargets: [],
  trackedMarkets: [],
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
          market={domainOverviewMarketFixture}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
        />
      </SessionSpendProvider>,
    );
    const analyzeButton = screen.getByRole("button", { name: /analyze domain/i });
    expect(analyzeButton).toHaveClass("MuiButton-sizeSmall");
    expect(analyzeButton).toHaveStyle({ height: "37px", minHeight: "37px" });
    fireEvent.click(analyzeButton);
    await waitFor(() => expect(analyzeAction).toHaveBeenCalledTimes(1));
    expect(analyzeAction).toHaveBeenCalledWith(
      expect.objectContaining({ estimateOnly: false, maxCostCents: 4, target: "example.com" }),
    );
    await waitFor(() =>
      expect(window.location.pathname + window.location.search).toBe(
        "/app/prj_1/domain-overview?domain=example.com&market=US%2FUS-TX%2FAustin&scope=root",
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
          market={domainOverviewMarketFixture}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
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
          market={domainOverviewMarketFixture}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
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
          market={domainOverviewMarketFixture}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
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
          market={domainOverviewMarketFixture}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
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

  it("keeps the current report visible while pricing a new draft", () => {
    const analyzeAction = vi.fn();
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
          market={domainOverviewMarketFixture}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
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
  });
});
