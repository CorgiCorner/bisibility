import type { ProviderCatalogEntry, ProviderTestResult } from "@/lib/providers/types";
import { MAX_ALLOCATION_AMOUNT, type StoredProviderAllocation } from "./types";

/** Seed a new connection from verified availability, never from the plan capacity. */
export function initialProviderAllocation(
  provider: ProviderCatalogEntry,
  verification: ProviderTestResult | undefined,
): StoredProviderAllocation {
  const unset = { allocationAmountPerMonth: null, allocationUnit: null };
  const balance = verification?.balance;
  if (
    provider.allocation.kind !== "billable" ||
    !verification?.ok ||
    typeof balance !== "number" ||
    !Number.isFinite(balance) ||
    balance <= 0
  )
    return unset;
  const unit = provider.allocation.allocationUnit;
  // Round down to whole cents/searches without losing a cent to float imprecision.
  const amount = Math.floor(Number((balance * (unit === "cents" ? 100 : 1)).toFixed(8)));
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > MAX_ALLOCATION_AMOUNT) return unset;
  return { allocationAmountPerMonth: amount, allocationUnit: unit };
}
