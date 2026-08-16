import type { MarketComboboxOption } from "@/components/markets/MarketCombobox";
import type { CompetitorMarketOption } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { supportsResearchMarket } from "@/lib/serp/market-capability";

const NO_VOLUME_TOOLTIP = "SOV needs search volume - this pair is outside the research catalog.";

type RegistryMarket = ProjectMarketsView["markets"][number];

function registryMarkets(
  markets: readonly CompetitorMarketOption[],
  projectMarkets?: ProjectMarketsView,
): RegistryMarket[] {
  if (projectMarkets) return projectMarkets.markets;
  const seen = new Set<string>();
  return markets.flatMap((market) => {
    if (seen.has(market.canonicalKey)) return [];
    seen.add(market.canonicalKey);
    return [
      {
        canonicalKey: market.canonicalKey,
        countryCode: market.countryCode,
        displayName: market.location,
        id: market.canonicalKey,
        languageCode: market.hl,
        languageLabel: market.languageLabel,
        monthlyCostCents: null,
        researchAvailable: supportsResearchMarket(market.countryCode, market.hl),
        status: "active" as const,
      },
    ];
  });
}

function targetMarket(
  market: RegistryMarket,
  options: readonly CompetitorMarketOption[],
  currentDevice: "desktop" | "mobile",
) {
  const matching = options.filter((option) => option.canonicalKey === market.canonicalKey);
  return matching.find((option) => option.device === currentDevice) ?? null;
}

export function competitorRegistryOptions(
  markets: readonly CompetitorMarketOption[],
  currentDevice: "desktop" | "mobile",
  projectMarkets?: ProjectMarketsView,
): MarketComboboxOption<CompetitorMarketOption | null>[] {
  return registryMarkets(markets, projectMarkets).map((market) => {
    const target = targetMarket(market, markets, currentDevice);
    const researchAvailable = supportsResearchMarket(market.countryCode, market.languageCode);
    const paused = market.status !== "active";
    const disabled = !researchAvailable || paused || !target;
    const secondary = !researchAvailable
      ? "no volume data"
      : paused
        ? "paused"
        : target
          ? undefined
          : `no ${currentDevice} keywords`;
    const tooltip = !researchAvailable
      ? NO_VOLUME_TOOLTIP
      : paused
        ? "Enable this market in Settings before using it for SOV."
        : target
          ? undefined
          : `Track ${currentDevice} keywords in this market before using it for SOV.`;
    return {
      countryCode: market.countryCode,
      disabled,
      languageCode: market.languageCode,
      languageLabel: market.languageLabel,
      locationLabel: market.displayName,
      payload: target,
      secondary,
      tooltip,
      value: market.canonicalKey,
    };
  });
}
