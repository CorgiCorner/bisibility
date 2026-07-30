import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { chargedProviderCostCents } from "@/lib/providers/call-error";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  dataForSeoItemPosition,
  dataForSeoRawPayload,
  dataForSeoResponseCostCents,
  findDataForSeoRankingItem,
} from "@/lib/providers/serp/dataforseo-payload";
import { fetchDataForSeoQueuedResult } from "@/lib/providers/serp/dataforseo-queued";
import { resolveSerpDepth } from "@/lib/serp/markets";
import { rankCheckCostCents } from "./cost";
import { organicDomainRanksFromResults } from "./organic-ranks";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import { deferQueuedRankCheckBatch, finalizeQueuedBatchState } from "./queued-lifecycle";
import { authorizeQueuedRankCheckBatch } from "./queued-mode";
import {
  assertQueuedPersistenceLease,
  claimQueuedPersistenceLease,
  type QueuedPersistenceLease,
  transitionQueuedPersistenceLease,
} from "./queued-persistence-lease";
import { dataForSeoQueuedEstimate, queuedBillingUnits } from "./queued-pricing";
import { dataForSeoQueuedResponseTask, pollDataForSeoQueue } from "./queued-provider-poll";
import {
  type QueuedResultAttemptOptions,
  QueuedResultDeadlineReachedError,
  queuedResultAttemptSignal,
  queuedResultReleaseTransactionOptions,
  queuedResultTransactionOptions,
  runQueuedResultTasksWithinDeadline,
  throwIfQueuedResultAborted,
  throwIfQueuedResultDeadlineReached,
} from "./queued-result-attempt";
import { ACTIVE_QUEUED_TASK_STATES, queuedTaskStateForRankCheck } from "./queued-state";
import { QUEUED_DEADLINE_REASON } from "./queued-timeouts";
import { fallbackSchedule, persistFailedRankCheck, persistRankCheck } from "./runner";
import { computeNextCheckAt } from "./schedule";

type QueuedTask = Awaited<ReturnType<typeof loadTask>>;

async function loadTask(
  id: string,
  client: Pick<Prisma.TransactionClient, "queuedRankCheckTask"> = prisma,
) {
  return client.queuedRankCheckTask.findUniqueOrThrow({
    include: {
      batch: { include: { connection: true } },
      keyword: {
        include: {
          project: { include: { defaults: true } },
          rankChecks: {
            orderBy: { checkedAt: "desc" },
            take: 1,
            where: { status: "completed" },
          },
          schedule: true,
        },
      },
      rankCheck: true,
    },
    where: { id },
  });
}

