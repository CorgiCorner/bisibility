import type { ProviderAllocationUnit } from "@/lib/providers/allocation-catalog";

export const MAX_ALLOCATION_AMOUNT = 2_147_483_647;

export type ProviderAllocation = {
  amountPerMonth: number;
  unit: ProviderAllocationUnit;
};

/**
 * The allocation pair and programmatic amount are the own-keys budget, in the
 * provider catalog unit. The credits amounts are a separate budget, always in
 * cents of charged credits price.
 */
export type StoredProviderAllocation = {
  allocationAmountPerMonth: number | null;
  allocationUnit: ProviderAllocationUnit | null;
  creditsAllocationAmountPerMonth?: number | null;
  creditsProgrammaticAllocationAmountPerMonth?: number | null;
  programmaticAllocationAmountPerMonth?: number | null;
};

export type SurfaceAllocations = {
  app: ProviderAllocation | null;
  programmatic: ProviderAllocation | null;
};

/** Own-keys budget at the top level, credits budget (always cents) under `credits`. */
export type ProviderConnectionAllocations = SurfaceAllocations & {
  credits: SurfaceAllocations;
};

/** A field left undefined means "keep the stored budget"; null clears it. */
export type ProviderConnectionAllocationUpdate = {
  app?: ProviderAllocation | null;
  credits?: { app?: ProviderAllocation | null; programmatic?: ProviderAllocation | null };
  programmatic?: ProviderAllocation | null;
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
  credits: SurfaceAllocations;
  internalConnectionId: string;
  programmaticAllocation: ProviderAllocation | null;
  source: "connection" | "legacy_project" | "none";
};
