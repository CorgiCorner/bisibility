import type { DomainOverviewMarketOption } from "@/lib/domain-overview/market-options";
import { DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP } from "@/lib/domain-overview/market-options";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DomainOverviewAnalyzeCard } from "./DomainOverviewAnalyzeCard";
import { domainOverviewMarketFixture } from "./fixtures";

const estimate = {
  cached: false,
  costCents: 4,
  freshCostCents: 6,
  historyCostCents: 12,
  keywordPageCostCents: 2,
  loading: false,
  pagePageCostCents: 3,
  valid: true,
};

const currentMarket: DomainOverviewMarketOption = {
  canonicalKey: domainOverviewMarketFixture.canonicalKey,
  cityName: null,
  countryCode: "US",
  displayName: domainOverviewMarketFixture.displayName,
  kind: "country",
  languageCode: "en",
  languageLabel: "English",
  locationCode: domainOverviewMarketFixture.locationCode,
  provenance: null,
  regionName: null,
  researchAvailable: true,
};

const provenanceMarket: DomainOverviewMarketOption = {
  ...currentMarket,
  canonicalKey: "DE",
  countryCode: "DE",
  displayName: "Germany",
  locationCode: 2276,
  provenance: "Berlin tracked at city level - domain analysis runs on the country pair.",
};

const unavailableMarket: DomainOverviewMarketOption = {
  ...currentMarket,
  canonicalKey: "ES@en",
  countryCode: "ES",
  displayName: "Spain",
  locationCode: 2724,
  researchAvailable: false,
};

function renderCard(
  trackedMarkets: readonly DomainOverviewMarketOption[],
  onMarketChange = vi.fn(),
) {
  render(
    <DomainOverviewAnalyzeCard
      catalogMarkets={[unavailableMarket]}
      estimate={estimate}
      market={domainOverviewMarketFixture}
      onMarketChange={onMarketChange}
      onScopeChange={vi.fn()}
      onSubmit={vi.fn()}
      onTargetChange={vi.fn()}
      submitting={false}
      target="example.com"
      trackedMarkets={trackedMarkets}
    />,
  );
  return onMarketChange;
}

describe("DomainOverviewAnalyzeCard market combobox", () => {
  it("preserves tracked payloads and exposes provenance and unavailable reasons", async () => {
    const user = userEvent.setup();
    const onMarketChange = renderCard([currentMarket, provenanceMarket]);

    await user.click(screen.getByRole("button", { name: /Market:/ }));
    const provenance = screen.getByRole("menuitem", { name: /Germany \/ English/ });
    expect(provenance).not.toHaveAttribute("title");
    const provenanceDescId = provenance.getAttribute("aria-describedby");
    expect(provenanceDescId).not.toBeNull();
    expect(document.getElementById(provenanceDescId ?? "")).toHaveTextContent(
      provenanceMarket.provenance ?? "",
    );
    await user.click(provenance);
    expect(onMarketChange).toHaveBeenCalledWith(provenanceMarket);

    await user.click(screen.getByRole("button", { name: /Market:/ }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "spain");
    const unavailable = screen.getByRole("menuitem", { name: /Spain \/ English/ });
    expect(unavailable).toHaveAttribute("aria-disabled", "true");
    expect(unavailable).not.toHaveAttribute("title");
    const unavailableDescId = unavailable.getAttribute("aria-describedby");
    expect(unavailableDescId).not.toBeNull();
    expect(document.getElementById(unavailableDescId ?? "")).toHaveTextContent(
      DOMAIN_OVERVIEW_UNAVAILABLE_TOOLTIP,
    );
    expect(unavailable).toHaveTextContent("unavailable");
    fireEvent.click(unavailable);
    expect(onMarketChange).toHaveBeenCalledTimes(1);
  });

  it("hides the catalog until search and uses the exact empty-state messages", async () => {
    const user = userEvent.setup();
    renderCard([]);

    await user.click(screen.getByRole("button", { name: /Market:/ }));
    expect(screen.queryByText("Catalog")).not.toBeInTheDocument();
    expect(screen.getByText("Type to search the catalog.")).toBeInTheDocument();

    const search = screen.getByRole("textbox", { name: "Search markets..." });
    await user.type(search, "missing");
    expect(screen.getByText("No market matches this search.")).toBeInTheDocument();
  });
});
