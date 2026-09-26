import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ACTIVE_QUEUED_BATCH_STATES } from "./queued-state";

export async function markAmbiguous(batchId: string, message: string) {
  const now = new Date();
  await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: message, state: "ambiguous" },
      where: { batchId, state: { in: ["prepared", "submitting"] } },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { ambiguousAt: now, error: message, state: "ambiguous" },
      where: { id: batchId, state: { in: ["prepared", "submitting"] } },
    }),
  ]);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: batch.state };
}

export async function markDefiniteFailure(batchId: string, message: string) {
  await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: message, state: "provider_failed" },
      where: { batchId, state: { in: ["prepared", "submitting"] } },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { error: message, state: "ready" },
      where: { id: batchId, state: { in: ACTIVE_QUEUED_BATCH_STATES } },
    }),
  ]);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: batch.state };
}
