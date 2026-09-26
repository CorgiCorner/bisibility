import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveExpectedUrlForKeyword } from "@/lib/expected-url/keyword";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resumeQueuedMetering, settleQueuedMetering } from "@/lib/metering/queued-context";
import { withShadowRequest } from "@/lib/metering/shadow-context";
import { chargedProviderCostCents } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS,
  dataForSeoOrganicDecision,
  dataForSeoRawPayload,
  dataForSeoResponseCostCents,
} from "@/lib/providers/serp/dataforseo-payload";
import {
  dataForSeoQueuedTaskTag,
  fetchDataForSeoQueuedResult,
} from "@/lib/providers/serp/dataforseo-queued";
import { requireDeterminateOrganicResult } from "@/lib/providers/serp/payload-contract-error";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { rankCheckCostCents } from "./cost";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "./normalization-version";
import { organicDomainRanksFromV2Results } from "./organic-ranks";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import { queuedBatchAttribution } from "./queued-attribution";
import {
  explicitQueuedGetCostCents,
  finishQueuedHostedExecutionIfPresent,
  queuedHostedRecovery,
} from "./queued-hosted-results";
import { deferQueuedRankCheckBatch, finalizeQueuedBatchState } from "./queued-lifecycle";
import { authorizeQueuedRankCheckBatch } from "./queued-mode";
import {
  assertQueuedPersistenceLease,
  claimQueuedPersistenceLease,
  type QueuedPersistenceLease,
  transitionQueuedPersistenceLease,
} from "./queued-persistence-lease";
import { dataForSeoQueuedEstimate } from "./queued-pricing";
import { dataForSeoQueuedResponseTask, pollDataForSeoQueue } from "./queued-provider-poll";
import {
  type QueuedResultAttemptOptions,
  QueuedResultDeadlineReachedError,
  queuedResultAttemptSignal,
  queuedResultTransactionOptions,
  runQueuedResultTasksWithinDeadline,
  throwIfQueuedResultAborted,
  throwIfQueuedResultDeadlineReached,
} from "./queued-result-attempt";
import {
  reconcileTaskWithRankCheck,
  releaseAbortedLease,
  transitionLease,
} from "./queued-results-lease";
import { loadComparablePrevious, loadQueuedTask, type QueuedTask } from "./queued-results-load";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";
import { fallbackSchedule, persistFailedRankCheck, persistRankCheck } from "./runner";
import { computeNextCheckAt } from "./schedule";

async function claimTask(taskId: string) {
  return prisma.$transaction(async (tx) => {
    const lease = await claimQueuedPersistenceLease(taskId, tx);
    if (!lease) return null;
    return { lease, task: await loadQueuedTask(taskId, tx) };
  }, queuedResultTransactionOptions);
}
function terminalizeLease(lease: QueuedPersistenceLease, state: "completed" | "failed") {
  return async (tx: Prisma.TransactionClient) => {
    await transitionQueuedPersistenceLease(lease, ["persisting"], { state }, tx);
  };
}

async function persistProviderFailure(
  task: QueuedTask,
  message: string,
  costCents: number | undefined,
  lease: QueuedPersistenceLease,
) {
  const previous = await loadComparablePrevious(task);
  const expectedUrl = await resolveExpectedUrlForKeyword(task.keyword.id);
  const origin = queuedBatchAttribution(task.batch);
  // biome-ignore format: keep the queue persistence module under its enforced line cap.
  await persistFailedRankCheck({ attempts: [{ message, provider: "dataforseo" }], checkedAt: new Date(), connectionId: task.batch.connectionId ?? undefined, error: message, existingRankCheckId: task.rankCheckId, expectedUrlAtCheck: expectedUrl.url, keywordId: task.keyword.id, keywordPublicId: task.keyword.publicId, keywordText: task.keyword.text, previousPosition: previous?.position ?? null, persistenceFinalize: terminalizeLease(lease, "failed"), persistenceGuard: (tx) => assertQueuedPersistenceLease(tx, lease), projectDomain: trackedProjectDomain(task.keyword.project.domain) ?? "", projectId: task.keyword.projectId, provider: "dataforseo", providerCostCents: costCents, providerRequestId: task.providerTaskId ?? undefined, providerUsage: { context: { correlationId: task.id, feature: "rank_check", projectId: task.keyword.projectId, source: origin.source, trigger: origin.trigger }, ...(origin.credential ? { credential: origin.credential } : {}), tag: task.providerTag ?? dataForSeoQueuedTaskTag(task.id) }, requestedDepth: resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined), transactionOptions: queuedResultTransactionOptions });
}

