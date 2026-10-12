import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadNativeCatalogPolicy, nativeProviderCatalog } from "./catalog-policy";
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
  return { ...quote, budgetValuation: undefined };
}
