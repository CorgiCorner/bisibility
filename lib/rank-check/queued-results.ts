import { keywordMembershipSchedule } from "@/lib/keywords/schedule-membership";
import {
  persistProviderFailure,
  queuedFailureOutcome,
} from "@/lib/rank-check/queued-results-failure";
import { persistQueuedBatchTasks } from "./queued-result-batch";
import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadDefinitionComparablePrevious } from "@/lib/measurement-definitions/worker-comparable";
import { queuedDataForSeoObservation } from "@/lib/observation/queued-dataforseo";
import { chargedProviderCostCents } from "@/lib/providers/call-error";
import { DataForSeoError } from "@/lib/providers/serp/dataforseo-errors";
import {
  DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS,
  dataForSeoOrganicDecision,
  dataForSeoRawPayload,
  dataForSeoResponseCostCents,
} from "@/lib/providers/serp/dataforseo-payload";
import { dataForSeoQueuedTaskTag } from "@/lib/providers/serp/dataforseo-queued";
import { requireDeterminateOrganicResult } from "@/lib/providers/serp/payload-contract-error";
import { UnresolvedRedirectError } from "@/lib/providers/serp/unresolved-redirect-error";
import { rankCheckCostCents } from "@/lib/rank-check/cost";
import { CURRENT_RANK_NORMALIZATION_VERSION } from "@/lib/rank-check/normalization-version";
import { organicDomainRanksFromV2Results } from "@/lib/rank-check/organic-ranks";
import { RankCheckClosedBeforePersistenceError } from "@/lib/rank-check/persistence-errors";
import { queuedBatchAttribution } from "@/lib/rank-check/queued-attribution";
import {
  explicitQueuedGetCostCents,
  queuedHostedRecovery,
} from "@/lib/rank-check/queued-hosted-results";
import { recoverOwnQueuedResult } from "@/lib/rank-check/queued-own-usage";
import {
  assertQueuedPersistenceLease,
  type QueuedPersistenceLease,
} from "@/lib/rank-check/queued-persistence-lease";
import {
  type QueuedResultAttemptOptions,
  QueuedResultDeadlineReachedError,
  queuedResultAttemptSignal,
  queuedResultTransactionOptions,
  throwIfQueuedResultAborted,
} from "@/lib/rank-check/queued-result-attempt";
import {
  claimQueuedResultTask,
  terminalizeLease,
} from "@/lib/rank-check/queued-result-finalization";
import {
  reconcileTaskWithRankCheck,
  releaseAbortedLease,
  transitionLease,
} from "@/lib/rank-check/queued-results-lease";
import type { QueuedTask } from "@/lib/rank-check/queued-results-load";
import { persistRankCheck } from "@/lib/rank-check/runner";
import { computeNextCheckAt } from "@/lib/rank-check/schedule";
import { queuedPartialResult } from "./queued-partial-result";
import { QueuedSourceEvidenceError } from "./queued-source-evidence";
import { collectQueuedSource, requiredQueuedDefinition } from "./queued-source-result";

