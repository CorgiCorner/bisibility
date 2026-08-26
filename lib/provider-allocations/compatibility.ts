import type { ProviderCatalogEntry } from "@/lib/providers/types";
import type {
  AllocationConnection,
  AllocationProject,
  EffectiveProviderAllocation,
  ProviderAllocation,
} from "./types";
import { catalogEntry, validateAllocationAmount, validateProviderAllocation } from "./validation";

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
    if (allocation)
      return { allocation, internalConnectionId: connection.id, source: "connection" };
    if (!input.project.providerAllocationsInitializedAt && connection.id === primary?.id) {
      return {
        allocation: { amountPerMonth: input.project.budgetCapCents, unit: "cents" },
        internalConnectionId: connection.id,
        source: "legacy_project",
      };
    }
    return { allocation: null, internalConnectionId: connection.id, source: "none" };
  });
}
