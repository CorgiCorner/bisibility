import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import type { UsageEntry } from "./mapping";
import { persistQueuedHandoff } from "./queued-payload";
import { shadowForProject } from "./shadow-runtime";

/**
 * Hosted deployment metering. The private hosted ledger stays the only
 * authority; every step here is observation-only and failure-isolated, so a
 * broken shadow can never change a hosted provider call's outcome.
 */
export type HostedMeteringObservation = {
  /** The hosted execution's durable operation key; one meter operation per key ever. */
  operationKey: string;
  projectId: string;
  connectionId: string;
  provider: string;
  feature: string;
  source: ProviderRequestSource;
  credential?: ProviderCredential;
  correlationId?: string | null;
};

type HostedMeasurement = {
  costCents: number | null;
  usageQuantity: number | null;
  failed: boolean;
};

const UNKNOWN: HostedMeasurement = { costCents: null, usageQuantity: null, failed: false };

async function hostedEntry(
  observation: HostedMeteringObservation,
  measured: HostedMeasurement,
): Promise<UsageEntry | null> {
  const project = await prisma.project.findUnique({
    select: { ownerId: true },
    where: { id: observation.projectId },
  });
  if (!project) return null;
  const metadata = providerAllocationMetadata(observation.provider);
  return {
    id: observation.operationKey,
    ownerId: project.ownerId,
    projectId: observation.projectId,
    connectionId: observation.connectionId,
    provider: observation.provider,
    feature: observation.feature,
    source: observation.source,
    credentialSource: "hosted",
    correlationId: observation.correlationId ?? null,
    credentialKind: observation.credential?.kind ?? null,
    credentialId: observation.credential?.id ?? null,
    createdAt: new Date(),
    costCents: measured.costCents == null ? "0" : measured.costCents.toFixed(4),
    usageQuantity: measured.usageQuantity == null ? null : measured.usageQuantity.toFixed(6),
    measurementStatus:
      measured.costCents == null || measured.usageQuantity == null ? "unknown" : "recorded",
    cached: false,
    failed: measured.failed,
    unit: metadata?.kind === "billable" ? metadata.allocationUnit : "cents",
  };
}

export async function beginHostedExecution(
  observation: HostedMeteringObservation,
  estimate: { cents: string; units: string },
) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const entry = await hostedEntry(observation, UNKNOWN);
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId);
    await shadow?.begin(entry, estimate);
  } catch {
    console.warn("[metering] hosted admission failed", { operationId: observation.operationKey });
  }
}

export async function recordHostedExecution(
  observation: HostedMeteringObservation,
  measured: HostedMeasurement,
) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const entry = await hostedEntry(observation, measured);
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId);
    await shadow?.record(entry);
  } catch {
    console.warn("[metering] hosted receipt failed", { operationId: observation.operationKey });
  }
}

/**
 * A hosted queued batch is one meter operation keyed by the hosted execution's
 * operation key. The handoff persists on every task row so any later queued
 * metering context can resume or settle the batch operation.
 */
export async function beginHostedQueuedExecution(input: {
  batchId: string;
  projectId: string;
  connectionId: string;
  provider: string;
  source: ProviderRequestSource;
  credential?: ProviderCredential;
  tasks: { correlationId: string; estimate: { cents: string; units: string } }[];
}) {
  if (process.env.METERING_SHADOW !== "on") return;
  const operationKey = `queued-batch:${input.batchId}`;
  try {
    const cents = input.tasks
      .reduce((sum, task) => sum + Number(task.estimate.cents), 0)
      .toFixed(4);
    const units = String(input.tasks.reduce((sum, task) => sum + Number(task.estimate.units), 0));
    const entry = await hostedEntry(
      {
        operationKey,
        projectId: input.projectId,
        connectionId: input.connectionId,
        provider: input.provider,
        feature: "rank_check",
        source: input.source,
        credential: input.credential,
        correlationId: input.batchId,
      },
      UNKNOWN,
    );
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId);
    await shadow?.begin(entry, { cents, units }, 86400000);
    const handoff = shadow?.handoff(operationKey);
    for (const task of input.tasks) await persistQueuedHandoff(task.correlationId, handoff);
  } catch {
    console.warn("[metering] hosted queued admission failed", { operationId: operationKey });
  }
}
