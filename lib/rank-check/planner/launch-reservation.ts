import "server-only";

import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import { isBudgetExhaustedError } from "@/lib/rank-check/budget";
import type { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import {
  providerAllocationReservation,
  quoteRankRunReservation,
  reserveProviderAllocation,
} from "@/lib/rank-check/runs/launch-preflight";
import type { SerpDepth } from "@/lib/serp/constants";

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
    items?: readonly { keywordId: string; cost: number | null; depth: SerpDepth }[];
  },
) {
  try {
    if (
      input.initializedAllocations &&
      input.connection?.credentialSource !== "hosted" &&
      input.connection
    ) {
      await reserveProviderAllocation(client, {
        connection: input.connection,
        estimatedCostCents: input.estimatedCostCents,
        estimatedUsageQuantity: input.usageQuantity,
        now: input.now,
        projectId: input.projectId,
        surface: "app",
      });
    }
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError || isBudgetExhaustedError(error))
      return null;
    throw error;
  }
  const reservation =
    input.initializedAllocations && input.connection?.id
      ? providerAllocationReservation(input.connection.id, input.usageQuantity)
      : {};
  let rankReservation = {};
  try {
    rankReservation =
      input.connection && input.items
        ? await quoteRankRunReservation(client, {
            connection: input.connection,
            projectId: input.projectId,
            source: "app",
            targets: input.items,
          })
        : {};
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError || isBudgetExhaustedError(error))
      return null;
    throw error;
  }
  return selectionSpecWithReservation(input.selectionSpec, { ...reservation, ...rankReservation });
}
