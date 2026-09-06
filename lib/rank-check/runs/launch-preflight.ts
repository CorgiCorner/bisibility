import "server-only";

import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { Prisma } from "@/lib/generated/prisma/client";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import type { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { resolveEffectiveSerpDepth } from "@/lib/serp/markets";
import { ACTIVE_RUN_STATUSES } from "./contract";
import { LaunchRankCheckRunError, type LaunchRankCheckRunInput } from "./launch-types";
import type { RunSelectionKeyword } from "./selection";

type ProviderConnection = Awaited<ReturnType<typeof loadSerpProviderChain>>[number];
type ProviderAllocationConnection = Pick<ProviderConnection, "id" | "provider">;

type ProviderAllocationReservationInput = {
  connection: ProviderAllocationConnection;
  estimatedCostCents: number;
  estimatedUsageQuantity: number;
  now: Date;
  projectId: string;
};

export function estimateRunRows(
  rows: RunSelectionKeyword[],
  projectDepth: number | null | undefined,
  input: Pick<LaunchRankCheckRunInput, "depth">,
  connection: ProviderConnection,
) {
  const targets = rows.map((row) => {
    const depth = resolveEffectiveSerpDepth({
      projectDepth,
      requestedDepth: input.depth,
      scheduleDepth: row.schedule?.serpDepth,
    });
    return {
      cost: estimatedRankCheckCostCents(
        connection.provider,
        depth,
        connection.costPerCheckCents,
        connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
      ),
      depth,
      keywordId: row.id,
    };
  });
  const known = targets.flatMap(({ cost }) => (cost === null ? [] : [cost]));
  return {
    costCents: known.length > 0 ? known.reduce((sum, cost) => sum + cost, 0) : null,
    targets,
  };
}

export function estimatedRunUsageQuantity(estimate: ReturnType<typeof estimateRunRows>) {
  return estimate.targets.reduce((sum, target) => sum + pagesPerCheck(target.depth), 0);
}

export function providerAllocationReservation(connectionId: string | undefined, quantity: number) {
  return connectionId
    ? { providerAllocationQuantity: quantity, providerConnectionId: connectionId }
    : {};
}

function reservationQuantity(selectionSpec: unknown) {
  if (!selectionSpec || typeof selectionSpec !== "object" || Array.isArray(selectionSpec)) return 0;
  const value = (selectionSpec as { providerAllocationQuantity?: unknown })
    .providerAllocationQuantity;
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

async function activeAllocationReservations(
  client: Prisma.TransactionClient,
  input: { connectionId: string; projectId: string; unit: "cents" | "units" },
) {
  const runs = await client.rankCheckRun.findMany({
    select: { estimatedCostCents: true, selectionSpec: true },
    where: {
      projectId: input.projectId,
      OR: [
        { status: { in: [...ACTIVE_RUN_STATUSES] } },
        { items: { some: { status: { in: ["queued", "running"] } } }, status: "blocked" },
      ],
    },
  });
  return runs.reduce((total, run) => {
    const selectionSpec = run.selectionSpec as { providerConnectionId?: unknown };
    if (selectionSpec?.providerConnectionId !== input.connectionId) return total;
    return (
      total +
      (input.unit === "cents" ? run.estimatedCostCents : reservationQuantity(run.selectionSpec))
    );
  }, 0);
}

export async function reserveProviderAllocation(
  client: Prisma.TransactionClient,
  input: ProviderAllocationReservationInput,
) {
  if (!input.connection.id) throw new Error("Provider connection not found.");
  await client.$queryRaw(Prisma.sql`
    SELECT "id"
    FROM "provider_connections"
    WHERE "id" = ${input.connection.id} AND "projectId" = ${input.projectId}
    FOR UPDATE
  `);
  const allocation = await assertProviderAllocationAvailable(
    {
      catalog: PROVIDER_CATALOG,
      connectionId: input.connection.id,
      estimatedCostCents: input.estimatedCostCents,
      estimatedUsageQuantity: input.estimatedUsageQuantity,
      legacyBudgetCheck: async () => undefined,
      now: input.now,
      projectId: input.projectId,
      provider: input.connection.provider,
    },
    client,
  );
  if (allocation.mode !== "allocation" || allocation.remaining === null || !allocation.unit) return;
  const reserved = await activeAllocationReservations(client, {
    connectionId: input.connection.id,
    projectId: input.projectId,
    unit: allocation.unit,
  });
  const requested =
    allocation.unit === "cents" ? input.estimatedCostCents : input.estimatedUsageQuantity;
  if (reserved + requested > allocation.remaining) {
    throw new ProviderAllocationExhaustedError(input.connection.id);
  }
}

export async function assertLaunchBudget(
  input: LaunchRankCheckRunInput,
  project: { budgetCapCents: number; providerAllocationsInitializedAt: Date | null },
  connection: ProviderConnection,
  estimate: ReturnType<typeof estimateRunRows>,
  now: Date,
  client?: Prisma.TransactionClient,
) {
  try {
    if (!project.providerAllocationsInitializedAt) {
      await assertBudgetAvailable(input.project.id, now, {
        capCents: project.budgetCapCents,
        estimatedCostCents: estimate.costCents,
      });
      return;
    }
    if (!client) throw new Error("Provider allocation checks require a transaction.");
    await reserveProviderAllocation(client, {
      connection,
      estimatedCostCents: estimate.costCents ?? 0,
      estimatedUsageQuantity: estimatedRunUsageQuantity(estimate),
      now,
      projectId: input.project.id,
    });
  } catch (error) {
    if (isBudgetExhaustedError(error) || error instanceof ProviderAllocationExhaustedError) {
      throw new LaunchRankCheckRunError("budget_exhausted");
    }
    throw error;
  }
}
