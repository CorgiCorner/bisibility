import "server-only";
import { prisma } from "@/lib/db/prisma";
import { withShadowRequest } from "@/lib/metering/shadow-context";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
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
  submitDataForSeoQueuedTasks,
} from "@/lib/providers/serp/dataforseo-queued";
import { queuedRankCheckConfig } from "./queued-config";
import { deferQueuedRankCheckBatch } from "./queued-lifecycle";
import { queuedRankCheckModeAuthorization } from "./queued-mode";
import { claimQueuedSubmission } from "./queued-submit-claim";
import { beginQueuedHostedShadow, compareQueuedHostedAdmission } from "./queued-submit-shadow";
import { submissionTasks } from "./queued-submit-tasks";
import { markAmbiguous, markDefiniteFailure } from "./queued-submit-transitions";
import { beginQueuedTaskUsageJournal, type QueuedTaskUsageJournal } from "./queued-usage-journal";
import { rankCheckSchedulerMode } from "./scheduler-mode";

const TERMINAL_STATES = new Set(["completed", "deferred", "failed"]);
export function submitQueuedRankCheckBatch(batchId: string) {
  return withShadowRequest(() => submitBatch(batchId));
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
  let execution: QueuedDeploymentExecution | null;
  try {
    execution =
      connection.credentialSource === "hosted"
        ? await startQueuedDeploymentExecution(batchId)
        : null;
  } catch (error) {
    if (error instanceof DeploymentAdmissionExhaustedError) {
      // Credits map to the wallet comparison and allocation to the budget one.
      await compareQueuedHostedAdmission({
        batch: claimed.batch,
        connectionId: connection.id,
        reason: error.reason,
      });
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
    const tasks = await submissionTasks(claimed.batch);
    assertQueuedTaskBatchSize(tasks.length);
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
        tasks.map((task) => ({
          correlationId: task.correlationId,
          keywordId: task.keywordId,
          tag: task.tag,
        })),
      );
      await beginQueuedHostedShadow({ batch: claimed.batch, connectionId: connection.id, tasks });
    } else {
      journal = await beginQueuedTaskUsageJournal({
        client: prisma,
        connectionId: connection.id,
        projectId: claimed.batch.projectId,
        tasks,
      });
    }
    let result: DataForSeoQueuedSubmissionResult;
    try {
      execution?.transportStarted();
      result = await submitDataForSeoQueuedTasks({
        credentials,
        priority: claimed.batch.priority === "normal" ? "normal" : "high",
        tasks,
      });
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
    if (execution) {
      if (submissionPhase() === "not_sent") await execution.abort();
      else
        return markAmbiguous(
          batchId,
          `DataForSEO submission rejection is not proof of zero charge: ${message}`,
        );
    } else {
      await journal?.discard();
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
