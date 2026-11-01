import type { ProviderAllocationCatalog } from "./allocation-catalog";
import {
  providerAllocationMetadata as historicalAllocation,
  PROVIDER_ALLOCATION_METADATA as historicalMetadata,
} from "./allocation-metadata";

// The original module is an immutable accounting-migration input. Extend current
// provider capabilities here while historical replay keeps its original inputs.
export const PROVIDER_ALLOCATION_METADATA = {
  ...historicalMetadata,
  ahrefs: { kind: "non_billable" },
} as const satisfies Record<string, ProviderAllocationCatalog>;

export function providerAllocationMetadata(
  providerId: string | null | undefined,
): ProviderAllocationCatalog | null {
  return providerId === "ahrefs"
    ? PROVIDER_ALLOCATION_METADATA.ahrefs
    : historicalAllocation(providerId);
}
