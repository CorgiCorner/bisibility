import type { CompetitorMarketOption } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { routerMock } from "@/tests/next-navigation";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CompetitorScopeControls } from "./CompetitorScopeControls";

const markets = [
  {
    canonicalKey: "ES",
    checkedKeywordCount: 2,
    cityName: null,
    countryCode: "ES",
    device: "desktop",
    engine: "google",
    hl: "es",
    key: "loc_es_es::desktop::google",
    keywordCount: 2,
    languageLabel: "Spanish",
    location: "Spain",
    locationId: "loc_es_es",
    locationKind: "country",
    regionName: null,
  },
  {
    canonicalKey: "BE",
    checkedKeywordCount: 2,
    cityName: null,
    countryCode: "BE",
    device: "desktop",
    engine: "google",
    hl: "nl",
    key: "loc_be_nl::desktop::google",
    keywordCount: 2,
    languageLabel: "Dutch",
    location: "Belgium",
    locationId: "loc_be_nl",
    locationKind: "country",
    regionName: null,
  },
] satisfies CompetitorMarketOption[];

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
});
