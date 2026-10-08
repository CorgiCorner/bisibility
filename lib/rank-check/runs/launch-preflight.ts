import "server-only";

import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { estimateRankUsage } from "@/lib/cost-estimate/native-usage";
import { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import { type ProviderRequestSurface, surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import {
  hostedRankCheckEstimatedCostCents,
  quoteDeploymentRankReservations,
} from "@/lib/providers/execution-extension";
import { exactExecutionEstimate } from "@/lib/providers/execution-extension-estimate";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { resolveEffectiveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import { ACTIVE_RUN_STATUSES } from "./contract";
import { LaunchRankCheckRunError, type LaunchRankCheckRunInput } from "./launch-types";
import { verifyPreviewToken } from "./preview-token";
import type { RunSelectionKeyword } from "./selection";

type ProviderConnection = Awaited<ReturnType<typeof loadSerpProviderChain>>[number];

export function verifyLaunchPreviewToken(
  input: LaunchRankCheckRunInput,
  costCents: number | null,
  selectionHash: string,
  now: Date,
) {
  verifyPreviewToken(
    input.previewToken,
    {
      depth: input.depth ?? null,
      estimateCents: costCents ?? -1,
      projectId: input.project.id,
      providerId: input.providerId ?? null,
      selectionHash,
      trigger: input.trigger,
    },
    now,
  );
}

/** Serialize run admission with source changes before choosing its economics. */
export async function lockLaunchSourceSnapshot(
  tx: Prisma.TransactionClient,
  projectId: string,
  providerId?: string,
) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rank-check-budget:${projectId}`}))`;
  await lockProjectForProviderMutation(tx, projectId);
  const project = await tx.project.findUnique({
    select: {
      budgetCapCents: true,
      defaults: { select: { serpDepth: true } },
      providerAllocationsInitializedAt: true,
    },
    where: { id: projectId },
  });
  const connection = (await loadSerpProviderChain(projectId, providerId, tx))[0];
  if (!project || !connection) throw new LaunchRankCheckRunError("no_provider");
  return { connection, project };
}
type ProviderAllocationConnection = Pick<ProviderConnection, "id" | "provider">;

type ProviderAllocationReservationInput = {
  connection: ProviderAllocationConnection;
  estimatedCostCents: number;
  estimatedUsageQuantity: number;
  now: Date;
  projectId: string;
  surface: ProviderRequestSurface;
};

export function estimateRunRows(
  rows: RunSelectionKeyword[],
  projectDepth: number | null | undefined,
  input: Pick<LaunchRankCheckRunInput, "depth">,
  connection: ProviderConnection,
) {
  const override = connection.credentialSource === "hosted" ? null : connection.costPerCheckCents;
  const loadedRateContext = connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT;
  const rateContext =
    connection.credentialSource === "hosted"
      ? { ...loadedRateContext, manualAmountCents: null }
      : loadedRateContext;
  const targets = rows.map((row) => {
    const depth = resolveEffectiveSerpDepth({
      projectDepth,
      requestedDepth: input.depth,
      checkScheduleDepth: row.checkSchedule?.serpDepth,
      scheduleDepth: row.schedule?.serpDepth,
    });
    const hostedEstimate =
      connection.credentialSource === "hosted"
        ? hostedRankCheckEstimatedCostCents(connection.provider, depth)
        : null;
    return {
      cost:
        connection.credentialSource === "hosted" && connection.provider === "serpapi"
          ? hostedEstimate
          : estimatedRankCheckCostCents(connection.provider, depth, override, rateContext),
      depth,
      keywordId: row.id,
    };
  });
  const known = targets.flatMap(({ cost }) => (cost === null ? [] : [cost]));
  return {
    native: estimateRankUsage(
      targets.map(({ depth }) => depth),
      {
        providerId: connection.provider,
        overrideCents: override == null ? null : Number(override),
        rateContext,
      },
    ),
    costCents: known.length > 0 ? known.reduce((sum, cost) => sum + cost, 0) : null,
    targets,
  };
}

export async function quoteRankRunReservation(
  tx: Prisma.TransactionClient,
  input: {
    connection: ProviderConnection;
    projectId: string;
    source: ProviderRequestSource;
    targets: readonly { keywordId: string; cost: number | null; depth: SerpDepth }[];
  },
) {
  if (!input.connection.id || input.connection.credentialSource !== "hosted") return {};
  const quote = await quoteDeploymentRankReservations(tx, {
    connectionId: input.connection.id,
    projectId: input.projectId,
    source: input.source,
    items: input.targets.map((target) => ({
      keywordId: target.keywordId,
      estimatedCostCents: exactExecutionEstimate(target.cost, 4),
      // Depth changes estimated cost; one rank task is one native operation.
      estimatedQuantity: "1.000000",
    })),
  });
  if (!quote) throw new Error("Hosted run reservation unavailable.");
  return { providerConnectionId: input.connection.id, rankReservationPrices: quote.prices };
}

export async function quoteRankRunReservationForLaunch(
  ...args: Parameters<typeof quoteRankRunReservation>
) {
  try {
    return await quoteRankRunReservation(...args);
  } catch (error) {
    if (isBudgetExhaustedError(error) || error instanceof ProviderAllocationExhaustedError) {
      throw new LaunchRankCheckRunError("budget_exhausted");
    }
    throw error;
  }
}

export function estimatedRunUsageQuantity(estimate: ReturnType<typeof estimateRunRows>) {
  return estimate.targets.reduce((sum, target) => sum + pagesPerCheck(target.depth), 0);
}

export function runUsageEstimate(
  connection: ProviderConnection,
  estimate: ReturnType<typeof estimateRunRows>,
) {
  return {
    providerAtLaunch: connection.provider,
    nativeEstimate: estimate.native,
    ...(estimate.native.unit === "units"
      ? { estimatedOperations: estimatedRunUsageQuantity(estimate) }
      : {}),
  };
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
  input: {
    connectionId: string;
    projectId: string;
    surface: ProviderRequestSurface;
    unit: "cents" | "units";
  },
) {
  const runs = await client.rankCheckRun.findMany({
    select: { estimatedCostCents: true, selectionSpec: true, source: true },
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
    // Reservations bind to the surface that launched the run; a null source is a
    // legacy app-surface row, so it counts against app launches only.
    if (surfaceOf(run.source as ProviderRequestSource | null) !== input.surface) return total;
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
      surface: input.surface,
    },
    client,
  );
  if (allocation.mode !== "allocation" || allocation.remaining === null || !allocation.unit) return;
  const reserved = await activeAllocationReservations(client, {
    connectionId: input.connection.id,
    projectId: input.projectId,
    surface: input.surface,
    unit: allocation.unit,
  });
  const requested =
    allocation.unit === "cents" ? input.estimatedCostCents : input.estimatedUsageQuantity;
  if (reserved + requested > allocation.remaining) {
    throw new ProviderAllocationExhaustedError(input.connection.id, input.surface);
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
        client,
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
      surface: surfaceOf(input.origin.source),
    });
  } catch (error) {
    if (isBudgetExhaustedError(error) || error instanceof ProviderAllocationExhaustedError) {
      throw new LaunchRankCheckRunError("budget_exhausted");
    }
    throw error;
  }
}
