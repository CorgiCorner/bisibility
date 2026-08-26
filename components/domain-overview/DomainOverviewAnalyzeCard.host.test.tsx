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
  it("fills the desktop market wrapper through the tooltip trigger", () => {
    renderCard([currentMarket]);

    const trigger = screen.getByRole("button", { name: /Market:/ });
    expect(trigger).toHaveClass("h-[34px]", "min-h-[34px]", "w-full");
    expect(trigger).not.toHaveClass("h-10", "min-h-10");
    expect(trigger.parentElement).toHaveClass("w-full");
    expect(trigger.parentElement?.parentElement).toHaveClass("md:w-[230px]");
  });

  it("shows the selected country flag in the market trigger", () => {
    renderCard([currentMarket]);

    expect(
      screen.getByRole("button", { name: /Market:/ }).querySelector("[data-country-flag='US']"),
    ).toBeInTheDocument();
  });

  it("keeps the domain target within the exact compact control height", () => {
    renderCard([currentMarket]);

    const target = screen.getByRole("textbox", { name: "Domain or subdomain" });
    expect(target.parentElement).toHaveClass("h-[34px]", "min-h-[34px]");
    expect(target).toHaveClass(
      "h-full",
      "min-h-0",
      "py-1",
      "compact-text-12",
      "text-[12px]",
      "leading-4",
      "placeholder:text-[12px]",
      "placeholder:leading-4",
    );
    expect(target).not.toHaveClass("h-10", "min-h-10");
  });

  it("uses the neutral subdomain example in the domain placeholder", () => {
    renderCard([currentMarket]);

    expect(screen.getByRole("textbox", { name: "Domain or subdomain" })).toHaveAttribute(
      "placeholder",
      "Enter any domain or subdomain, e.g. blog.acme.example.com",
    );
  });
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
