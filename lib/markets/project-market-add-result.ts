import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";

export type AddProjectMarketsResult =
  | { added: number; marketIds: readonly string[]; ok: true }
  | { code: "market_limit"; maxMarkets: number; ok: false; remaining: number };

export type ResolvedProjectMarket = { locationId: string };

export function uniqueProjectMarketLocations(markets: readonly ResolvedProjectMarket[]) {
  return [...new Map(markets.map((market) => [market.locationId, market])).values()];
}

export function projectMarketAddResult(
  visibleLocationIds: readonly string[],
  resolvedMarkets: readonly ResolvedProjectMarket[],
): AddProjectMarketsResult {
  const visible = new Set(visibleLocationIds);
  const unique = uniqueProjectMarketLocations(resolvedMarkets);
  const additions = unique.filter((market) => !visible.has(market.locationId));
  const remaining = Math.max(0, MAX_PROJECT_MARKETS - visible.size);
  if (additions.length > remaining) {
    return { code: "market_limit", maxMarkets: MAX_PROJECT_MARKETS, ok: false, remaining };
  }
  return { added: additions.length, marketIds: [], ok: true };
}
