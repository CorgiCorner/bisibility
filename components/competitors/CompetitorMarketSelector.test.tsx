import type { CompetitorMarketOption } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CompetitorMarketSelector, competitorRegistryOptions } from "./CompetitorMarketSelector";

function option(
  canonicalKey: string,
  countryCode: string,
  hl: string,
  languageLabel: string,
  locationId: string,
  device: "desktop" | "mobile" = "desktop",
): CompetitorMarketOption {
  return {
    canonicalKey,
    checkedKeywordCount: 4,
    cityName: null,
    countryCode,
    device,
    engine: "google",
    hl,
    key: `${locationId}::desktop::google`,
    keywordCount: 4,
    languageLabel,
    location: countryCode === "ES" ? "Spain" : "Belgium",
    locationId,
    locationKind: "country",
    regionName: null,
  };
}

const markets = [
  option("ES", "ES", "es", "Spanish", "loc_es_es"),
  option("ES@en", "ES", "en", "English", "loc_es_en"),
  option("BE", "BE", "nl", "Dutch", "loc_be_nl"),
  option("BE@ar", "BE", "ar", "Arabic", "loc_be_ar"),
];

const projectMarkets = {
  markets: markets.map((market, index) => ({
    canonicalKey: market.canonicalKey,
    countryCode: market.countryCode,
    displayName: market.location,
    id: `pmkt_${index}`,
    languageCode: market.hl,
    languageLabel: market.languageLabel,
    monthlyCostCents: null,
    researchAvailable: market.canonicalKey !== "BE@ar",
    status: "active" as const,
  })),
  maxMarkets: 5,
  monthlyCostCents: null,
  perMarketChecks: 4,
  projectId: "prj_1",
} satisfies ProjectMarketsView;

describe("CompetitorMarketSelector", () => {
  it("uses the plain registry order and disables off-catalog pairs with the SOV reason", async () => {
    const user = userEvent.setup();
    render(
      <CompetitorMarketSelector
        currentDevice="desktop"
        currentLocationId="loc_es_es"
        markets={markets}
        onChange={vi.fn()}
        projectMarkets={projectMarkets}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Competitor market" }));

    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getAllByRole("menuitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Spain / Spanish"),
      expect.stringContaining("Spain / English"),
      expect.stringContaining("Belgium / Dutch"),
      expect.stringContaining("Belgium / Arabicno volume data"),
    ]);
    const unsupported = screen.getByRole("menuitem", { name: /Belgium \/ Arabic/ });
    expect(unsupported).toHaveAttribute("aria-disabled", "true");
    expect(unsupported).toHaveAttribute(
      "title",
      "SOV needs search volume - this pair is outside the research catalog.",
    );
  });

  it("returns the matching current-device target when a supported registry chip is selected", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <CompetitorMarketSelector
        currentDevice="desktop"
        currentLocationId="loc_es_es"
        markets={markets}
        onChange={onChange}
        projectMarkets={projectMarkets}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Competitor market" }));
    await user.click(screen.getByRole("menuitem", { name: /Belgium \/ Dutch/ }));

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ locationId: "loc_be_nl" }));
  });

  it("derives research support from the PR1 catalog guard", () => {
    const options = competitorRegistryOptions(markets, "desktop", projectMarkets);

    expect(options.find((item) => item.value === "BE@ar")).toMatchObject({
      disabled: true,
      secondary: "no volume data",
    });
    expect(options.find((item) => item.value === "ES@en")).toMatchObject({
      disabled: true,
      secondary: "no volume data",
    });
    expect(options.find((item) => item.value === "BE")).toMatchObject({ disabled: false });
  });

  it("does not silently switch devices when a market has keywords only on mobile", () => {
    const mobileOnly = [option("ES", "ES", "es", "Spanish", "loc_es_es", "mobile")];
    const [desktopOption] = competitorRegistryOptions(mobileOnly, "desktop", {
      ...projectMarkets,
      markets: projectMarkets.markets.slice(0, 1),
    });

    expect(desktopOption).toMatchObject({
      disabled: true,
      secondary: "no desktop keywords",
      target: null,
      tooltip: "Track desktop keywords in this market before using it for SOV.",
    });
  });
});
