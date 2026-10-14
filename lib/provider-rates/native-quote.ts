import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { compareQuantity } from "@usagekit/core";
import { loadNativeCatalogPolicy, nativeProviderCatalog } from "./catalog-policy";
import {
  MAPS_POST_OPERATION,
  MAPS_PRICE_VERSION,
  mapsPriceCurrent,
} from "./dataforseo-maps-module";
import type { NativePriceBinding } from "./native-price-samples";
import { searchBudgetQuote } from "./search-budget-quote";

export class ProviderQuoteUnavailableError extends Error {
  constructor() {
    super("Provider request has no confirmed monetary estimate");
    this.name = "ProviderQuoteUnavailableError";
  }
}

/** Previews and admission resolve exactly the same credential-bound request variant. */
export async function loadNativeProviderQuote(
  db: Pick<Prisma.TransactionClient, "providerConnection" | "$queryRaw">,
  binding: NativePriceBinding,
  feature: string,
  operation: string,
  options: Readonly<Record<string, string>>,
  now = new Date(),
  unitsPerCheck = 1,
) {
  const policy = await loadNativeCatalogPolicy(db, binding, feature, operation, options, now);
  if (binding.provider === "serpapi") {
    if (feature !== "rank_check" || operation !== "search" || Object.keys(options).length)
      throw new ProviderQuoteUnavailableError();
    return searchBudgetQuote(policy, unitsPerCheck);
  }
  const quote = nativeProviderCatalog.estimate(
    { ...policy, id: binding.connectionId },
    operation,
    options,
  );
  if (quote.source === "unknown" || !quote.quantities.some((q) => q.unit === "cents"))
    throw new ProviderQuoteUnavailableError();
  if (
    binding.provider === "dataforseo" &&
    operation === MAPS_POST_OPERATION &&
    quote.source === "measured" &&
    !quote.priceVersion
  ) {
    if (options.mapsPriceVersion !== MAPS_PRICE_VERSION || !mapsPriceCurrent(now))
      throw new ProviderQuoteUnavailableError();
    // Measured amounts retain the independently current catalog floor's version, not a list fallback amount.
    const floor = nativeProviderCatalog.estimate(
      { ...policy, id: binding.connectionId, measured: undefined },
      operation,
      options,
    );
    const measuredCents = quote.quantities.find((q) => q.unit === "cents"),
      floorCents = floor.quantities.find((q) => q.unit === "cents");
    if (
      floor.source !== "list" ||
      !floor.priceVersion ||
      !measuredCents ||
      !floorCents ||
      compareQuantity(measuredCents, floorCents) < 0
    )
      throw new ProviderQuoteUnavailableError();
    return { ...quote, priceVersion: floor.priceVersion, budgetValuation: undefined };
  }
  return { ...quote, budgetValuation: undefined };
}
