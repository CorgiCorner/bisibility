import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { ProviderConnection } from "@/lib/generated/prisma/client";
import type { QueuedDeploymentExecution } from "@/lib/providers/execution-extension-types";
import type { DataForSeoQueuedSubmissionResult } from "@/lib/providers/serp/dataforseo-queued";
import { recordAcceptedQueuedCodes } from "./queued-account-observation";
import {
  logPartialQueuedSubmission,
  logQueuedSubmissionDiagnostic,
  queuedSubmissionDiagnostic,
} from "./queued-submit-diagnostics";
import { persistQueuedSubmissionResult } from "./queued-submit-persist";
import { type QueuedTaskUsageJournal, QueuedUsageSettlementError } from "./queued-usage-journal";

type Connection = Pick<ProviderConnection, "id" | "credentialSource" | "credentialsEncrypted">;

export async function completeQueuedResponse(
  batchId: string,
  connection: Connection,
  projectId: string,
  result: DataForSeoQueuedSubmissionResult,
  execution: QueuedDeploymentExecution | null,
  journal?: QueuedTaskUsageJournal,
) {
  let deferred: readonly string[] = [];
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
    await persistQueuedSubmissionResult(batchId, result, execution);
  } else {
    // Native task ids commit before usage settlement. A settlement failure leaves usage unknown
    // (still fail-closed) instead of discarding the proof that recovers it without a task post.
    // Settlement is still attempted when persistence fails, so known receipts are never dropped.
    const unpersisted = await persistQueuedSubmissionResult(batchId, result, null).then(
      () => null,
      (error: unknown) => ({ error }),
    );
    try {
      deferred = (await journal?.settle(result))?.deferred ?? [];
    } catch (error) {
      if (error instanceof QueuedUsageSettlementError) deferred = error.deferred;
      logQueuedSubmissionDiagnostic(
        "unsettled",
        queuedSubmissionDiagnostic(batchId, connection.id, "responded", error),
      );
    }
    if (unpersisted) throw unpersisted.error;
  }
  await recordAcceptedQueuedCodes(
    connection,
    projectId,
    batchId,
    result.accountFailureCodes ?? [],
    journal,
  );
  if (deferred.length > 0) {
    console.warn("[queued-rank-check] usage settlement deferred", {
      batchId,
      connectionId: connection.id,
      deferred: deferred.length,
    });
  }
  logPartialQueuedSubmission({ batchId, connectionId: connection.id }, result);
  await execution?.finish();
  const authoritative = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  return deferred.length
    ? { deferredUsage: deferred, state: authoritative.state }
    : { state: authoritative.state };
}
