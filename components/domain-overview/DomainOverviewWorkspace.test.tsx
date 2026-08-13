import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import { domainOverviewMarketFixture, domainOverviewReportFixture } from "./fixtures";

vi.mock("@/components/keywords/LocationField", () => ({
  LocationField: ({
    onChange,
    value,
  }: {
    onChange: (value: typeof domainOverviewMarketFixture) => void;
    value: typeof domainOverviewMarketFixture;
  }) => (
    <>
      <button aria-label="Market" onClick={() => onChange(value)} type="button">
        {value.displayName}
      </button>
      <button
        aria-label="Other market"
        onClick={() => onChange({ ...value, canonicalKey: "GB", displayName: "United Kingdom" })}
        type="button"
      >
        United Kingdom
      </button>
    </>
  ),
}));

const context = {
  competitorDomains: ["competitor.example.com"],
  costContext: { capCents: 5000, spentCents: 100 },
  defaultTarget: "example.com",
  providerStatus: "connected" as const,
  recentTargets: [],
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
    fireEvent.click(screen.getByRole("button", { name: /analyze domain/i }));
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

  it("opens a recent cached report through navigation without forcing a cap-zero analysis", () => {
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

  it("does not promise an uncharged failure when the action transport is indeterminate", async () => {
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

  it("surfaces a market without a numeric provider handle instead of inventing one", () => {
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