async function persistProviderResult(
  task: QueuedTask,
  lease: QueuedPersistenceLease,
  signal: AbortSignal,
  options: QueuedResultAttemptOptions,
) {
  if (!task.providerTaskId) throw new Error("Queued provider task is missing its id.");
  const collected = await collectQueuedSource(task, lease, signal, options);
  if (collected === "pending") return collected;
  const { connection, recovery, own, data, providerTask, items, resolution } = collected;
  const terminalCostCents =
    recovery || own
      ? explicitQueuedGetCostCents(data, task.providerTaskId)
      : dataForSeoResponseCostCents(data);
  if ((recovery || own) && terminalCostCents === null) return "pending";
  const partialDefinition =
    providerTask.status_code === 40106 ? requiredQueuedDefinition(collected.definition) : null;
  const partial =
    providerTask && partialDefinition
      ? queuedPartialResult(
          providerTask,
          partialDefinition.request.domain,
          partialDefinition.request.depth,
          items,
        )
      : null;
  const providerFailed =
    !partial?.accountingSuccess &&
    (!providerTask ||
      (providerTask.status_code !== 20000 &&
        providerTask.status_code !== DATA_FOR_SEO_NO_SEARCH_RESULTS_STATUS));
  if (own) await recoverOwnQueuedResult(task, data, providerFailed);
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
  // Usage is settled first: a result that could not be retained still fails its check cleanly.
  if (collected.evidenceFailure) throw collected.evidenceFailure;
  const decide = () => {
    const { request } = requiredQueuedDefinition(collected.definition);
    return partial?.decision ?? dataForSeoOrganicDecision(items, request.domain, request.depth);
  };
  if (
    resolution?.resolutions.some((row) => row.status === "unresolved") &&
    decide().outcome === "indeterminate"
  )
    throw new UnresolvedRedirectError(terminalCostCents, {
      redirect_resolutions: resolution.resolutions,
    } as unknown as Prisma.InputJsonObject);
  if ((!partial?.success && providerFailed) || !providerTask) {
    throw new DataForSeoError(
      partial?.error ?? providerTask?.status_message ?? "DataForSEO queued result was unavailable.",
      false,
      undefined,
      terminalCostCents === 0 ? 0 : terminalCostCents,
    );
  }
  const checkedAt = new Date();
  const definition = requiredQueuedDefinition(collected.definition);
  const requestedDepth = definition.request.depth;
  const decision = requireDeterminateOrganicResult("DataForSEO", decide());
  const reportedCost = recovery
    ? frozenCost
    : terminalCostCents !== null && terminalCostCents > 0
      ? terminalCostCents
      : task.costCents === null
        ? null
        : Number(task.costCents);
  const costCents = rankCheckCostCents(reportedCost);
  const previous = await loadDefinitionComparablePrevious(
    definition,
    queuedDataForSeoObservation(
      providerTask,
      items,
      requestedDepth,
      checkedAt,
      decision.outcome === "match",
      definition.request,
    ),
    decision.position,
    checkedAt,
  );
  const expectedUrl = { url: definition.request.targetUrl };
  const origin = queuedBatchAttribution(task.batch);
  const schedule = keywordMembershipSchedule(
    task.keyword.checkSchedule,
    task.keyword.id,
    task.keyword.project.defaults?.timezone ?? "UTC",
    checkedAt,
  );
  const rawPayload = dataForSeoRawPayload(items, decision);
  const raw = {
    ...rawPayload,
    ...(resolution ? { redirect_resolutions: resolution.resolutions } : {}),
  } as unknown as Prisma.InputJsonObject;
  await persistRankCheck(
    // biome-ignore format: keep the queue persistence module under its enforced line cap.
    { queuedTaskId: task.id, attempts: [], connectionId: connection.id, existingRankCheckId: task.rankCheckId, expectedUrlAtCheck: expectedUrl.url, hasDefaults: Boolean(task.keyword.project.defaults), hasSchedule: Boolean(task.keyword.schedule), keywordId: task.keyword.id, keywordPublicId: task.keyword.publicId, keywordTargetUrl: definition.request.targetUrl, predecessorRankCheckId: previous?.id ?? null, previousRankingUrl: previous?.rankingUrl ?? null, previousRaw: previous?.raw ?? null, persistenceFinalize: terminalizeLease(lease, "completed"), persistenceGuard: (tx) => assertQueuedPersistenceLease(tx, lease), projectId: task.keyword.projectId, providerRequestId: task.providerTaskId, providerUsage: { context: { correlationId: task.id, feature: "rank_check", projectId: task.keyword.projectId, source: origin.source, trigger: origin.trigger }, ...(origin.credential ? { credential: origin.credential } : {}), tag: task.providerTag ?? dataForSeoQueuedTaskTag(task.id) }, transactionOptions: queuedResultTransactionOptions },
    {
      definitionBindingId: definition.id,
      recoveryContextHash: task.recoveryContextHash ?? undefined,
      comparisonAllowed: previous !== null,
      providerCostCents: reportedCost !== null && reportedCost > 0 ? reportedCost : undefined,
      rankCheck: {
        observation: queuedDataForSeoObservation(
          providerTask,
          items,
          requestedDepth,
          checkedAt,
          decision.outcome === "match",
          definition.request,
        ),
        billingUnits: 1,
        checkedAt,
        costCents,
        estimatedCostCents:
          costCents !== null || task.rankCheck.estimatedCostCents == null
            ? null
            : Number(task.rankCheck.estimatedCostCents),
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
  const claimed = await claimQueuedResultTask(taskId);
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
    const result = await persistProviderResult(task, lease, attempt.signal, options);
    if (result === "pending") {
      await transitionLease(lease, { state: "ready" });
      return;
    }
  } catch (error) {
    if (attempt.signal.aborted) {
      await releaseAbortedLease(task, lease).catch(() => undefined);
      throw attempt.signal.reason ?? error;
    }
    // A transient evidence store failure defers this task alone; permanent ones fail it below.
    if (error instanceof QueuedSourceEvidenceError && !error.permanent) {
      await releaseAbortedLease(task, lease).catch(() => undefined);
      return;
    }
    if (error instanceof QueuedResultDeadlineReachedError) {
      await releaseAbortedLease(task, lease);
      return "deadline";
    }
    if (error instanceof RankCheckClosedBeforePersistenceError) {
      await reconcileTaskWithRankCheck(lease);
      return;
    }
    const outcome = queuedFailureOutcome(error, task.id);
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
      await persistProviderFailure(
        task,
        outcome.message,
        costCents,
        lease,
        outcome.errorCode,
        "raw" in outcome ? outcome.raw : undefined,
      );
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
  return persistQueuedBatchTasks(batchId, options, persistTask);
}
