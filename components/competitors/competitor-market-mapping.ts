import type { MarketComboboxOption } from "@/components/markets/MarketCombobox";
import type { CompetitorMarketOption } from "@/lib/competitors/types";
import type { ProjectMarketsView } from "@/lib/queries/project-markets";
import { supportsResearchScope } from "@/lib/serp/research-capability";

export type CompetitorMarketCopy = {
  noDeviceKeywords: (values: { device: string }) => string;
  noVolumeData: string;
  noVolumeTooltip: string;
  paused: string;
  pausedTooltip: string;
  trackDeviceKeywords: (values: { device: string }) => string;
};

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
        researchAvailable: supportsResearchScope(market.countryCode, market.hl),
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
  copy: CompetitorMarketCopy,
  projectMarkets?: ProjectMarketsView,
): MarketComboboxOption<CompetitorMarketOption | null>[] {
  return registryMarkets(markets, projectMarkets).map((market) => {
    const target = targetMarket(market, markets, currentDevice);
    const researchAvailable = supportsResearchScope(market.countryCode, market.languageCode);
    const paused = market.status !== "active";
    const disabled = !researchAvailable || paused || !target;
    const secondary = !researchAvailable
      ? copy.noVolumeData
      : paused
        ? copy.paused
        : target
          ? undefined
          : copy.noDeviceKeywords({ device: currentDevice });
    const tooltip = !researchAvailable
      ? copy.noVolumeTooltip
      : paused
        ? copy.pausedTooltip
        : target
          ? undefined
          : copy.trackDeviceKeywords({ device: currentDevice });
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
