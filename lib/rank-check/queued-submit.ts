import { BudgetExhaustedError } from "@/lib/metering/admission-errors";
import { persistQueuedSubmissionResult } from "./queued-submit-persist";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  queuedDefinitionFence,
  queuedWorkerSessions,
} from "@/lib/measurement-definitions/worker-queued";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { ProviderAllocationExhaustedError } from "@/lib/provider-usage/enforcement";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { startQueuedDeploymentExecution } from "@/lib/providers/execution-extension";
import { DeploymentAdmissionExhaustedError } from "@/lib/providers/execution-extension-errors";
import type { QueuedDeploymentExecution } from "@/lib/providers/execution-extension-types";
import { consumeProviderLimit, writeCooldown } from "@/lib/providers/rate-limit";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  assertQueuedTaskBatchSize,
  DataForSeoAmbiguousSubmissionError,
  type DataForSeoQueuedSubmissionResult,
  prepareDataForSeoQueuedTasks,
} from "@/lib/providers/serp/dataforseo-queued";
import { queuedRankCheckConfig } from "./queued-config";
import { deferQueuedRankCheckBatch } from "./queued-lifecycle";
import { queuedRankCheckModeAuthorization } from "./queued-mode";
import { claimQueuedSubmission } from "./queued-submit-claim";
import { submissionTasks } from "./queued-submit-tasks";
import { markAmbiguous, markDefiniteFailure } from "./queued-submit-transitions";
import { beginQueuedTaskUsageJournal, type QueuedTaskUsageJournal } from "./queued-usage-journal";
import { rankCheckSchedulerMode } from "./scheduler-mode";

