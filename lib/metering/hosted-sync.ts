import "server-only";
import type { ProviderCredential } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import {
  readDeploymentMeteringEvidence,
  readDeploymentMeteringExecutionOwner,
  readDeploymentMeteringSnapshot,
} from "@/lib/providers/execution-extension";
import type { HostedMeteringEvidence, HostedMeteringSnapshot } from "./hosted-snapshot";
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
  snapshot?: HostedMeteringSnapshot;
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
  if ((await readDeploymentMeteringExecutionOwner(observation.operationKey)) === "meter")
    return null;
  const snapshot =
    observation.snapshot ?? (await readDeploymentMeteringSnapshot(observation.operationKey));
  if (!snapshot?.namespace) return null;
  return entryFromHostedEvidence({
    snapshot,
    costCents: measured.costCents?.toFixed(4) ?? null,
    usageQuantity: measured.usageQuantity?.toFixed(6) ?? null,
    customerCents: null,
    failed: measured.failed,
    cached: false,
  });
}

/** No current project or credential lookup may rewrite a retained execution's identity. */
export function entryFromHostedEvidence({
  snapshot,
  ...measured
}: HostedMeteringEvidence): UsageEntry {
  if (
    !snapshot.platformPoolId ||
    !snapshot.providerCredentialVersion ||
    !snapshot.providerCostOwner
  )
    throw new Error("Hosted provider funding identity is not configured.");
  const metadata = providerAllocationMetadata(snapshot.provider);
  return {
    namespace: snapshot.namespace,
    id: snapshot.operationKey,
    ownerId: snapshot.ownerId,
    projectId: snapshot.projectId,
    connectionId: snapshot.connectionId,
    provider: snapshot.provider,
    feature: snapshot.feature,
    source: snapshot.source,
    credentialSource: "hosted",
    correlationId: snapshot.correlationId,
    credentialKind: snapshot.credentialKind,
    credentialId: snapshot.credentialId,
    createdAt: new Date(snapshot.occurredAt),
    costCents: measured.costCents ?? "0",
    usageQuantity: measured.usageQuantity,
    costMeasurement: measured.costCents === null ? "unknown" : "recorded",
    quantityMeasurement: measured.usageQuantity === null ? "unknown" : "recorded",
    customerCents: measured.customerCents,
    estimatedPriceCents: snapshot.estimatedPriceCents,
    creditAccountRef: snapshot.walletId,
    customerPriceVersion: snapshot.customerPriceVersion,
    platformPoolId: snapshot.platformPoolId,
    providerCredentialVersion: snapshot.providerCredentialVersion,
    providerCostOwner: snapshot.providerCostOwner,
    measurementStatus:
      measured.costCents == null || measured.usageQuantity == null ? "unknown" : "recorded",
    cached: measured.cached,
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
    const shadow = await shadowForProject(entry.projectId, entry.namespace);
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
    if ((await readDeploymentMeteringExecutionOwner(observation.operationKey)) === "meter") return;
    const evidence = await readDeploymentMeteringEvidence(observation.operationKey);
    if (evidence && !evidence.snapshot.namespace) return;
    const entry = evidence
      ? entryFromHostedEvidence(evidence)
      : await hostedEntry(observation, measured);
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId, entry.namespace);
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
    if ((await readDeploymentMeteringExecutionOwner(operationKey)) === "meter") return;
    const snapshot = await readDeploymentMeteringSnapshot(operationKey);
    if (!snapshot) return;
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
        snapshot,
      },
      UNKNOWN,
    );
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId, entry.namespace);
    await shadow?.begin(
      entry,
      {
        cents: snapshot.estimatedCostCents,
        units: snapshot.estimatedQuantity,
      },
      86400000,
    );
    const handoff = shadow?.handoff(operationKey);
    for (const task of input.tasks) await persistQueuedHandoff(task.correlationId, handoff);
  } catch {
    console.warn("[metering] hosted queued admission failed", { operationId: operationKey });
  }
}
