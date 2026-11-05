import { queueCheckSummary } from "@/lib/notifications/check-summaries/triggers";
import { notificationTransaction } from "@/lib/notifications/transaction";
import "server-only";

import { recordAlertEvaluationIntent, settleRankCheckAlerts } from "@/lib/alerts/evaluation-intent";
import { requiredPublicAuditId } from "@/lib/auth/audit";
import { deriveCheckAttemptSummary } from "@/lib/checks/attempts";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyRankCheckCompleted, notifyRankCheckFailed } from "@/lib/notifications/events";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import { persistRankCheckObservation } from "@/lib/observation/persist";
import { captureRecoveryCandidate } from "@/lib/provider-evidence/recovery/capture";
import type { RankCheckFailureCode } from "@/lib/rank-check/failure-presentation";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { emitSignal } from "@/lib/signals/emit";
import { signalsForRankCheck } from "@/lib/signals/rank-check";
import { enqueueAlertDeliveries } from "@/lib/temporal/alert-delivery-client";
import { positiveCostCents } from "./cost";
import { consumeRankResult, retainRankResult } from "./recovery-evidence";
import { updateRunningRankCheck, writeRankCheckAudit } from "./runner-persistence-shared";
import type {
  RankCheckFailureTarget as BaseRankCheckFailureTarget,
  RankCheckPersistTarget,
} from "./runner-persistence-types";
import type { RankCheckRunResult } from "./runner-result";
import { applyRunItemTransition } from "./runs/items";

