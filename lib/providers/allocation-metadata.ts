import type { ProviderAllocationCatalog } from "./allocation-catalog";

export const PROVIDER_ALLOCATION_METADATA = {
  dataforseo: { allocationUnit: "cents", billing: "metered", kind: "billable", quotaReset: "none" },
  serpapi: {
    allocationUnit: "units",
    billing: "quota",
    kind: "billable",
    quotaReset: "billing_cycle",
  },
  gsc: { kind: "non_billable" },
  ga4: { kind: "non_billable" },
  plausible: { kind: "non_billable" },
  "local-sequence": { kind: "non_billable" },
} as const satisfies Record<string, ProviderAllocationCatalog>;

export function providerAllocationMetadata(
  providerId: string | null | undefined,
): ProviderAllocationCatalog | null {
  return providerId && Object.hasOwn(PROVIDER_ALLOCATION_METADATA, providerId)
    ? PROVIDER_ALLOCATION_METADATA[providerId as keyof typeof PROVIDER_ALLOCATION_METADATA]
    : null;
}
