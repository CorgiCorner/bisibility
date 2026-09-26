import "server-only";

import type { Prisma } from "@/lib/generated/prisma/client";
import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import {
  PROVIDER_CREDENTIAL_KINDS,
  type ProviderCredential,
  type ProviderRequestSurface,
  SOURCES_BY_SURFACE,
  surfaceOf,
} from "@/lib/provider-usage/surface";
import type { ProviderRequestSource, ProviderRequestTrigger } from "@/lib/provider-usage/tag";
import type { SerpDepth } from "@/lib/serp/constants";
import { assertQueuedRankCheckBatchAllocation } from "./allocation-enforcement";
import { assertBudgetAvailable, isBudgetExhaustedError } from "./budget";
import type { DataForSeoQueuePriority } from "./queued-config";

export type QueuedBatchAttribution = Readonly<{
  credential?: ProviderCredential;
  source: ProviderRequestSource;
  trigger: ProviderRequestTrigger;
}>;

export type QueuedBatchOriginColumns = {
  credentialId: string | null;
  credentialKind: string | null;
  source: string;
  trigger: string;
};

/**
 * A stored source the recorder may attribute a queued batch to. The legacy source of historical
 * rows is deliberately absent from the allowlist, so it maps to the app surface here; unknown
 * values fall back to `app` the same way.
 */
function attributableSource(value: string | null): ProviderRequestSource {
  if (
    value !== null &&
    (SOURCES_BY_SURFACE.programmatic.includes(value as ProviderRequestSource) || value === "app")
  ) {
    return value as ProviderRequestSource;
  }
  return "app";
}

function batchCredential(
  credentialKind: string | null,
  credentialId: string | null,
): ProviderCredential | undefined {
  if (credentialKind === null || credentialId === null) return undefined;
  if (!PROVIDER_CREDENTIAL_KINDS.includes(credentialKind as never)) return undefined;
  return { id: credentialId, kind: credentialKind as ProviderCredential["kind"] };
}

/**
 * The origin columns a prepared batch row stores: the run's own origin when the batch belongs to a
 * run, and the app surface with the scheduled trigger when it does not (the dispatcher case).
 */
export async function queuedBatchOrigin(
  tx: Pick<Prisma.TransactionClient, "rankCheckRun">,
  runId: string | undefined,
): Promise<QueuedBatchOriginColumns> {
  const run = runId
    ? await tx.rankCheckRun.findUnique({
        select: { credentialId: true, credentialKind: true, source: true, trigger: true },
        where: { id: runId },
      })
    : null;
  if (!run) {
    return { credentialId: null, credentialKind: null, source: "app", trigger: "scheduled" };
  }
  return {
    credentialId: run.credentialId,
    credentialKind: run.credentialKind,
    source: attributableSource(run.source),
    trigger: run.trigger === "scheduled" ? "scheduled" : "manual",
  };
}

/** The provider attribution a submitted batch's tasks and persisted results run under. */
export function queuedBatchAttribution(batch: {
  credentialId: string | null;
  credentialKind: string | null;
  source: string | null;
  trigger: string | null;
}): QueuedBatchAttribution {
  const credential = batchCredential(batch.credentialKind, batch.credentialId);
  return {
    ...(credential ? { credential } : {}),
    source: attributableSource(batch.source),
    trigger: batch.trigger === "manual" ? "manual" : "scheduled",
  };
}

/**
 * The budget deferral a prepared batch earns, or null when its budget admits it. A project still
 * on the legacy cap is gated by that cap; an initialized project is gated by the connection's
 * allocation on the batch's own surface, so dispatcher batches (app) are never deferred by the
 * programmatic cap while API-launched batches are.
 */
export async function queuedBatchBudgetDeferral(
  batch: {
    connectionId: string | undefined;
    estimatedCostCents: number;
    project: { budgetCapCents: number; providerAllocationsInitializedAt: Date | null };
    source: string;
    tasks: readonly { depth: SerpDepth }[];
  },
  call: { now: Date; priority: DataForSeoQueuePriority; projectId: string },
  tx: Prisma.TransactionClient,
): Promise<string | null> {
  if (batch.project.providerAllocationsInitializedAt === null) {
    try {
      await assertBudgetAvailable(call.projectId, call.now, {
        capCents: batch.project.budgetCapCents,
        client: tx,
        estimatedCostCents: batch.estimatedCostCents,
      });
    } catch (error) {
      if (!isBudgetExhaustedError(error)) throw error;
      return "Rank check monthly budget reached before queued batch submission.";
    }
    return null;
  }
  if (!batch.connectionId || surfaceOf(batch.source as ProviderRequestSource) !== "programmatic") {
    return null;
  }
  try {
    await assertQueuedRankCheckBatchAllocation(
      {
        connection: { id: batch.connectionId },
        priority: call.priority,
        projectId: call.projectId,
        surface: "programmatic" satisfies ProviderRequestSurface,
        tasks: batch.tasks,
      },
      tx,
    );
  } catch (error) {
    if (!(error instanceof ProviderAllocationExhaustedError)) throw error;
    return "budget_exhausted:programmatic";
  }
  return null;
}
