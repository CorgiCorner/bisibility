import "server-only";

import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import type { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import {
  providerAllocationReservation,
  reserveProviderAllocation,
} from "@/lib/rank-check/runs/launch-preflight";

type ProviderConnection = Awaited<ReturnType<typeof loadSerpProviderChain>>[number];

function selectionSpecWithReservation(selectionSpec: unknown, reservation: object) {
  if (typeof selectionSpec !== "object" || selectionSpec === null || Array.isArray(selectionSpec)) {
    return reservation;
  }
  return { ...selectionSpec, ...reservation };
}

export async function reserveScheduledRunAllocation(
  client: Parameters<typeof reserveProviderAllocation>[0],
  input: {
    connection: ProviderConnection | null;
    estimatedCostCents: number;
    initializedAllocations: boolean;
    now: Date;
    projectId: string;
    selectionSpec: unknown;
    usageQuantity: number;
  },
) {
  try {
    if (input.initializedAllocations && input.connection) {
      await reserveProviderAllocation(client, {
        connection: input.connection,
        estimatedCostCents: input.estimatedCostCents,
        estimatedUsageQuantity: input.usageQuantity,
        now: input.now,
        projectId: input.projectId,
      });
    }
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError) return null;
    throw error;
  }
  const reservation =
    input.initializedAllocations && input.connection?.id
      ? providerAllocationReservation(input.connection.id, input.usageQuantity)
      : {};
  return selectionSpecWithReservation(input.selectionSpec, reservation);
}
