import { type MarketScope, marketScopeLabel } from "@/lib/markets/market-scope";
import type { ActiveLens } from "./lens-model";

type ScopeMarket = {
  canonicalKey: string;
  locationId?: string;
  displayName: string;
  languageLabel: string;
  name?: string;
};
export function keywordViewScopeLabels(
  lens: ActiveLens,
  marketScope: MarketScope | null,
  markets: readonly ScopeMarket[] | undefined,
  labels: {
    allLocations: string;
    selectedLocation: string;
    allDevices: string;
    desktop: string;
    mobile: string;
  },
) {
  const selected = lens.locationId
    ? markets?.find((market) => market.canonicalKey === lens.locationId)
    : null;
  const location = lens.locationId
    ? selected
      ? selected.name &&
        selected.name !== selected.locationId &&
        selected.name !== selected.canonicalKey
        ? selected.name
        : marketScopeLabel(selected)
      : labels.selectedLocation
    : (marketScope?.label ?? labels.allLocations);
  const device = lens.device === "all" ? labels.allDevices : labels[lens.device];
  return { location, device };
}
