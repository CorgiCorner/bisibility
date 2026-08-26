import type { ProviderCatalogEntry } from "@/lib/providers/types";
import { MAX_ALLOCATION_AMOUNT, type ProviderAllocation } from "./types";

export function validateAllocationAmount(amount: number) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_ALLOCATION_AMOUNT) {
    throw new RangeError(
      `Allocation amount must be an integer from 1 to ${MAX_ALLOCATION_AMOUNT}.`,
    );
  }
}

export function catalogEntry(
  catalog: readonly ProviderCatalogEntry[],
  provider: string,
): ProviderCatalogEntry {
  const entry = catalog.find((candidate) => candidate.id === provider);
  if (!entry) throw new TypeError(`Provider ${provider} is not present in the closed catalog.`);
  return entry;
}

export function validateProviderAllocation(
  catalog: readonly ProviderCatalogEntry[],
  provider: string,
  allocation: ProviderAllocation | null,
) {
  const entry = catalogEntry(catalog, provider);
  if (entry.allocation.kind !== "billable") {
    if (allocation) throw new TypeError("Non-billable providers cannot have an allocation.");
    return;
  }
  if (!allocation) return;
  validateAllocationAmount(allocation.amountPerMonth);
  if (allocation.unit !== entry.allocation.allocationUnit) {
    throw new TypeError("Allocation unit does not match provider catalog metadata.");
  }
}
