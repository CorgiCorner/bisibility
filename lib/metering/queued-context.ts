import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import {
  readDeploymentMeteringEvidence,
  readDeploymentMeteringExecutionOwner,
} from "@/lib/providers/execution-extension";
import { loadUsageEntry, syncUsageEntry } from "./entry-sync";
import { entryFromHostedEvidence } from "./hosted-sync";
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
  if ((await readDeploymentMeteringExecutionOwner(`queued-batch:${batch.id}`)) === "meter")
    return null;
  const evidence = await readDeploymentMeteringEvidence(`queued-batch:${batch.id}`);
  if (!evidence?.snapshot.namespace) return null;
  if (
    evidence.snapshot.projectId !== batch.projectId ||
    evidence.snapshot.connectionId !== batch.connectionId
  )
    throw new Error("Retained queued metering binding is corrupt.");
  return entryFromHostedEvidence(evidence);
}
async function hostedBatch(context: QueuedTaskContext) {
  if (!context.batch.connectionId) return;
  const entry = await loadHostedBatchEntry({
    id: context.batch.id,
    projectId: context.batch.projectId,
    connectionId: context.batch.connectionId,
  });
  if (!entry) return;
  const shadow = await shadowForProject(entry.projectId, entry.namespace);
  return { entry, shadow };
}
export async function resumeQueuedMetering(taskId: string) {
  await safely(taskId, async () => {
    const context = await load(taskId);
    if (!context) return;
    if (context.hosted) {
      const hosted = await hostedBatch(context);
      await hosted?.shadow?.resume(hosted.entry, context.handoff);
      return;
    }
    const entry = await loadUsageEntry(context.operationId ?? "");
    if (!entry) return;
    if (await ownAdmission.owns(prisma, entry.id)) return;
    const shadow = await shadowForProject(entry.projectId, entry.namespace);
    await shadow?.resume(entry, context.handoff);
  });
}
export async function settleQueuedMetering(taskId: string) {
  await safely(taskId, async () => {
    const context = await load(taskId);
    if (!context) return;
    if (context.hosted) {
      const hosted = await hostedBatch(context);
      await hosted?.shadow?.record(hosted.entry);
      return;
    }
    if (context.operationId) await syncUsageEntry(context.operationId);
  });
}
