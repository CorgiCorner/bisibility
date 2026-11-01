import { PROVIDER_CATALOG } from "./catalog-metadata";
import type { ProviderBillingUnit } from "./types";

/**
 * The provider's own billed unit, from the catalog. Usage rows carry either the provider id or
 * its display label, so both resolve. Null when the provider bills in money or is unknown.
 */
export function providerBillingUnit(
  provider: string | null | undefined,
): ProviderBillingUnit | null {
  const key = provider?.trim().toLowerCase();
  if (!key) return null;
  const entry = PROVIDER_CATALOG.find(
    (item) => item.id === key || item.label.toLowerCase() === key,
  );
  return entry && "billingUnit" in entry ? entry.billingUnit : null;
}
