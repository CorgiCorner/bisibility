export type KeywordImportMarket = {
  canonicalKey: string;
  displayName: string;
  id: string;
  languageLabel: string;
  locationId?: string;
  name?: string;
  status: "active" | "paused";
};

export type KeywordImportMarketContext = {
  initialMarketKey?: string;
  markets: readonly KeywordImportMarket[];
};

export function initialImportMarketKey(context?: KeywordImportMarketContext): string | null {
  if (
    context?.initialMarketKey &&
    context.markets.some((market) => market.canonicalKey === context.initialMarketKey)
  )
    return context.initialMarketKey;
  return context?.markets.length === 1 ? context.markets[0].canonicalKey : null;
}

export function importMarketLabel(market: KeywordImportMarket) {
  const name = market.name && market.name !== market.locationId ? `${market.name} - ` : "";
  return `${name}${market.displayName} / ${market.languageLabel}${market.status === "paused" ? " (paused)" : ""}`;
}
