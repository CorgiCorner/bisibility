import "server-only";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { estimateRankUsage } from "@/lib/cost-estimate/native-usage";
import { Prisma } from "@/lib/generated/prisma/client";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import { budgetDenialReason } from "@/lib/metering/budget-denial";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import {
  assertProviderAllocationAvailable,
  ProviderAllocationExhaustedError,
} from "@/lib/provider-usage/enforcement";
import { type ProviderRequestSurface, surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import {
  deploymentRankUsesNativeUnits,
  hostedRankCheckEstimatedCostCents,
  quoteDeploymentRankReservations,
} from "@/lib/providers/execution-extension";
import { OwnProviderKeyRequiredError } from "@/lib/providers/execution-extension-errors";
import { exactExecutionEstimate } from "@/lib/providers/execution-extension-estimate";
import { ownProviderKeysRequired } from "@/lib/providers/own-key-policy-extension";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { resolveEffectiveSerpDepth, type SerpDepth } from "@/lib/serp/constants";
import { LaunchRankCheckRunError, type LaunchRankCheckRunInput } from "./launch-types";
import { verifyPreviewToken } from "./preview-token";
import type { RunSelectionKeyword } from "./selection";

type ProviderConnection = Awaited<ReturnType<typeof loadSerpProviderChain>>[number];

export function verifyLaunchPreviewToken(
  input: LaunchRankCheckRunInput,
  costCents: number | null,
  selectionHash: string,
  now: Date,
  sourceHash?: string,
) {
  verifyPreviewToken(
    input.previewToken,
    {
      depth: input.depth ?? null,
      estimateCents: costCents ?? -1,
      projectId: input.project.id,
      providerId: input.providerId ?? null,
      selectionHash,
      sourceHash,
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
      domain: true,
      defaults: { select: { serpDepth: true, serpStopOnMatch: true } },
    },
    where: { id: projectId },
  });
  const connection = (await loadSerpProviderChain(projectId, providerId, tx))[0];
  if (!project || !connection) throw new LaunchRankCheckRunError("no_provider");
  const measurementPolicy = await readHostPolicySnapshot(tx, projectId);
  return { connection, project, measurementPolicy };
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

export async function estimateRunRows(
  rows: RunSelectionKeyword[],
  projectDepth: number | null | undefined,
  input: Pick<LaunchRankCheckRunInput, "depth">,
  connection: ProviderConnection,
  targetCosts?: readonly (number | null)[],
) {
  if (targetCosts && targetCosts.length !== rows.length)
    throw new Error("Rank quote count does not match targets");
  const override = connection.credentialSource === "hosted" ? null : connection.costPerCheckCents;
  const loadedRateContext = connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT;
  const rateContext =
    connection.credentialSource === "hosted"
      ? { ...loadedRateContext, manualAmountCents: null }
      : loadedRateContext;
  const hostedUnitCost =
    connection.credentialSource === "hosted" && connection.provider === "serpapi"
      ? await hostedRankCheckEstimatedCostCents(connection.provider, 10)
      : null;
  const targets = rows.map((row, index) => {
    const depth = resolveEffectiveSerpDepth({
      projectDepth,
      requestedDepth: input.depth,
      checkScheduleDepth: row.checkSchedule?.serpDepth,
      scheduleDepth: row.schedule?.serpDepth,
    });
    return {
      cost: targetCosts
        ? (targetCosts[index] ?? null)
        : connection.credentialSource === "hosted" && connection.provider === "serpapi"
          ? hostedUnitCost === null
            ? null
            : hostedUnitCost * pagesPerCheck(depth)
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
      targetCosts,
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
  const nativeUnits = await deploymentRankUsesNativeUnits(input.connection.provider);
  const quote = await quoteDeploymentRankReservations(tx, {
    connectionId: input.connection.id,
    projectId: input.projectId,
    source: input.source,
    items: input.targets.map((target) => ({
      keywordId: target.keywordId,
      estimatedCostCents: exactExecutionEstimate(target.cost, 4),
      // Depth changes estimated cost; one rank task is one native operation.
      estimatedQuantity: nativeUnits ? String(pagesPerCheck(target.depth)) : "1.000000",
    })),
  });
  if (!quote) throw new Error("Hosted run reservation unavailable.");
  return { providerConnectionId: input.connection.id, rankReservationPrices: quote.prices };
}

export async function quoteRankRunReservationForLaunch(
  ...args: Parameters<typeof quoteRankRunReservation>
) {
  const [tx, input] = args;
  if (input.connection.credentialSource === "hosted") {
    // Refuse a tester's run at launch; each execution is refused again at admission.
    const project = await tx.project.findUnique({
      select: { ownerId: true },
      where: { id: input.projectId },
    });
    if (project && (await ownProviderKeysRequired(project.ownerId, tx)))
      throw new OwnProviderKeyRequiredError({
        capability: "rank_check",
        projectId: input.projectId,
        provider: input.connection.provider,
      });
  }
  try {
    return await quoteRankRunReservation(...args);
  } catch (error) {
    if (isBudgetExhaustedError(error) || error instanceof ProviderAllocationExhaustedError) {
      throw new LaunchRankCheckRunError("budget_exhausted", undefined, budgetDenialReason(error));
    }
    throw error;
  }
}

export function estimatedRunUsageQuantity(estimate: Awaited<ReturnType<typeof estimateRunRows>>) {
  return estimate.targets.reduce((sum, target) => sum + pagesPerCheck(target.depth), 0);
}

export function runUsageEstimate(
  connection: ProviderConnection,
  estimate: Awaited<ReturnType<typeof estimateRunRows>>,
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
  await assertProviderAllocationAvailable(
    {
      catalog: PROVIDER_CATALOG,
      connectionId: input.connection.id,
      estimatedCostCents: input.estimatedCostCents,
      estimatedUsageQuantity: input.estimatedUsageQuantity,

      now: input.now,
      projectId: input.projectId,
      provider: input.connection.provider,
      surface: input.surface,
    },
    client,
  );
}

export async function assertLaunchBudget(
  input: LaunchRankCheckRunInput,
  connection: ProviderConnection,
  estimate: Awaited<ReturnType<typeof estimateRunRows>>,
  now: Date,
  client?: Prisma.TransactionClient,
) {
  try {
    await assertBudgetAvailable(input.project.id, now, {
      client,
      estimatedCostCents: estimate.costCents,
    });
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
      throw new LaunchRankCheckRunError("budget_exhausted", undefined, budgetDenialReason(error));
    }
    throw error;
  }
}
