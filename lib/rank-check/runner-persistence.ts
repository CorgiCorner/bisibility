import "server-only";

import { evaluateKeywordAlerts } from "@/lib/alerts/evaluate";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { deriveCheckAttemptSummary } from "@/lib/checks/attempts";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyRankCheckCompleted, notifyRankCheckFailed } from "@/lib/notifications/events";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/markets";
import { emitSignal } from "@/lib/signals/emit";
import { signalsForRankCheck } from "@/lib/signals/rank-check";
import { enqueueAlertDeliveries } from "@/lib/temporal/alert-delivery-client";
import { positiveCostCents } from "./cost";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";
import { writeRankCheckProviderCostEntry } from "./provider-cost-persistence";
import type { RankCheckFailureTarget, RankCheckPersistTarget } from "./runner-persistence-types";
import type { RankCheckRunResult } from "./runner-result";

export type {
  RankCheckFailureTarget,
  RankCheckPersistTarget,
} from "./runner-persistence-types";

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
async function updateRunningRankCheck(
  tx: Prisma.TransactionClient,
  rankCheckId: string,
  data: Prisma.RankCheckUpdateManyMutationInput,
) {
  const result = await tx.rankCheck.updateMany({
    data,
    where: { id: rankCheckId, status: "running" },
  });
  if (result.count === 0) {
    throw new RankCheckClosedBeforePersistenceError();
  }
  return {
    before: { status: "running" as const },
    rankCheck: await tx.rankCheck.findUniqueOrThrow({ where: { id: rankCheckId } }),
  };
}

async function writeRankCheckAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    after: unknown;
    before?: unknown;
    projectId?: string | null;
    rankCheckId: string;
    keywordPublicId: string;
  },
) {
  await writeAudit(
    {
      action: input.action,
      actorId: null,
      after: {
        keywordId: requiredPublicAuditId(input.keywordPublicId, "kw", "Rank-check"),
        ...(input.after as object),
      },
      before: input.before,
      projectId: input.projectId,
      targetId: requiredPublicAuditId(input.rankCheckId, "check", "Rank-check"),
      targetType: "rank_check",
    },
    tx,
  );
}

export async function persistRankCheck(
  target: RankCheckPersistTarget,
  result: RankCheckResult,
  dependencies: PersistRankCheckDependencies = defaultDependencies,
) {
  const attempts = target.attempts?.length ? target.attempts : Prisma.JsonNull;
  const attemptSummary = deriveCheckAttemptSummary(
    attempts,
    result.rankCheck.provider,
    "completed",
  );
  const data = {
    ...result.rankCheck,
    ...attemptSummary,
    error: null,
    estimatedCostCents: result.rankCheck.estimatedCostCents ?? null,
    attempts,
    finishedAt: new Date(),
    organicRanks: result.rankCheck.organicRanks ?? Prisma.DbNull,
    raw: rankCheckRawValue(result.rankCheck.raw),
    status: "completed",
  };
  const rankCheck = await prisma.$transaction(async (tx) => {
    await target.persistenceGuard?.(tx);
    const existing = target.existingRankCheckId
      ? await updateRunningRankCheck(tx, target.existingRankCheckId, data)
      : null;
    const persisted =
      existing?.rankCheck ??
      (await tx.rankCheck.create({ data: { ...data, publicId: makePublicId("check") } }));

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
      await writeRankCheckProviderCostEntry(tx, {
        connectionId: target.connectionId,
        costCents: result.providerCostCents,
        failed: false,
        projectId: target.projectId,
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
      targetUrl: target.keywordTargetUrl ?? null,
    });
    for (const signal of signals) {
      await emitSignal(signal, tx);
    }

    await target.persistenceFinalize?.(tx);
    return persisted;
  }, target.transactionOptions);
  const currentSnapshot = {
    checkedAt: result.rankCheck.checkedAt,
    normalizationVersion: result.rankCheck.normalizationVersion,
    position: result.rankCheck.position,
    rankCheckId: rankCheck.id,
    rankingUrl: result.rankCheck.rankingUrl,
    raw: rankCheck.raw,
    requestedDepth: result.rankCheck.requestedDepth,
  };
  const alerts = await evaluateKeywordAlerts(
    target.keywordId,
    { position: result.rankCheck.previousPosition, raw: target.previousRaw },
    currentSnapshot,
    {
      comparisonAllowed: result.comparisonAllowed,
      deliveryMode: rankCheck.trigger === "scheduled" ? "deferred" : "immediate",
    },
  ).catch(() => []);
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
  const attempts = target.attempts?.length ? target.attempts : Prisma.JsonNull;
  const attemptSummary = deriveCheckAttemptSummary(attempts, target.provider, "failed");
  const data = {
    ...attemptSummary,
    billingUnits: null,
    checkedAt,
    costCents: positiveCostCents(target.providerCostCents) || null,
    error: target.error,
    estimatedCostCents: null,
    finishedAt: new Date(),
    attempts,
    keywordId: target.keywordId,
    normalizationVersion: null,
    position: null,
    previousPosition: target.previousPosition ?? null,
    provider: target.provider,
    requestedDepth: target.requestedDepth ?? DEFAULT_SERP_DEPTH,
    rankingUrl: null,
    raw: Prisma.JsonNull,
    status: "failed",
  };
  await target.persistenceGuard?.(tx);
  const existing = target.existingRankCheckId
    ? await updateRunningRankCheck(tx, target.existingRankCheckId, data)
    : null;
  const persisted =
    existing?.rankCheck ??
    (await tx.rankCheck.create({ data: { ...data, publicId: makePublicId("check") } }));

  await writeRankCheckProviderCostEntry(tx, {
    connectionId: target.connectionId,
    costCents: target.providerCostCents,
    failed: true,
    projectId: target.projectId,
  });

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
  return persisted;
}

export async function persistFailedRankCheck(target: RankCheckFailureTarget) {
  const rankCheck = await prisma.$transaction(
    (tx) => persistFailedRankCheckInTransaction(tx, target),
    target.transactionOptions,
  );
  const checkedAt = target.checkedAt ?? rankCheck.checkedAt;
  if (target.projectId && target.keywordPublicId && target.keywordText && target.projectDomain) {
    await notifyRankCheckFailed({
      code: "provider_failed",
      failedAt: checkedAt,
      keywordId: target.keywordId,
      keywordPublicId: target.keywordPublicId,
      keywordText: target.keywordText,
      message: target.error,
      projectDomain: target.projectDomain,
      projectId: target.projectId,
    }).catch(() => undefined);
  }

  return rankCheck;
}
