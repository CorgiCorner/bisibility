import type { ProviderCatalogEntry } from "@/lib/providers/types";
import {
  MAX_ALLOCATION_AMOUNT,
  type ProviderAllocation,
  type ProviderConnectionAllocationUpdate,
} from "./types";

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

export function validateProviderConnectionAllocations(
  catalog: readonly ProviderCatalogEntry[],
  provider: string,
  allocations: ProviderConnectionAllocationUpdate,
) {
  if (
    allocations.app &&
    allocations.programmatic &&
    allocations.app.unit !== allocations.programmatic.unit
  ) {
    throw new TypeError("App and programmatic allocations must share one unit.");
  }
  if (allocations.app !== undefined) validateProviderAllocation(catalog, provider, allocations.app);
  if (allocations.programmatic !== undefined) {
    validateProviderAllocation(catalog, provider, allocations.programmatic);
  }
  for (const credits of [allocations.credits?.app, allocations.credits?.programmatic]) {
    if (credits !== undefined) validateCreditsAllocation(catalog, provider, credits);
  }
}

/** Credits budgets are always cents of charged credits price, whatever the catalog unit. */
export function validateCreditsAllocation(
  catalog: readonly ProviderCatalogEntry[],
  provider: string,
  allocation: ProviderAllocation | null,
) {
  const entry = catalogEntry(catalog, provider);
  if (!allocation) return;
  if (entry.allocation.kind !== "billable") {
    throw new TypeError("Non-billable providers cannot have an allocation.");
  }
  validateAllocationAmount(allocation.amountPerMonth);
  if (allocation.unit !== "cents") throw new TypeError("Credits budgets are set in cents.");
}
