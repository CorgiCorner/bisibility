import "server-only";

import { requiredPublicAuditId } from "@/lib/auth/audit";
import { deriveCheckAttemptSummary } from "@/lib/checks/attempts";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { Prisma } from "@/lib/generated/prisma/client";
import { notifyRankCheckFailed } from "@/lib/notifications/events";
import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { positiveCostCents } from "./cost";
import { writeRankCheckProviderCostEntry } from "./provider-cost-persistence";
import { updateRunningRankCheck, writeRankCheckAudit } from "./runner-persistence-shared";
import type { RankCheckFailureTarget as BaseRankCheckFailureTarget } from "./runner-persistence-types";

export type RankCheckFailureTarget = BaseRankCheckFailureTarget & {
  errorCode?: ProviderErrorCode;
};

export async function persistFailedRankCheckInTransaction(
  tx: Prisma.TransactionClient,
  target: RankCheckFailureTarget,
) {
  const checkedAt = target.checkedAt ?? new Date();
  const attempts = target.attempts?.length
    ? target.attempts.map(({ message, provider }) => ({ message, provider }))
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
    keywordId: target.keywordId,
    provider: target.provider,
    providerRequestId: target.providerRequestId,
    projectId: target.projectId,
    usage: target.providerUsage,
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
