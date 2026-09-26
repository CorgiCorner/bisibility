import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { PROVIDER_REQUEST_SOURCES } from "@/lib/provider-usage/tag";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import { loadUsageEntry, syncUsageEntry } from "./entry-sync";
import type { UsageEntry } from "./mapping";
import type { ShadowHandoff } from "./shadow-engine";
import { shadowForProject } from "./shadow-runtime";

export { persistQueuedHandoff } from "./queued-payload";

function payload(value: unknown): ShadowHandoff | undefined {
  if (!value || typeof value !== "object") return;
  const fields = value as Record<string, unknown>;
  if (
    typeof fields.operationId !== "string" ||
    typeof fields.leaseId !== "string" ||
    typeof fields.expiresAt !== "string" ||
    (fields.kind !== "lease" && fields.kind !== "recovery")
  )
    return;
  return {
    operationId: fields.operationId,
    leaseId: fields.leaseId,
    expiresAt: fields.expiresAt,
    kind: fields.kind,
  };
}
async function safely(taskId: string, run: () => Promise<void>) {
  if (process.env.METERING_SHADOW !== "on") return;
  try {
    await run();
  } catch (error) {
    console.warn("[metering] queued context unavailable", {
      taskId,
      reason:
        error instanceof Error && error.message === "ambiguous legacy receipt"
          ? "ambiguous legacy receipt"
          : "storage unavailable",
    });
  }
}
type QueuedTaskContext = {
  batch: { id: string; projectId: string; connectionId: string | null };
  hosted: boolean;
  handoff: ShadowHandoff | undefined;
  operationId?: string;
};
async function load(taskId: string): Promise<QueuedTaskContext | null> {
  const task = await prisma.queuedRankCheckTask.findUnique({
    where: { id: taskId },
    select: {
      meteringContext: true,
      batch: { select: { id: true, projectId: true, connectionId: true } },
    },
  });
  if (!task) return null;
  const handoff = payload(task.meteringContext);
  if (handoff) {
    // A hosted batch handoff carries the hosted execution's batch operation key.
    return {
      batch: task.batch,
      handoff,
      hosted: handoff.operationId.startsWith("queued-batch:"),
      operationId: handoff.operationId,
    };
  }
  if (!task.batch.connectionId) return null;
  const matches = await prisma.providerCostEntry.findMany({
    where: {
      correlationId: taskId,
      projectId: task.batch.projectId,
      connectionId: task.batch.connectionId,
      credentialSource: "own",
    },
    select: { id: true },
    take: 2,
  });
  if (matches.length > 1) throw new Error("ambiguous legacy receipt");
  return matches[0]
    ? { batch: task.batch, hosted: false, handoff: undefined, operationId: matches[0].id }
    : null;
}
/** The hosted queued batch is one shadow operation keyed by the hosted execution's key. */
async function loadHostedBatchEntry(batch: {
  id: string;
  projectId: string;
  connectionId: string;
}): Promise<UsageEntry | null> {
  const tasks = await prisma.queuedRankCheckTask.findMany({
    where: { batchId: batch.id },
    select: { id: true },
  });
  if (tasks.length === 0) return null;
  const rows = await prisma.providerCostEntry.findMany({
    where: {
      correlationId: { in: tasks.map((task) => task.id) },
      projectId: batch.projectId,
      connectionId: batch.connectionId,
      credentialSource: "hosted",
    },
    select: {
      provider: true,
      feature: true,
      source: true,
      credentialKind: true,
      credentialId: true,
      createdAt: true,
      costCents: true,
      usageQuantity: true,
      measurementStatus: true,
      failed: true,
      project: { select: { ownerId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  if (rows.length === 0) return null;
  const first = rows[0];
  const costCents = rows.reduce((sum, row) => sum.plus(row.costCents), new Prisma.Decimal(0));
  const usageQuantity = rows.reduce(
    (sum, row) => (row.usageQuantity === null ? sum : sum.plus(row.usageQuantity)),
    new Prisma.Decimal(0),
  );
  const measured = rows.every(
    (row) => row.measurementStatus === "recorded" && row.usageQuantity !== null,
  );
  const provider = first.provider ?? "dataforseo";
  const metadata = providerAllocationMetadata(provider);
  return {
    id: `queued-batch:${batch.id}`,
    ownerId: first.project.ownerId,
    projectId: batch.projectId,
    connectionId: batch.connectionId,
    provider,
    feature: first.feature,
    source: PROVIDER_REQUEST_SOURCES.find((source) => source === first.source) ?? "app",
    credentialSource: "hosted",
    correlationId: batch.id,
    credentialKind: first.credentialKind,
    credentialId: first.credentialId,
    createdAt: first.createdAt,
    costCents: costCents.toFixed(4),
    usageQuantity: measured ? usageQuantity.toFixed(6) : null,
    measurementStatus: measured ? "recorded" : "unknown",
    cached: false,
    failed: rows.some((row) => row.failed),
    unit: metadata?.kind === "billable" ? metadata.allocationUnit : "cents",
  };
}
async function hostedBatch(taskId: string, context: QueuedTaskContext) {
  if (!context.batch.connectionId) return;
  const entry = await loadHostedBatchEntry({
    id: context.batch.id,
    projectId: context.batch.projectId,
    connectionId: context.batch.connectionId,
  });
  if (!entry) return;
  const shadow = await shadowForProject(entry.projectId);
  return { entry, shadow };
}
export async function resumeQueuedMetering(taskId: string) {
  await safely(taskId, async () => {
    const context = await load(taskId);
    if (!context) return;
    if (context.hosted) {
      const hosted = await hostedBatch(taskId, context);
      await hosted?.shadow?.resume(hosted.entry, context.handoff);
      return;
    }
    const entry = await loadUsageEntry(context.operationId ?? "");
    if (!entry) return;
    const shadow = await shadowForProject(entry.projectId);
    await shadow?.resume(entry, context.handoff);
  });
}
export async function settleQueuedMetering(taskId: string) {
  await safely(taskId, async () => {
    const context = await load(taskId);
    if (!context) return;
    if (context.hosted) {
      const hosted = await hostedBatch(taskId, context);
      await hosted?.shadow?.record(hosted.entry);
      return;
    }
    if (context.operationId) await syncUsageEntry(context.operationId);
  });
}
