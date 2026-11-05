import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION } from "./queued-source-schema";

/** A failed check keeps its retained source this long for a later historical repair. */
export const QUEUED_SOURCE_FAILED_RETENTION_MS = 30 * 86_400_000;
export const QUEUED_SOURCE_SWEEP_PAGE_SIZE = 500;

const queuedSourceRows = {
  kind: "unresolved",
  schemaVersion: QUEUED_SOURCE_EVIDENCE_SCHEMA_VERSION,
} as const;

/**
 * Runs inside the transaction that terminalizes the queued task. A completed check no longer
 * needs its retained source or conversion progress; a failed one keeps them for 30 days.
 */
export async function finalizeQueuedSourceEvidence(
  tx: Prisma.TransactionClient,
  taskId: string,
  state: "completed" | "failed",
  now = new Date(),
) {
  const task = await tx.queuedRankCheckTask.findUnique({
    select: { rankCheckId: true },
    where: { id: taskId },
  });
  if (!task) return;
  const where = { ...queuedSourceRows, rankCheckId: task.rankCheckId };
  if (state === "completed") {
    await tx.providerPartialEvidence.deleteMany({ where });
    return;
  }
  await tx.providerPartialEvidence.updateMany({
    where,
    data: { expiresAt: new Date(now.getTime() + QUEUED_SOURCE_FAILED_RETENTION_MS) },
  });
}

/** Deletes one bounded page of expired retained sources; other evidence kinds are untouched. */
export async function sweepExpiredQueuedSourceEvidence(now = new Date()) {
  const candidates = await prisma.providerPartialEvidence.findMany({
    orderBy: { expiresAt: "asc" },
    select: { id: true },
    take: QUEUED_SOURCE_SWEEP_PAGE_SIZE + 1,
    where: { ...queuedSourceRows, expiresAt: { lt: now } },
  });
  const page = candidates.slice(0, QUEUED_SOURCE_SWEEP_PAGE_SIZE).map((row) => row.id);
  const deleted = page.length
    ? (
        await prisma.providerPartialEvidence.deleteMany({
          where: { ...queuedSourceRows, id: { in: page }, expiresAt: { lt: now } },
        })
      ).count
    : 0;
  return { deleted, hasMore: candidates.length > QUEUED_SOURCE_SWEEP_PAGE_SIZE };
}
