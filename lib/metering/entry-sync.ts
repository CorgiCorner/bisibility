import "server-only";
import { prisma } from "@/lib/db/prisma";
import { PROVIDER_REQUEST_SOURCES } from "@/lib/provider-usage/tag";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import type { UsageEntry } from "./mapping";
import { persistQueuedHandoff } from "./queued-payload";
import { shadowForProject } from "./shadow-runtime";

export async function loadUsageEntry(id: string): Promise<UsageEntry | null> {
  const row = await prisma.providerCostEntry.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      connectionId: true,
      provider: true,
      feature: true,
      source: true,
      correlationId: true,
      credentialId: true,
      credentialKind: true,
      credentialSource: true,
      createdAt: true,
      costCents: true,
      usageQuantity: true,
      measurementStatus: true,
      cached: true,
      failed: true,
      providerRequestId: true,
      project: { select: { ownerId: true } },
    },
  });
  if (!row?.provider || (row.credentialSource !== "own" && row.credentialSource !== "hosted")) {
    return null;
  }
  const metadata = providerAllocationMetadata(row.provider);
  return {
    ...row,
    provider: row.provider,
    ownerId: row.project.ownerId,
    source: PROVIDER_REQUEST_SOURCES.find((source) => source === row.source) ?? "app",
    costCents: row.costCents.toFixed(4),
    usageQuantity: row.usageQuantity?.toFixed(6) ?? null,
    unit: metadata?.kind === "billable" ? metadata.allocationUnit : "cents",
  };
}
export async function syncUsageEntry(id: string) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const entry = await loadUsageEntry(id);
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId);
    await shadow?.record(entry);
  } catch {
    console.warn("[metering] receipt synchronization failed", { operationId: id });
  }
}
export async function beginUsageEntry(
  id: string,
  estimate: { cents: string; units: string },
  queued = false,
) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    const entry = await loadUsageEntry(id);
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId);
    await shadow?.begin(entry, estimate, queued ? 86400000 : 3600000);
    if (queued && entry.correlationId)
      await persistQueuedHandoff(entry.correlationId, shadow?.handoff(id));
  } catch {
    console.warn("[metering] receipt admission failed", { operationId: id });
  }
}
