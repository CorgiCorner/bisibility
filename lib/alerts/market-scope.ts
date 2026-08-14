export type AlertMarketRule = {
  markets: {
    projectMarket: {
      locationId: string;
      status: string;
    };
  }[];
};

/** No selected rows preserves the legacy All markets behavior. */
export function alertMarketMatches(rule: AlertMarketRule, keywordLocationId: string) {
  if (rule.markets.length === 0) return true;
  return rule.markets.some(
    ({ projectMarket }) =>
      projectMarket.status === "active" && projectMarket.locationId === keywordLocationId,
  );
}