const TERMINAL_STATES = new Set(["completed", "deferred", "failed"]);
export function submitQueuedRankCheckBatch(batchId: string) {
  return submitBatch(batchId);
}
async function submitBatch(batchId: string) {
  const schedulerMode = rankCheckSchedulerMode();
  const existing = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
    select: { state: true },
    where: { id: batchId },
  });
  const authorization = queuedRankCheckModeAuthorization(schedulerMode, existing.state);
  if (!authorization.allowSubmit) {
    if (authorization.allowPaidRetrieval) return { state: existing.state };
    const progress = await deferQueuedRankCheckBatch(
      batchId,
      `Queued provider submission is disabled in ${schedulerMode} scheduler mode.`,
    );
    return { state: progress.state };
  }
  let claimed: Awaited<ReturnType<typeof claimQueuedSubmission>>;
  try {
    claimed = await claimQueuedSubmission(batchId);
  } catch (error) {
    if (error instanceof ProviderAllocationExhaustedError) {
      const progress = await deferQueuedRankCheckBatch(
        batchId,
        "Queued provider allocation reached; deferring this batch.",
      );
      return { state: progress.state };
    }
    if (isOperationAccessDeniedError(error)) {
      // The claim rolled back, so the batch is still prepared: defer it with
      // the neutral message and touch no provider credentials.
      const progress = await deferQueuedRankCheckBatch(batchId, error.message);
      return { state: progress.state };
    }
    throw error;
  }
  if (TERMINAL_STATES.has(claimed.batch.state)) return { state: claimed.batch.state };
  if (!claimed.claimed) {
    return claimed.batch.state === "submitting"
      ? markAmbiguous(
          batchId,
          "Submission activity resumed after the paid-call fence; recovering by task tag.",
        )
      : { state: claimed.batch.state };
  }
  const config = queuedRankCheckConfig();
  if (!config.enabled) {
    const progress = await deferQueuedRankCheckBatch(
      batchId,
      "Queued DataForSEO rank checks were disabled before submission.",
    );
    return { state: progress.state };
  }
  const connection = claimed.batch.connection;
  if (!connection) {
    return markDefiniteFailure(batchId, "DataForSEO connection was removed before submission.");
  }
  const definitions = await queuedWorkerSessions(claimed.batch);
  const definitionFence = queuedDefinitionFence(definitions);
  let execution: QueuedDeploymentExecution | null;
  try {
    execution =
      connection.credentialSource === "hosted"
        ? await startQueuedDeploymentExecution(
            batchId,
            new Map([...definitions].map(([id, session]) => [id, session.beforeReserve])),
          )
        : null;
  } catch (error) {
    if (error instanceof DeploymentAdmissionExhaustedError) {
      // Credits map to the wallet comparison and allocation to the budget one.
      const progress = await deferQueuedRankCheckBatch(
        batchId,
        error.reason === "balance"
          ? "credits_exhausted"
          : `budget_exhausted:${error.surface ?? "app"}`,
      );
      return { state: progress.state };
    }
    throw error;
  }
  const credentials =
    execution?.credentials ??
    resolveProviderCredentials("dataforseo", connection.credentialsEncrypted);
  const rate = await consumeProviderLimit("dataforseo", credentials, {
    projectId: claimed.batch.projectId,
  });
  if (!rate.success) {
    await execution?.abort();
    const progress = await deferQueuedRankCheckBatch(
      batchId,
      "DataForSEO provider rate limit or cooldown prevented queued submission.",
    );
    return { state: progress.state };
  }
  let journal: QueuedTaskUsageJournal | undefined;
  let phase: "not_sent" | "rejected" | "unknown" | "responded" = "not_sent";
  const submissionPhase = () => phase;
  try {
    const tasks = await submissionTasks(claimed.batch, definitions);
    assertQueuedTaskBatchSize(tasks.length);
    const submission = prepareDataForSeoQueuedTasks({
      credentials,
      priority: claimed.batch.priority === "normal" ? "normal" : "high",
      tasks,
    });
    await prisma.$transaction(async (tx) => {
      for (const task of tasks) {
        const persisted = await tx.queuedRankCheckTask.updateMany({
          data: { providerTag: task.tag },
          where: { id: task.correlationId, state: "submitting" },
        });
        if (persisted.count !== 1) {
          throw new Error("Queued rank-check task was no longer ready for provider submission.");
        }
      }
    });
    if (execution) {
      await execution.begin(
        tasks.map((task, index) => ({
          providerRequest: submission.requests[index],
          correlationId: task.correlationId,
          keywordId: task.keywordId,
          tag: task.tag,
          // Hosted pricing and the retained TaskGET receipt count one native paid task.
          meteringEstimate: { costCents: task.estimate.cents, quantity: "1.000000" },
        })),
      );
    } else {
      journal = await beginQueuedTaskUsageJournal({
        client: prisma,
        connectionId: connection.id,
        projectId: claimed.batch.projectId,
        tasks,
        providerRequests: submission.requests,
        beforeFence: definitionFence,
        beforeReserve: new Map(
          [...definitions].map(([id, session]) => [id, session.beforeReserve]),
        ),
        credentialVersion: ownCredentialVersion(
          "dataforseo",
          connection.id,
          connection.credentialsEncrypted,
        ),
      });
    }
    let result: DataForSeoQueuedSubmissionResult;
    await execution?.transportStarted(definitionFence);
    await journal?.transportStarted();
    try {
      result = await submission.submit(journal?.pricedRequests);
    } catch (error) {
      phase = error instanceof DataForSeoError ? "rejected" : "unknown";
      throw error;
    }
    phase = "responded";
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
    } else {
      await journal?.settle(result);
    }
    await persistQueuedSubmissionResult(batchId, result, execution);
    await execution?.finish();
    const authoritative = await prisma.queuedRankCheckBatch.findUniqueOrThrow({
      select: { state: true },
      where: { id: batchId },
    });
    return { state: authoritative.state };
  } catch (error) {
    const message = error instanceof Error ? error.message : "DataForSEO task submission failed.";
    if (submissionPhase() === "unknown") {
      return markAmbiguous(
        batchId,
        error instanceof DataForSeoAmbiguousSubmissionError
          ? message
          : `DataForSEO task submission acceptance is unknown: ${message}`,
      );
    }
    if (submissionPhase() === "responded") {
      return markAmbiguous(
        batchId,
        `DataForSEO accepted the batch but queued persistence failed: ${message}`,
      );
    }
    if (submissionPhase() === "not_sent") {
      if (execution) await execution.abort();
      else await journal?.discard();
    } else
      return markAmbiguous(
        batchId,
        `DataForSEO submission rejection is not proof of zero charge: ${message}`,
      );
    if (
      error instanceof BudgetExhaustedError ||
      error instanceof ProviderAllocationExhaustedError
    ) {
      const progress = await deferQueuedRankCheckBatch(
        batchId,
        `budget_exhausted:${error instanceof ProviderAllocationExhaustedError ? error.surface : "app"}`,
      );
      return { state: progress.state };
    }
    if (error instanceof DeploymentAdmissionExhaustedError) {
      const progress = await deferQueuedRankCheckBatch(
        batchId,
        error.reason === "balance"
          ? "credits_exhausted"
          : `budget_exhausted:${error.surface ?? "app"}`,
      );
      return { state: progress.state };
    }
    if (
      submissionPhase() === "rejected" &&
      error instanceof DataForSeoError &&
      error.httpStatus === 429
    ) {
      writeCooldown(rate.accountKey);
      const progress = await deferQueuedRankCheckBatch(batchId, message);
      return { state: progress.state };
    }
    return markDefiniteFailure(batchId, message);
  }
}
