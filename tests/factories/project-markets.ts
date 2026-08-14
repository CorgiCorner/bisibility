import type { ProjectMarketsView } from "@/lib/queries/project-markets";

export const projectMarketsFixture = {
  markets: [
    {
      canonicalKey: "US",
      countryCode: "US",
      displayName: "United States",
      id: "pmkt_fixture_us",
      languageCode: "en",
      languageLabel: "English",
      monthlyCostCents: 120,
      researchAvailable: true,
      status: "active",
    },
  ],
  maxMarkets: 5,
  monthlyCostCents: 120,
  perMarketChecks: 12,
  projectId: "prj_fixture",
} as const satisfies ProjectMarketsView;
