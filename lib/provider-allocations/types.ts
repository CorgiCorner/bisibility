import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";

export const MAX_ALLOCATION_AMOUNT = 2_147_483_647;

export type ProviderAllocation = {
  amountPerMonth: number;
  unit: ProviderAllocationUnit;
};

export type StoredProviderAllocation = {
  allocationAmountPerMonth: number | null;
  allocationUnit: ProviderAllocationUnit | null;
};

export type AllocationConnection = StoredProviderAllocation & {
  enabled: boolean;
  id: string;
  priority: number;
  provider: string;
  status: string;
};

export type AllocationProject = {
  budgetCapCents: number;
  providerAllocationsInitializedAt: Date | null;
};

export type EffectiveProviderAllocation = {
  allocation: ProviderAllocation | null;
  internalConnectionId: string;
  source: "connection" | "legacy_project" | "none";
};
