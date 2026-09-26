import type { ProviderCatalogEntry } from "@/lib/providers/types";
import type {
  AllocationConnection,
  AllocationProject,
  EffectiveProviderAllocation,
  ProviderAllocation,
  SurfaceAllocations,
} from "./types";
import {
  catalogEntry,
  validateAllocationAmount,
  validateCreditsAllocation,
  validateProviderAllocation,
} from "./validation";

export function isPrimaryEligibleMetered(
  connection: AllocationConnection,
  catalog: readonly ProviderCatalogEntry[],
) {
  const entry = catalogEntry(catalog, connection.provider);
  return (
    connection.enabled &&
    connection.status === "connected" &&
    entry.allocation.kind === "billable" &&
    entry.allocation.billing === "metered"
  );
}

export function primaryEligibleMeteredConnection(
  connections: readonly AllocationConnection[],
  catalog: readonly ProviderCatalogEntry[],
) {
  return [...connections]
    .filter((connection) => isPrimaryEligibleMetered(connection, catalog))
    .sort(
      (left, right) =>
        left.priority - right.priority ||
        left.provider.localeCompare(right.provider) ||
        left.id.localeCompare(right.id),
    )[0];
}

function storedAllocation(
  connection: AllocationConnection,
  catalog: readonly ProviderCatalogEntry[],
): ProviderAllocation | null {
  const { allocationAmountPerMonth: amountPerMonth, allocationUnit: unit } = connection;
  if ((unit === null) !== (amountPerMonth === null)) {
    throw new TypeError("Stored provider allocation fields must be paired.");
  }
  const allocation = unit && amountPerMonth ? { amountPerMonth, unit } : null;
  validateProviderAllocation(catalog, connection.provider, allocation);
  return allocation;
}

function storedProgrammaticAllocation(
  connection: AllocationConnection,
  catalog: readonly ProviderCatalogEntry[],
): ProviderAllocation | null {
  const amountPerMonth = connection.programmaticAllocationAmountPerMonth ?? null;
  if (amountPerMonth === null) return null;
  const entry = catalogEntry(catalog, connection.provider);
  if (entry.allocation.kind !== "billable") return null;
  // The unit column is shared with the app cap; the storage pair constraint keeps it null
  // while the app cap is unset, so a programmatic-only cap falls back to the catalog unit.
  const unit = connection.allocationUnit ?? entry.allocation.allocationUnit;
  const allocation = { amountPerMonth, unit };
  validateProviderAllocation(catalog, connection.provider, allocation);
  return allocation;
}

function storedCreditsAllocations(
  connection: AllocationConnection,
  catalog: readonly ProviderCatalogEntry[],
): SurfaceAllocations {
  const allocation = (amountPerMonth: number | null | undefined) => {
    if (amountPerMonth == null) return null;
    const value = { amountPerMonth, unit: "cents" as const };
    validateCreditsAllocation(catalog, connection.provider, value);
    return value;
  };
  return {
    app: allocation(connection.creditsAllocationAmountPerMonth),
    programmatic: allocation(connection.creditsProgrammaticAllocationAmountPerMonth),
  };
}

export function resolveEffectiveAllocations(input: {
  catalog: readonly ProviderCatalogEntry[];
  connections: readonly AllocationConnection[];
  project: AllocationProject;
}): EffectiveProviderAllocation[] {
  const primary = primaryEligibleMeteredConnection(input.connections, input.catalog);
  if (!input.project.providerAllocationsInitializedAt && primary) {
    validateAllocationAmount(input.project.budgetCapCents);
  }
  return input.connections.map((connection) => {
    const allocation = storedAllocation(connection, input.catalog);
    const programmaticAllocation = storedProgrammaticAllocation(connection, input.catalog);
    const credits = storedCreditsAllocations(connection, input.catalog);
    if (allocation) {
      return {
        allocation,
        credits,
        internalConnectionId: connection.id,
        programmaticAllocation,
        source: "connection",
      };
    }
    if (!input.project.providerAllocationsInitializedAt && connection.id === primary?.id) {
      return {
        allocation: { amountPerMonth: input.project.budgetCapCents, unit: "cents" },
        credits,
        internalConnectionId: connection.id,
        // Legacy mode mirrors the project cap into both surfaces of the primary (plan P4).
        programmaticAllocation: programmaticAllocation ?? {
          amountPerMonth: input.project.budgetCapCents,
          unit: "cents",
        },
        source: "legacy_project",
      };
    }
    return {
      allocation: null,
      credits,
      internalConnectionId: connection.id,
      programmaticAllocation,
      source: "none",
    };
  });
}
