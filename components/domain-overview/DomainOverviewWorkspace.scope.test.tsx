import { SessionSpendProvider } from "@/components/cost-estimate/SessionSpendProvider";
import type { ResearchScope } from "@/lib/research/scope";
import { routerMock } from "@/tests/next-navigation";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DomainOverviewWorkspace } from "./DomainOverviewWorkspace";
import { domainOverviewReportFixture, domainOverviewScopeFixture } from "./fixtures";

const unitedKingdomScope: ResearchScope = {
  countryCode: "GB",
  countryName: "United Kingdom",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2826,
  researchAvailable: true,
};
const unavailableSpanishScope: ResearchScope = {
  countryCode: "ES",
  countryName: "Spain",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2724,
  researchAvailable: false,
};

vi.mock("./ResearchScopePicker", () => ({
  ResearchScopePicker: ({ onChange }: { onChange: (scope: ResearchScope) => void }) => (
    <button
      aria-label="Country and language: United Kingdom / English"
      onClick={() => onChange(unitedKingdomScope)}
      type="button"
    >
      Change country and language
    </button>
  ),
}));

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

function renderWorkspace(overrides: Partial<ComponentProps<typeof DomainOverviewWorkspace>> = {}) {
  return render(
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
        projectId="prj_1"
        projectRef="prj_1"
        researchScope={domainOverviewScopeFixture}
        {...overrides}
      />
    </SessionSpendProvider>,
  );
}

describe("DomainOverviewWorkspace research scope state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, "", "/");
  });

  it("navigates with the selected country-language scope", () => {
    renderWorkspace();

    fireEvent.click(
      screen.getByRole("button", { name: "Country and language: United Kingdom / English" }),
    );
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/domain-overview?researchScope=GB%3Aen&domain=example.com",
    );
  });

  it("opens a recent cached report without another analysis", () => {
    const analyzeAction = vi.fn();
    renderWorkspace({
      analyzeAction,
      context: {
        ...context,
        recentTargets: [
          {
            cachedUntil: "2026-08-12T20:00:00.000Z",
            fetchedAt: "2026-08-12T08:00:00.000Z",
            languageCode: "en",
            locationCode: 2840,
            scope: "root",
            target: "recent.example.com",
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /recent\.example\.com/i }));
    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/domain-overview?domain=recent.example.com&researchScope=US%3Aen&scope=root",
    );
    expect(analyzeAction).not.toHaveBeenCalled();
  });

  it("shows the unavailable country-language state when no provider code exists", () => {
    renderWorkspace({
      researchScope: { ...domainOverviewScopeFixture, providerLocationCode: null },
    });

    expect(
      screen.getByText(
        "Research is not available for United States / English. Rank tracking is unaffected.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze domain/i })).toBeDisabled();
  });

  it("shows the unavailable country-language state with a provider code", () => {
    renderWorkspace({ researchScope: unavailableSpanishScope });

    expect(
      screen.getByText(
        "Research is not available for Spain / English. Rank tracking is unaffected.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze domain/i })).toBeDisabled();
  });

  it("keeps the cached report visible when a requested analysis fails", async () => {
    const analyzeAction = vi.fn().mockResolvedValue({
      costCents: 0,
      ok: false,
      reason: "rate_limited",
    });
    renderWorkspace({
      analyzeAction,
      initialEstimate: { ...initialEstimate, cached: true, costCents: 0 },
      initialOutcome: domainOverviewReportFixture,
    });

    fireEvent.click(screen.getByRole("button", { name: /refresh now.*\$0\.06/i }));
    expect(await screen.findByRole("button", { name: /refresh now/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /analyze domain/i })).not.toBeInTheDocument();
  });
});
