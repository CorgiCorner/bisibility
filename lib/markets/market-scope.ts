import type { MarketContextValue } from "@/lib/markets/market-context-value";
import type { MarketRef } from "@/lib/routing/app-path";

/**
 * A market is a navigation level, so every surface that spends money or reports emptiness has
 * to be able to say WHICH market it means. This module answers that from the URL-resolved
 * context plus the project's own market list, and it answers `null` whenever it cannot name a
 * market with certainty - a surface that cannot name its market keeps its project-level copy
 * rather than labelling a spend with a guess.
 */

/** The subset of a project market this module reads. `ProjectMarketsView["markets"]` satisfies it. */
export type MarketScopeSource = {
  canonicalKey: string;
  displayName: string;
  id: string;
  languageLabel: string;
  name?: string;
  locationId?: string;
  status?: "active" | "paused";
};

export type MarketScope = {
  /** Matches `KeywordRow.location.canonicalKey`, which is how a row's market membership is read. */
  canonicalKey: string;
  label: string;
  ref: MarketRef;
  status?: "active" | "paused";
};

/** The same two halves the market chip shows, in one string a sentence can carry. */
export function marketScopeLabel(
  market: Readonly<{ displayName: string; languageLabel?: string }>,
): string {
  return market.languageLabel
    ? `${market.displayName} / ${market.languageLabel}`
    : market.displayName;
}

export function resolveMarketScope(
  context: MarketContextValue,
  markets: readonly MarketScopeSource[] | undefined,
): MarketScope | null {
  const ref = context.market?.ref;
  if (!ref) {
    return null;
  }
  const match = markets?.find((market) => market.id === ref);
  return match
    ? {
        canonicalKey: match.canonicalKey,
        label: match.name && match.name !== match.locationId ? match.name : marketScopeLabel(match),
        ref: match.id,
        status: match.status,
      }
    : null;
}

export type MarketRunPartition = {
  /**
   * Every id, but only when some of them lie outside the market. `null` means there is no
   * cross-market action to offer, which is also the project level's answer.
   */
  crossMarketIds: string[] | null;
  inMarketIds: string[];
};

/** Splits rows into what this market pays for and what a cross-market run would add. */
export function marketRunPartition(
  rows: readonly Readonly<{ id: string; location: { canonicalKey: string } }>[],
  scope: MarketScope | null,
): MarketRunPartition {
  const allIds = rows.map((row) => row.id);
  if (!scope) {
    return { crossMarketIds: null, inMarketIds: allIds };
  }
  const inMarketIds = rows
    .filter((row) => row.location.canonicalKey === scope.canonicalKey)
    .map((row) => row.id);
  return {
    crossMarketIds: inMarketIds.length === allIds.length ? null : allIds,
    inMarketIds,
  };
}

/** `Run checks` at the project level, `Run checks in Germany / German` inside one. */
export function scopedRunActionLabel(actionLabel: string, scope: MarketScope | null): string {
  return scope ? `${actionLabel} in ${scope.label}` : actionLabel;
}
