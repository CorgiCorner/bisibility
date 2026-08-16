import type { CompetitorMarketOption } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CompetitorScopeControls } from "./CompetitorScopeControls";
import { competitorRegistryOptions } from "./competitor-market-mapping";

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
  option("BE", "BE", "nl", "Dutch", "loc_be_nl"),
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
    researchAvailable: true,
    status: "active" as const,
  })),
  maxMarkets: 5,
  monthlyCostCents: null,
  perMarketChecks: 2,
  projectId: "prj_1",
} satisfies ProjectMarketsView;

const mappingMarkets = [
  option("ES", "ES", "es", "Spanish", "loc_es_es"),
  option("ES@en", "ES", "en", "English", "loc_es_en"),
  option("BE", "BE", "nl", "Dutch", "loc_be_nl"),
  option("BE@ar", "BE", "ar", "Arabic", "loc_be_ar"),
];

const mappingProjectMarkets = {
  markets: mappingMarkets.map((market, index) => ({
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

describe("CompetitorScopeControls", () => {
  it("preserves the saved-view ID when the market chip changes", async () => {
    const user = userEvent.setup();
    render(
      <CompetitorScopeControls
        markets={markets}
        projectMarkets={projectMarkets}
        projectRef="prj_1"
        scope={{ device: "desktop", engine: "google", locationId: "loc_es_es" }}
        viewId="view_1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Competitor market" }));
    await user.click(screen.getByRole("menuitem", { name: /Belgium \/ Dutch/ }));

    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/competitors?device=desktop&engine=google&location=loc_be_nl&view=view_1",
    );
  });

  it("does not render a search engine control or Google copy", () => {
    render(
      <CompetitorScopeControls
        markets={markets}
        projectMarkets={projectMarkets}
        projectRef="prj_1"
        scope={{ device: "desktop", engine: "google", locationId: "loc_es_es" }}
      />,
    );

    expect(screen.queryByLabelText("Search engine")).not.toBeInTheDocument();
    expect(screen.queryByText(/Google/)).not.toBeInTheDocument();
  });

  it("searches by language code through the shared combobox before selection", async () => {
    const user = userEvent.setup();
    render(
      <CompetitorScopeControls
        markets={mappingMarkets}
        projectMarkets={mappingProjectMarkets}
        projectRef="prj_1"
        scope={{ device: "desktop", engine: "google", locationId: "loc_es_es" }}
        viewId="view_2"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Competitor market" }));
    await user.type(screen.getByRole("textbox", { name: "Search markets..." }), "nl");
    await user.click(screen.getByRole("menuitem", { name: /Belgium \/ Dutch/ }));

    expect(routerMock.push).toHaveBeenCalledWith(
      "/app/prj_1/competitors?device=desktop&engine=google&location=loc_be_nl&view=view_2",
    );
  });
});

describe("competitorRegistryOptions", () => {
  it("uses the plain registry order and disables off-catalog pairs with the SOV reason", async () => {
    const user = userEvent.setup();
    render(
      <CompetitorScopeControls
        markets={mappingMarkets}
        projectMarkets={mappingProjectMarkets}
        projectRef="prj_1"
        scope={{ device: "desktop", engine: "google", locationId: "loc_es_es" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Competitor market" }));
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
    render(
      <CompetitorScopeControls
        markets={mappingMarkets}
        projectMarkets={mappingProjectMarkets}
        projectRef="prj_1"
        scope={{ device: "desktop", engine: "google", locationId: "loc_es_es" }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Competitor market" }));
    await user.click(screen.getByRole("menuitem", { name: /Belgium \/ Dutch/ }));

    expect(routerMock.push).toHaveBeenCalledWith(expect.stringContaining("location=loc_be_nl"));
  });

  it("derives research support from the PR1 catalog guard", () => {
    const options = competitorRegistryOptions(mappingMarkets, "desktop", mappingProjectMarkets);
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
      ...mappingProjectMarkets,
      markets: mappingProjectMarkets.markets.slice(0, 1),
    });

    expect(desktopOption).toMatchObject({
      disabled: true,
      payload: null,
      secondary: "no desktop keywords",
      tooltip: "Track desktop keywords in this market before using it for SOV.",
    });
  });
});
