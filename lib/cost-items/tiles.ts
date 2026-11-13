import type { CostBilling } from "./monthly";

export type CostTileItem = {
  billing: CostBilling;
  currency: string;
  shareMinor: number;
};

export type MoneyLine = { currency: string; minor: number };

export type CostTiles = {
  custom: MoneyLine[];
  provider: MoneyLine[];
  seo: MoneyLine[];
  subscriptions: MoneyLine[];
};

function add(lines: Map<string, number>, currency: string, minor: number) {
  lines.set(currency, (lines.get(currency) ?? 0) + minor);
}

function sorted(lines: Map<string, number>): MoneyLine[] {
  return [...lines.entries()]
    .sort(
      (left, right) =>
        Number(right[0] === "USD") - Number(left[0] === "USD") || left[0].localeCompare(right[0]),
    )
    .map(([currency, minor]) => ({ currency, minor }));
}

/** Provider operations stay in their own currency. Item currencies are never converted. */
export function costTiles(
  items: readonly CostTileItem[],
  provider: { currency: string; minor: number } | null,
): CostTiles {
  const subscriptions = new Map<string, number>();
  const custom = new Map<string, number>();
  const seo = new Map<string, number>();
  for (const item of items) {
    const target = item.billing === "one_off" ? custom : subscriptions;
    add(target, item.currency, item.shareMinor);
    add(seo, item.currency, item.shareMinor);
  }
  const providerLines = new Map<string, number>();
  if (provider) {
    add(providerLines, provider.currency, provider.minor);
    add(seo, provider.currency, provider.minor);
  }
  return {
    custom: sorted(custom),
    provider: sorted(providerLines),
    seo: sorted(seo),
    subscriptions: sorted(subscriptions),
  };
}
