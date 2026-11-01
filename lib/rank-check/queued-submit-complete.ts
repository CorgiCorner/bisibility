import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { QueuedDeploymentExecution } from "@/lib/providers/execution-extension-types";
import type { DataForSeoQueuedSubmissionResult } from "@/lib/providers/serp/dataforseo-queued";
import { logPartialQueuedSubmission } from "./queued-submit-diagnostics";
import { persistQueuedSubmissionResult } from "./queued-submit-persist";
import type { QueuedTaskUsageJournal } from "./queued-usage-journal";

export async function completeQueuedResponse(
  batchId: string,
  connectionId: string,
  result: DataForSeoQueuedSubmissionResult,
  execution: QueuedDeploymentExecution | null,
  journal?: QueuedTaskUsageJournal,
) {
  if (execution) {
    await execution.record([
      ...result.accepted.map((task) => ({
        correlationId: task.correlationId,
        costCents: task.costCents,
        failed: false,
        providerRequestId: task.providerTaskId,
      })),
      ...result.failed.map((task) => ({
        correlationId: task.correlationId,
        costCents: task.costCents,
        failed: true,
      })),
    ]);
  } else await journal?.settle(result);
  await persistQueuedSubmissionResult(batchId, result, execution);
  logPartialQueuedSubmission({ batchId, connectionId }, result);
  await execution?.finish();
  const authoritative = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return { state: authoritative.state };
}
