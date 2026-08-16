import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type { DomainOverviewMarketOption } from "@/lib/domain-overview/market-options";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import { domainOverviewMarketFixture, domainOverviewReportFixture } from "./fixtures";

vi.mock("@/components/markets/MarketCombobox", () => ({
  MarketCombobox: ({ onChange }: { onChange: (value: DomainOverviewMarketOption) => void }) => (
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

describe("DomainOverviewWorkspace market state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("ignores selecting the already active market without entering a loading state", () => {
    const selectMarketAction = vi.fn();
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={vi.fn()}
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
          selectMarketAction={selectMarketAction}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Market" }));
    expect(selectMarketAction).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /analyze domain/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/loading domain overview/i)).not.toBeInTheDocument();
  });

  it("keeps the cached report visible when changing market fails in transport", async () => {
    const selectMarketAction = vi.fn().mockRejectedValue(new Error("network failed"));
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={vi.fn()}
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
          selectMarketAction={selectMarketAction}
        />
      </SessionSpendProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Other market" }));
    await waitFor(() => expect(selectMarketAction).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: /refresh now/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /analyze domain/i })).not.toBeInTheDocument();
  });

  it("opens a recent cached report through navigation without a cap-zero analysis", () => {
    const analyzeAction = vi.fn();
    const recent = {
      cachedUntil: "2026-08-12T20:00:00.000Z",
      fetchedAt: "2026-08-12T08:00:00.000Z",
      languageCode: "en",
      locationCode: 1_026_201,
      scope: "root" as const,
      target: "recent.example.com",
    };
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={analyzeAction}
          context={{ ...context, recentTargets: [recent] }}
          initialEstimate={initialEstimate}
          initialOutcome={null}
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

    fireEvent.click(screen.getByRole("button", { name: /recent\.example\.com/i }));
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/domain-overview?domain=recent.example.com&market=US%2FUS-TX%2FAustin&scope=root",
    );
    expect(analyzeAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/domain overview loading/i)).toBeInTheDocument();
  });

  it("does not promise an uncharged failure when transport is indeterminate", async () => {
    const analyzeAction = vi.fn().mockRejectedValue(new Error("network failed"));
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
    expect(await screen.findByText(/lookup did not go through/i)).toBeInTheDocument();
    expect(screen.queryByText(/not charged/i)).not.toBeInTheDocument();
  });

  it("surfaces a market without a numeric provider handle", () => {
    render(
      <SessionSpendProvider>
        <DomainOverviewWorkspace
          analyzeAction={vi.fn()}
          context={context}
          initialEstimate={initialEstimate}
          initialOutcome={null}
          loadHistoryAction={vi.fn()}
          loadKeywordsPageAction={vi.fn()}
          loadPagesPageAction={vi.fn()}
          market={{ ...domainOverviewMarketFixture, locationCode: null }}
          projectId="prj_1"
          projectRef="prj_1"
          selectMarketAction={vi.fn()}
        />
      </SessionSpendProvider>,
    );
    expect(screen.getByText(/market is not supported for domain overview/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze domain/i })).toBeDisabled();
  });
});