export type { RankCheckPersistTarget } from "./runner-persistence-types";
export type RankCheckFailureTarget = BaseRankCheckFailureTarget & {
  errorCode?: RankCheckFailureCode;
};
type RankCheckResult = RankCheckRunResult;
export type PersistRankCheckDependencies = {
  enqueueDeliveries: typeof enqueueAlertDeliveries;
};
const defaultDependencies: PersistRankCheckDependencies = {
  enqueueDeliveries: enqueueAlertDeliveries,
};
function rankCheckRawValue(raw: RankCheckResult["rankCheck"]["raw"]) {
  return raw ?? Prisma.JsonNull;
}
export async function persistRankCheck(
  target: RankCheckPersistTarget,
  result: RankCheckResult,
  dependencies: PersistRankCheckDependencies = defaultDependencies,
) {
  const retained = await retainRankResult(target, result).catch(() => {
    console.error("[rank-check] result recovery retention failed");
    return false;
  });
  const { observation, ...rankCheckFields } = result.rankCheck;
  const attempts = target.attempts?.length
    ? target.attempts.map(({ message, provider, reason }) => ({
        message,
        provider,
        ...(reason ? { reason } : {}),
      }))
    : Prisma.JsonNull;
  const attemptSummary = deriveCheckAttemptSummary(
    attempts,
    result.rankCheck.provider,
    "completed",
  );
  const data = {
    ...rankCheckFields,
    comparisonAllowed: result.comparisonAllowed,
    ...attemptSummary,
    error: null,
    errorCode: null,
    estimatedCostCents: result.rankCheck.estimatedCostCents ?? null,
    expectedUrlAtCheck: target.expectedUrlAtCheck ?? target.keywordTargetUrl ?? null,
    attempts,
    finishedAt: new Date(),
    organicRanks: result.rankCheck.organicRanks ?? Prisma.DbNull,
    raw: rankCheckRawValue(result.rankCheck.raw),
    status: "completed",
  };
  const rankCheck = await notificationTransaction(async (tx) => {
    await target.persistenceGuard?.(tx);
    const terminalData = { ...data, terminalPersistedAt: new Date() };
    const existing = target.existingRankCheckId
      ? await updateRunningRankCheck(tx, target.existingRankCheckId, terminalData)
      : null;
    const persisted =
      existing?.rankCheck ??
      (await tx.rankCheck.create({ data: { ...terminalData, publicId: makePublicId("check") } }));
    await persistRankCheckObservation(
      tx,
      observation,
      target.projectId,
      persisted.id,
      result.definitionBindingId,
    );
    await applyRunItemTransition(tx, { rankCheckId: persisted.id, to: "completed" });
    if (target.hasSchedule) {
      await tx.keywordSchedule.update({
        data: result.scheduleUpdate,
        where: { keywordId: target.keywordId },
      });
    } else if (target.hasDefaults) {
      await tx.projectDefaults.update({
        data: { lastCheckedAt: result.scheduleUpdate.lastCheckedAt },
        where: { projectId: target.projectId },
      });
    }
    if (target.connectionId) {
      await tx.providerConnection.update({
        data: { lastUsedAt: result.rankCheck.checkedAt },
        where: { id: target.connectionId },
      });
    }
    await writeRankCheckAudit(tx, {
      action: "rank_check.completed",
      after: {
        billingUnits: result.rankCheck.billingUnits,
        checkedAt: result.rankCheck.checkedAt,
        costCents: result.rankCheck.costCents,
        position: result.rankCheck.position,
        provider: result.rankCheck.provider,
        status: "completed",
      },
      before: existing?.before,
      projectId: target.projectId,
      rankCheckId: requiredPublicAuditId(persisted.publicId, "check", "Rank-check"),
      keywordPublicId: target.keywordPublicId,
    });
    const signals = signalsForRankCheck({
      checkedAt: result.rankCheck.checkedAt,
      comparisonAllowed: result.comparisonAllowed,
      keywordId: target.keywordId,
      position: result.rankCheck.position,
      previousPosition: result.rankCheck.previousPosition,
      previousRankingUrl: target.previousRankingUrl ?? null,
      projectId: target.projectId,
      rankCheckId: persisted.id,
      requestedDepth: result.rankCheck.requestedDepth,
      rankingUrl: result.rankCheck.rankingUrl,
      targetUrl: target.expectedUrlAtCheck ?? target.keywordTargetUrl ?? null,
    });
    for (const signal of signals) {
      await emitSignal(signal, tx);
    }
    await captureRecoveryCandidate(tx, persisted.id);
    await target.persistenceFinalize?.(tx);
    if (retained) await consumeRankResult(tx, persisted.id);
    queueCheckSummary(tx, persisted.id);
    await recordAlertEvaluationIntent(tx, persisted.id, target.predecessorRankCheckId ?? null);
    return persisted;
  }, target.transactionOptions);
  await publishOperationChanged({ projectId: target.projectId }).catch(() => undefined);
  const alerts = await settleRankCheckAlerts(target, result, rankCheck);
  if (rankCheck.trigger !== "scheduled" && alerts.length > 0) {
    // The worker sweep recovers alerts when the best-effort Temporal kick is unavailable.
    await dependencies.enqueueDeliveries(alerts.map((alert) => alert.id)).catch(() => undefined);
  }
  await notifyRankCheckCompleted({
    checkedAt: result.rankCheck.checkedAt,
    keywordId: target.keywordId,
    position: result.rankCheck.position,
    previousPosition: result.comparisonAllowed ? result.rankCheck.previousPosition : null,
    projectId: target.projectId,
    rankCheckId: rankCheck.id,
  }).catch(() => undefined);
  return rankCheck;
}
export async function persistFailedRankCheckInTransaction(
  tx: Prisma.TransactionClient,
  target: RankCheckFailureTarget,
) {
  const checkedAt = target.checkedAt ?? new Date();
  const attempts = target.attempts?.length
    ? target.attempts.map(({ message, provider, reason }) => ({
        message,
        provider,
        ...(reason ? { reason } : {}),
      }))
    : Prisma.JsonNull;
  const attemptSummary = deriveCheckAttemptSummary(attempts, target.provider, "failed");
  const data = {
    ...attemptSummary,
    billingUnits: null,
    checkedAt,
    costCents: positiveCostCents(target.providerCostCents) || null,
    error: target.error,
    errorCode: target.errorCode ?? null,
    estimatedCostCents: null,
    expectedUrlAtCheck: target.expectedUrlAtCheck ?? null,
    comparisonAllowed: false,
    terminalPersistedAt: new Date(),
    finishedAt: new Date(),
    attempts,
    keywordId: target.keywordId,
    normalizationVersion: null,
    position: null,
    previousPosition: target.previousPosition ?? null,
    provider: target.provider,
    requestedDepth: target.requestedDepth ?? DEFAULT_SERP_DEPTH,
    rankingUrl: null,
    raw: target.raw ?? Prisma.JsonNull,
    status: "failed",
  };
  await target.persistenceGuard?.(tx);
  if (target.existingRankCheckId)
    await captureRecoveryCandidate(tx, target.existingRankCheckId, { finishedAt: data.finishedAt });
  const existing = target.existingRankCheckId
    ? await updateRunningRankCheck(tx, target.existingRankCheckId, data)
    : null;
  const persisted =
    existing?.rankCheck ??
    (await tx.rankCheck.create({ data: { ...data, publicId: makePublicId("check") } }));
  await applyRunItemTransition(tx, { rankCheckId: persisted.id, to: "failed" });
  await writeRankCheckAudit(tx, {
    action: "rank_check.failed",
    after: {
      attemptCount: attemptSummary.attemptCount,
      checkedAt,
      error: target.error,
      provider: target.provider,
      status: "failed",
    },
    before: existing?.before,
    projectId: target.projectId,
    rankCheckId: requiredPublicAuditId(persisted.publicId, "check", "Rank-check"),
    keywordPublicId: target.keywordPublicId,
  });
  await target.persistenceFinalize?.(tx);
  queueCheckSummary(tx, persisted.id);
  return persisted;
}
export async function persistFailedRankCheck(target: RankCheckFailureTarget) {
  const rankCheck = await notificationTransaction(
    (tx) => persistFailedRankCheckInTransaction(tx, target),
    target.transactionOptions,
  );
  if (target.projectId)
    await publishOperationChanged({ projectId: target.projectId }).catch(() => undefined);
  const checkedAt = target.checkedAt ?? rankCheck.checkedAt;
  if (target.projectId && target.keywordPublicId && target.keywordText && target.projectDomain) {
    await notifyRankCheckFailed({
      code: target.errorCode ?? "provider_transient",
      failedAt: checkedAt,
      keywordId: target.keywordId,
      keywordPublicId: target.keywordPublicId,
      keywordText: target.keywordText,
      message: target.error,
      projectDomain: target.projectDomain,
      projectId: target.projectId,
      rankCheckId: requiredPublicAuditId(rankCheck.publicId, "check", "Rank-check"),
    }).catch(() => undefined);
  }
  return rankCheck;
}
