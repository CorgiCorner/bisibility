import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { QueuedDeploymentExecution } from "@/lib/providers/execution-extension-types";
import { type DataForSeoQueuedSubmissionResult } from "@/lib/providers/serp/dataforseo-queued";

export async function persistQueuedSubmissionResult(
  batchId: string,
  result: DataForSeoQueuedSubmissionResult,
  execution: QueuedDeploymentExecution | null,
) {
  await prisma.$transaction(async (tx) => {
    for (const task of result.accepted) {
      const duplicate =
        execution &&
        result.accepted.some(
          (other) =>
            other.correlationId < task.correlationId &&
            other.providerTaskId === task.providerTaskId,
        );
      await tx.queuedRankCheckTask.updateMany({
        data: duplicate
          ? {
              costCents: task.costCents,
              error: "Duplicate provider task identity.",
              state: "provider_failed",
            }
          : {
              costCents: task.costCents,
              error: null,
              providerTaskId: task.providerTaskId,
              providerTag: task.tag,
              state: "submitted",
            },
        where: { id: task.correlationId, state: "submitting" },
      });
    }
    for (const task of result.failed) {
      await tx.queuedRankCheckTask.updateMany({
        data: { costCents: task.costCents, error: task.message, state: "provider_failed" },
        where: { id: task.correlationId, state: "submitting" },
      });
    }
    for (const task of result.unknown) {
      await tx.queuedRankCheckTask.updateMany({
        data: { error: task.message, state: "ambiguous" },
        where: { id: task.correlationId, state: "submitting" },
      });
    }
    await tx.queuedRankCheckBatch.updateMany({
      data: { state: "submitted", submittedAt: new Date() },
      where: { id: batchId, state: "submitting" },
    });
  });
}
