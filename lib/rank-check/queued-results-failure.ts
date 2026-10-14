import "server-only";
import { retainedQueuedDefinition } from "@/lib/measurement-definitions/worker-collection";
import { dataForSeoQueuedTaskTag } from "@/lib/providers/serp/dataforseo-queued";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { queuedBatchAttribution } from "./queued-attribution";
import {
  assertQueuedPersistenceLease,
  type QueuedPersistenceLease,
} from "./queued-persistence-lease";
import { queuedResultTransactionOptions } from "./queued-result-attempt";
import { terminalizeLease } from "./queued-result-finalization";
import { type QueuedTask } from "./queued-results-load";
import { persistFailedRankCheck } from "./runner";

export async function persistProviderFailure(
  task: QueuedTask,
  message: string,
  costCents: number | undefined,
  lease: QueuedPersistenceLease,
) {
  const definition = await retainedQueuedDefinition(task, lease);
  const expectedUrl = { url: definition?.request.targetUrl ?? null };
  const origin = queuedBatchAttribution(task.batch);
  await persistFailedRankCheck({
    attempts: [{ message, provider: "dataforseo" }],
    checkedAt: new Date(),
    connectionId: task.batch.connectionId ?? undefined,
    error: message,
    existingRankCheckId: task.rankCheckId,
    expectedUrlAtCheck: expectedUrl.url,
    keywordId: task.keyword.id,
    keywordPublicId: task.keyword.publicId,
    keywordText: definition?.request.keyword ?? task.keyword.text,
    previousPosition: null,
    persistenceFinalize: terminalizeLease(lease, "failed"),
    persistenceGuard: (tx) => assertQueuedPersistenceLease(tx, lease),
    projectDomain: definition?.request.domain ?? "",
    projectId: task.keyword.projectId,
    provider: "dataforseo",
    providerCostCents: costCents,
    providerRequestId: task.providerTaskId ?? undefined,
    providerUsage: {
      context: {
        correlationId: task.id,
        feature: "rank_check",
        projectId: task.keyword.projectId,
        source: origin.source,
        trigger: origin.trigger,
      },
      ...(origin.credential ? { credential: origin.credential } : {}),
      tag: task.providerTag ?? dataForSeoQueuedTaskTag(task.id),
    },
    requestedDepth:
      definition?.request.depth ??
      (task.rankCheck.requestedDepth == null
        ? undefined
        : resolveSerpDepth(task.rankCheck.requestedDepth)),
    transactionOptions: queuedResultTransactionOptions,
  });
}
