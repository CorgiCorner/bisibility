import "server-only";
import { prisma } from "@/lib/db/prisma";
import { ACTIVE_QUEUED_BATCH_STATES } from "./queued-state";
import {
  logQueuedSubmissionDiagnostic,
  type QueuedSubmissionDiagnostic,
} from "./queued-submit-diagnostics";

/**
 * Applies only to unsent states, so a later call never replaces the first ambiguity reason; the
 * queue-age cleanup appends its note to that reason instead of overwriting it.
 */
export async function markAmbiguous(
  batchId: string,
  message: string,
  diagnostic?: QueuedSubmissionDiagnostic,
) {
  const now = new Date();
  const [, batchUpdate] = await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: message, state: "ambiguous" },
      where: { batchId, state: { in: ["prepared", "submitting"] } },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { ambiguousAt: now, error: message, state: "ambiguous" },
      where: { id: batchId, state: { in: ["prepared", "submitting"] } },
    }),
  ]);
  if (diagnostic && batchUpdate.count > 0) logQueuedSubmissionDiagnostic("ambiguous", diagnostic);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: batch.state };
}

export async function markDefiniteFailure(
  batchId: string,
  message: string,
  diagnostic?: QueuedSubmissionDiagnostic,
) {
  const [, batchUpdate] = await prisma.$transaction([
    prisma.queuedRankCheckTask.updateMany({
      data: { error: message, state: "provider_failed" },
      where: { batchId, state: { in: ["prepared", "submitting"] } },
    }),
    prisma.queuedRankCheckBatch.updateMany({
      data: { error: message, state: "ready" },
      where: { id: batchId, state: { in: ACTIVE_QUEUED_BATCH_STATES } },
    }),
  ]);
  if (diagnostic && batchUpdate.count > 0) logQueuedSubmissionDiagnostic("failed", diagnostic);
  const batch = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: batch.state };
}