async function persistProviderResult(
  task: QueuedTask,
  lease: QueuedPersistenceLease,
  signal: AbortSignal,
  deadlineAt?: Date,
) {
  if (!task.providerTaskId) throw new Error("Queued DataForSEO task is missing its provider id.");
  if (!task.batch.connection) throw new Error("DataForSEO connection is unavailable.");
  const recovery = await queuedHostedRecovery(task);
  const credentials =
    recovery?.credentials ??
    resolveProviderCredentials("dataforseo", task.batch.connection.credentialsEncrypted);
  const polled = await pollDataForSeoQueue(
    credentials,
    task.keyword.projectId,
    () => {
      throwIfQueuedResultDeadlineReached(deadlineAt);
      return fetchDataForSeoQueuedResult(credentials, task.providerTaskId as string, { signal });
    },
    { deadlineAt },
  );
  if (polled.status === "deadline_reached") throw new QueuedResultDeadlineReachedError();
  if (polled.status === "pending") return "pending";
  throwIfQueuedResultAborted(signal);
  const data = polled.value;
  const providerTask = dataForSeoQueuedResponseTask(
    data,
    recovery ? task.providerTaskId : undefined,
  );
  const terminalCostCents = recovery
    ? explicitQueuedGetCostCents(data, task.providerTaskId)
    : dataForSeoResponseCostCents(data);
  if (recovery && terminalCostCents === null) return "pending";
  const providerFailed =
    !providerTask ||
    (providerTask.status_code !== 20000 &&
      providerTask.status_code !== DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS);
  const frozenCost = recovery
    ? await recovery.settleTask(task.id, {
        cached: false,
        costCents: terminalCostCents,
        failed: providerFailed,
        providerRequestId: task.providerTaskId,
        quantity: 1,
      })
    : null;
  if (recovery && frozenCost === null) return "pending";
  if (
    !providerTask ||
    (providerTask.status_code !== 20000 &&
      providerTask.status_code !== DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS)
  ) {
    throw new DataForSeoError(
      providerTask?.status_message ?? "DataForSEO queued result was unavailable.",
      false,
      undefined,
      terminalCostCents === 0 ? 0 : terminalCostCents,
    );
  }
  // biome-ignore format: keep the queue persistence module under its enforced line cap.
  const items = providerTask.status_code === DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS ? [] : Array.isArray(providerTask.result) ? providerTask.result.flatMap((result) => result.items ?? []) : [null];
  const checkedAt = new Date();
  const requestedDepth = resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined);
  // biome-ignore format: keep the queue persistence module under its enforced line cap.
  const decision = requireDeterminateOrganicResult("DataForSEO", dataForSeoOrganicDecision(items, trackedProjectDomain(task.keyword.project.domain) ?? "", requestedDepth));
  const reportedCost = recovery
    ? frozenCost
    : terminalCostCents !== null && terminalCostCents > 0
      ? terminalCostCents
      : task.costCents === null
        ? null
        : Number(task.costCents);
  const costCents = rankCheckCostCents(reportedCost, task.batch.connection.costPerCheckCents);
  const previous = await loadComparablePrevious(task);
  const expectedUrl = await resolveExpectedUrlForKeyword(task.keyword.id);
  const origin = queuedBatchAttribution(task.batch);
  const schedule = task.keyword.schedule ?? task.keyword.project.defaults ?? fallbackSchedule();
  const rawPayload = dataForSeoRawPayload(items, decision);
  const raw = rawPayload as unknown as Prisma.InputJsonObject;
  await persistRankCheck(
    // biome-ignore format: keep the queue persistence module under its enforced line cap.
    { attempts: [], connectionId: task.batch.connection.id, existingRankCheckId: task.rankCheckId, expectedUrlAtCheck: expectedUrl.url, hasDefaults: Boolean(task.keyword.project.defaults), hasSchedule: Boolean(task.keyword.schedule), keywordId: task.keyword.id, keywordPublicId: task.keyword.publicId, keywordTargetUrl: task.keyword.targetUrl, previousRankingUrl: previous?.rankingUrl ?? null, previousRaw: previous?.raw ?? null, persistenceFinalize: terminalizeLease(lease, "completed"), persistenceGuard: (tx) => assertQueuedPersistenceLease(tx, lease), projectId: task.keyword.projectId, providerRequestId: task.providerTaskId, providerUsage: { context: { correlationId: task.id, feature: "rank_check", projectId: task.keyword.projectId, source: origin.source, trigger: origin.trigger }, ...(origin.credential ? { credential: origin.credential } : {}), tag: task.providerTag ?? dataForSeoQueuedTaskTag(task.id) }, transactionOptions: queuedResultTransactionOptions },
    {
      comparisonAllowed: previous !== null,
      providerCostCents: reportedCost !== null && reportedCost > 0 ? reportedCost : undefined,
      rankCheck: {
        billingUnits: 1,
        checkedAt,
        costCents,
        estimatedCostCents:
          costCents !== null
            ? null
            : dataForSeoQueuedEstimate(
                task.batch.priority === "normal" ? "normal" : "high",
                requestedDepth,
              ),
        keywordId: task.keyword.id,
        normalizationVersion: CURRENT_RANK_NORMALIZATION_VERSION,
        organicRanks: organicDomainRanksFromV2Results(rawPayload.organic_results),
        position: decision.position,
        previousPosition: previous?.position ?? null,
        provider: "dataforseo",
        rankingUrl: decision.rankingUrl,
        raw,
        requestedDepth,
      },
      scheduleUpdate: {
        lastCheckedAt: checkedAt,
        nextCheckAt: computeNextCheckAt(schedule, checkedAt, task.keyword.id),
      },
    },
  );
  return "completed";
}

