export const PROVIDER_BILLING_MODELS = ["metered", "quota"] as const;
export type ProviderBillingModel = (typeof PROVIDER_BILLING_MODELS)[number];

export const PROVIDER_ALLOCATION_UNITS = ["cents", "units"] as const;
export type ProviderAllocationUnit = (typeof PROVIDER_ALLOCATION_UNITS)[number];

export const PROVIDER_QUOTA_RESETS = ["billing_cycle", "calendar_month", "none"] as const;
export type ProviderQuotaReset = (typeof PROVIDER_QUOTA_RESETS)[number];

export type ProviderAllocationCatalog =
  | { kind: "non_billable" }
  | {
      allocationUnit: "cents";
      billing: "metered";
      kind: "billable";
      quotaReset: "none";
    }
  | {
      allocationUnit: "units";
      billing: "quota";
      kind: "billable";
      quotaReset: ProviderQuotaReset;
    };
