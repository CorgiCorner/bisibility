import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { retainedQueuedDefinition } from "@/lib/measurement-definitions/worker-collection";
import { dataForSeoQueuedTaskTag } from "@/lib/providers/serp/dataforseo-queued";
import { UnresolvedRedirectError } from "@/lib/providers/serp/unresolved-redirect-error";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { queuedBatchAttribution } from "./queued-attribution";
import {
  assertQueuedPersistenceLease,
  type QueuedPersistenceLease,
} from "./queued-persistence-lease";
import { queuedResultTransactionOptions } from "./queued-result-attempt";
import { terminalizeLease } from "./queued-result-finalization";
import type { QueuedTask } from "./queued-results-load";
import { QueuedSourceEvidenceError } from "./queued-source-evidence";
import { persistFailedRankCheck } from "./runner";

export const QUEUED_SOURCE_UNUSABLE_MESSAGE = "The provider result could not be processed safely.";
export const QUEUED_SOURCE_UNUSABLE_LOG_MESSAGE = "[queued-rank-check] retained source unusable";

/** The stored error is public API text; an evidence reason stays in the operator log only. */
export function queuedFailureOutcome(error: unknown, taskId: string) {
  if (error instanceof UnresolvedRedirectError)
    return {
      errorCode: "provider_unresolved_redirects" as const,
      message: error.message,
      raw: error.raw as Prisma.InputJsonObject | undefined,
    };
  if (error instanceof QueuedSourceEvidenceError) {
    console.warn(QUEUED_SOURCE_UNUSABLE_LOG_MESSAGE, { reason: error.reason, taskId });
    return {
      errorCode: "provider_result_unusable" as const,
      message: QUEUED_SOURCE_UNUSABLE_MESSAGE,
    };
  }
  return { message: error instanceof Error ? error.message : "DataForSEO queued result failed." };
}

export async function persistProviderFailure(
  task: QueuedTask,
  message: string,
  costCents: number | undefined,
  lease: QueuedPersistenceLease,
  errorCode?: import("./failure-presentation").RankCheckFailureCode,
  raw?: Prisma.InputJsonObject,
) {
  const definition = await retainedQueuedDefinition(task, lease);
  const expectedUrl = { url: definition?.request.targetUrl ?? null };
  const origin = queuedBatchAttribution(task.batch);
  await persistFailedRankCheck({
    attempts: [{ message, provider: "dataforseo" }],
    checkedAt: new Date(),
    connectionId: task.batch.connectionId ?? undefined,
    error: message,
    errorCode,
    raw,
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