async function persistTask(taskId: string, options: QueuedResultAttemptOptions) {
  const claimed = await claimTask(taskId);
  if (!claimed) return;
  const { lease, task } = claimed;
  await resumeQueuedMetering(taskId);
  const attempt = queuedResultAttemptSignal(options.signal);

  try {
    throwIfQueuedResultAborted(attempt.signal);
    if (task.rankCheck.status !== "running") {
      await reconcileTaskWithRankCheck(lease);
      return;
    }
    if (task.error) {
      const recovery = await queuedHostedRecovery(task);
      const finalCost = recovery ? await recovery.knownCost(task.id) : null;
      if (recovery && finalCost === null) {
        await transitionLease(lease, { state: "provider_failed" });
        return;
      }
      await persistProviderFailure(
        task,
        task.error,
        finalCost ?? (task.costCents === null ? undefined : Number(task.costCents)),
        lease,
      );
      return;
    }
    const result = await persistProviderResult(task, lease, attempt.signal, options.deadlineAt);
    if (result === "pending") {
      await transitionLease(lease, { state: "ready" });
      return;
    }
  } catch (error) {
    if (attempt.signal.aborted) {
      await releaseAbortedLease(task, lease).catch(() => undefined);
      throw attempt.signal.reason ?? error;
    }
    if (error instanceof QueuedResultDeadlineReachedError) {
      await releaseAbortedLease(task, lease);
      return "deadline";
    }
    if (error instanceof RankCheckClosedBeforePersistenceError) {
      await reconcileTaskWithRankCheck(lease);
      return;
    }
    const message = error instanceof Error ? error.message : "DataForSEO queued result failed.";
    const recovery = await queuedHostedRecovery(task);
    const settledCost = recovery ? await recovery.knownCost(task.id) : null;
    if (recovery && settledCost === null) {
      await releaseAbortedLease(task, lease);
      return;
    }
    const costCents =
      settledCost ??
      chargedProviderCostCents(error) ??
      (task.costCents === null ? undefined : Number(task.costCents));
    try {
      await persistProviderFailure(task, message, costCents, lease);
    } catch (failure) {
      if (!(failure instanceof RankCheckClosedBeforePersistenceError)) throw failure;
      await reconcileTaskWithRankCheck(lease);
    }
  } finally {
    attempt.clear();
    await settleQueuedMetering(taskId);
  }
}

async function persistReadyTasks(batchId: string, options: QueuedResultAttemptOptions = {}) {
  const authorization = await authorizeQueuedRankCheckBatch(batchId);
  if (!authorization.allowPaidRetrieval) {
    return deferQueuedRankCheckBatch(
      batchId,
      `Queued result retrieval is disabled in ${authorization.mode} scheduler mode.`,
    );
  }
  const tasks = await prisma.queuedRankCheckTask.findMany({
    orderBy: { id: "asc" },
    select: { id: true, providerTag: true },
    where: { batchId, state: { in: ["persisting", "provider_failed", "ready"] } },
  });
  const completed = await runQueuedResultTasksWithinDeadline(
    tasks.map((task) => task.id),
    options,
    persistTask,
  );
  if (!completed) return deferQueuedRankCheckBatch(batchId, QUEUED_DEADLINE_REASON);
  const result = await finalizeQueuedBatchState(batchId);
  await finishQueuedHostedExecutionIfPresent(batchId);
  return result;
}

export function persistReadyQueuedRankCheckTasks(
  batchId: string,
  options: QueuedResultAttemptOptions = {},
) {
  return withShadowRequest(() => persistReadyTasks(batchId, options));
}
