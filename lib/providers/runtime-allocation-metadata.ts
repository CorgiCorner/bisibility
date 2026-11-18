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
  pagespeed: { kind: "non_billable" },
  openai: { allocationUnit: "cents", billing: "metered", kind: "billable", quotaReset: "none" },
  anthropic: { allocationUnit: "cents", billing: "metered", kind: "billable", quotaReset: "none" },
  openrouter: { allocationUnit: "cents", billing: "metered", kind: "billable", quotaReset: "none" },
  vercel_ai_gateway: {
    allocationUnit: "cents",
    billing: "metered",
    kind: "billable",
    quotaReset: "none",
  },
} as const satisfies Record<string, ProviderAllocationCatalog>;

export function providerAllocationMetadata(
  providerId: string | null | undefined,
): ProviderAllocationCatalog | null {
  return providerId && Object.hasOwn(PROVIDER_ALLOCATION_METADATA, providerId)
    ? PROVIDER_ALLOCATION_METADATA[providerId as keyof typeof PROVIDER_ALLOCATION_METADATA]
    : historicalAllocation(providerId);
}