async function claimTask(taskId: string) {
  return prisma.$transaction(async (tx) => {
    const lease = await claimQueuedPersistenceLease(taskId, tx);
    if (!lease) return null;
    return { lease, task: await loadTask(taskId, tx) };
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
  costCents: number,
  lease: QueuedPersistenceLease,
) {
  await persistFailedRankCheck({
    attempts: [{ message, provider: "dataforseo" }],
    checkedAt: new Date(),
    connectionId: task.batch.connectionId ?? undefined,
    error: message,
    existingRankCheckId: task.rankCheckId,
    keywordId: task.keyword.id,
    keywordPublicId: task.keyword.publicId,
    keywordText: task.keyword.text,
    previousPosition: task.keyword.rankChecks[0]?.position ?? null,
    persistenceFinalize: terminalizeLease(lease, "failed"),
    persistenceGuard: (tx) => assertQueuedPersistenceLease(tx, lease),
    projectDomain: task.keyword.project.domain,
    projectId: task.keyword.projectId,
    provider: "dataforseo",
    providerCostCents: costCents,
    requestedDepth: resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
    transactionOptions: queuedResultTransactionOptions,
  });
}

async function persistProviderResult(
  task: QueuedTask,
  lease: QueuedPersistenceLease,
  signal: AbortSignal,
  deadlineAt?: Date,
) {
  if (!task.providerTaskId) throw new Error("Queued DataForSEO task is missing its provider id.");
  if (!task.batch.connection) throw new Error("DataForSEO connection is unavailable.");
  const credentials = resolveProviderCredentials(
    "dataforseo",
    task.batch.connection.credentialsEncrypted,
  );
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
  const providerTask = dataForSeoQueuedResponseTask(data);
  const terminalCostCents = dataForSeoResponseCostCents(data);
  if (providerTask?.status_code !== 20000) {
    throw new DataForSeoError(
      providerTask?.status_message ?? "DataForSEO queued result was unavailable.",
      false,
      undefined,
      terminalCostCents || null,
    );
  }
  const items = providerTask.result?.flatMap((result) => result.items ?? []) ?? [];
  const rankingItem = findDataForSeoRankingItem(items, task.keyword.project.domain);
  const checkedAt = new Date();
  const requestedDepth = resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined);
  const reportedCost = terminalCostCents || Number(task.costCents ?? 0);
  const costCents = rankCheckCostCents(reportedCost, task.batch.connection.costPerCheckCents);
  const previous = task.keyword.rankChecks[0];
  const schedule = task.keyword.schedule ?? task.keyword.project.defaults ?? fallbackSchedule();
  const rawPayload = dataForSeoRawPayload(items);
  const raw = rawPayload as unknown as Prisma.InputJsonObject;
  await persistRankCheck(
    {
      attempts: [],
      connectionId: task.batch.connection.id,
      existingRankCheckId: task.rankCheckId,
      hasDefaults: Boolean(task.keyword.project.defaults),
      hasSchedule: Boolean(task.keyword.schedule),
      keywordId: task.keyword.id,
      keywordPublicId: task.keyword.publicId,
      keywordTargetUrl: task.keyword.targetUrl,
      previousRankingUrl: previous?.rankingUrl ?? null,
      previousRaw: previous?.raw ?? null,
      persistenceFinalize: terminalizeLease(lease, "completed"),
      persistenceGuard: (tx) => assertQueuedPersistenceLease(tx, lease),
      projectId: task.keyword.projectId,
      transactionOptions: queuedResultTransactionOptions,
    },
    {
      providerCostCents: reportedCost > 0 ? reportedCost : undefined,
      rankCheck: {
        billingUnits: queuedBillingUnits(requestedDepth),
        checkedAt,
        costCents,
        estimatedCostCents:
          costCents > 0
            ? null
            : dataForSeoQueuedEstimate(
                task.batch.priority === "normal" ? "normal" : "high",
                requestedDepth,
              ),
        keywordId: task.keyword.id,
        organicRanks: organicDomainRanksFromResults(rawPayload.organic_results),
        position: dataForSeoItemPosition(rankingItem),
        previousPosition: previous?.position ?? null,
        provider: "dataforseo",
        rankingUrl: rankingItem?.url ?? null,
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

async function reconcileTaskWithRankCheck(lease: QueuedPersistenceLease) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.queuedRankCheckTask.findUniqueOrThrow({
      select: { rankCheck: { select: { status: true } }, state: true },
      where: { id: lease.taskId },
    });
    const state = queuedTaskStateForRankCheck(task.rankCheck.status);
    if (!state) return task.state;
    return transitionQueuedPersistenceLease(lease, ACTIVE_QUEUED_TASK_STATES, { state }, tx);
  }, queuedResultTransactionOptions);
}

async function transitionLease(
  lease: QueuedPersistenceLease,
  data: { error?: string | null; state: string },
  transactionOptions = queuedResultTransactionOptions,
) {
  return prisma.$transaction(
    (tx) => transitionQueuedPersistenceLease(lease, ["persisting"], data, tx),
    transactionOptions,
  );
}

async function releaseAbortedLease(task: QueuedTask, lease: QueuedPersistenceLease) {
  await transitionLease(
    lease,
    {
      state: task.error ? "provider_failed" : "ready",
    },
    queuedResultReleaseTransactionOptions,
  );
}

async function persistTask(taskId: string, options: QueuedResultAttemptOptions) {
  const claimed = await claimTask(taskId);
  if (!claimed) return;
  const { lease, task } = claimed;
  const attempt = queuedResultAttemptSignal(options.signal);

  try {
    throwIfQueuedResultAborted(attempt.signal);
    if (task.rankCheck.status !== "running") {
      await reconcileTaskWithRankCheck(lease);
      return;
    }
    if (task.error) {
      await persistProviderFailure(task, task.error, Number(task.costCents ?? 0), lease);
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
    const costCents = chargedProviderCostCents(error) ?? Number(task.costCents ?? 0);
    try {
      await persistProviderFailure(task, message, costCents, lease);
    } catch (failure) {
      if (!(failure instanceof RankCheckClosedBeforePersistenceError)) throw failure;
      await reconcileTaskWithRankCheck(lease);
    }
  } finally {
    attempt.clear();
  }
}

export async function persistReadyQueuedRankCheckTasks(
  batchId: string,
  options: QueuedResultAttemptOptions = {},
) {
  const authorization = await authorizeQueuedRankCheckBatch(batchId);
  if (!authorization.allowPaidRetrieval) {
    return deferQueuedRankCheckBatch(
      batchId,
      `Queued result retrieval is disabled in ${authorization.mode} scheduler mode.`,
    );
  }
  const tasks = await prisma.queuedRankCheckTask.findMany({
    orderBy: { id: "asc" },
    select: { id: true },
    where: { batchId, state: { in: ["persisting", "provider_failed", "ready"] } },
  });
  const completed = await runQueuedResultTasksWithinDeadline(
    tasks.map((task) => task.id),
    options,
    persistTask,
  );
  if (!completed) return deferQueuedRankCheckBatch(batchId, QUEUED_DEADLINE_REASON);
  return finalizeQueuedBatchState(batchId);
}
