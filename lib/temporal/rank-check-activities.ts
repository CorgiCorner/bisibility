import "server-only";

import { ApplicationFailure } from "@temporalio/common";
import { requiredPublicAuditId, writeAudit } from "../auth/audit";
import { prisma } from "../db/prisma";
import { makePublicId } from "../db/public-id";
import { ProjectReadOnlyError } from "../deployment/project-write-mode";
import { loadProviderRateContext } from "../provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "../provider-rates/resolver";
import { ProviderRateLimitedError } from "../providers/rate-limit";
import { isBudgetExhaustedError } from "../rank-check/budget";
import { estimatedRankCheckCostCents } from "../rank-check/default-cost";
import { runKeywordCheckWithFallback } from "../rank-check/fallback";
import { RankCheckClosedBeforePersistenceError } from "../rank-check/persistence-errors";
import { serpProviderChainOrderBy } from "../rank-check/provider-chain-order";
import { persistFailedRankCheck } from "../rank-check/runner";
import { trackedProjectDomain } from "../schemas/project";
import { resolveEffectiveSerpDepth } from "../serp/markets";
import {
  AUTOMATIC_EXECUTION_DISABLED_FAILURE,
  BUDGET_EXHAUSTED_FAILURE,
  type CreateRunningRankCheckActivityInput,
  type DiscardRankCheckActivityInput,
  type FailRankCheckActivityInput,
  type FailRankCheckActivityResult,
  PROJECT_READ_ONLY_FAILURE,
  PROVIDER_RATE_LIMITED_FAILURE,
  RANK_CHECK_CLOSED_FAILURE,
  type RankCheckActivityInput,
  type RankCheckActivitySuccess,
  type RunningRankCheckActivityResult,
  type RunRankCheckActivityInput,
} from "./rank-check-activity-contract";
import { authorizeRankCheckExecutionActivity } from "./rank-check-mode-activities";
import { notifyDeferredRankCheckOps, notifyFailedRankCheckOps } from "./rank-check-ops";

export * from "./rank-check-activity-contract";
export { authorizeRankCheckExecutionActivity } from "./rank-check-mode-activities";

async function runningReservation(input: RankCheckActivityInput) {
  const [connection, keyword] = await Promise.all([
    prisma.providerConnection.findFirst({
      orderBy: serpProviderChainOrderBy(),
      select: { costPerCheckCents: true, id: true, projectId: true, provider: true },
      where: {
        enabled: true,
        kind: "serp",
        project: { keywords: { some: { id: input.keywordId } } },
        ...(input.providerId ? { provider: input.providerId } : {}),
        status: "connected",
      },
    }),
    prisma.keyword.findUnique({
      select: {
        publicId: true,
        project: { select: { defaults: { select: { serpDepth: true } } } },
        schedule: { select: { serpDepth: true } },
      },
      where: { id: input.keywordId },
    }),
  ]);
  const depth = resolveEffectiveSerpDepth({
    projectDepth: keyword?.project.defaults?.serpDepth,
    requestedDepth: input.depth,
    scheduleDepth: keyword?.schedule?.serpDepth,
  });
  if (!keyword) throw new Error("Keyword not found.");
  const rateContext = connection
    ? await loadProviderRateContext(connection.id, "rank_check")
    : LIST_PROVIDER_RATE_CONTEXT;

  return {
    estimatedCostCents: estimatedRankCheckCostCents(
      connection?.provider,
      depth,
      connection?.costPerCheckCents,
      rateContext,
    ),
    projectId: connection?.projectId ?? null,
    keywordPublicId: keyword.publicId,
  };
}

export async function createRunningRankCheckActivity(
  input: CreateRunningRankCheckActivityInput,
): Promise<RunningRankCheckActivityResult> {
  const reservation = await runningReservation(input);
  // biome-ignore format: compact data keeps this activity module under the line cap.
  const data = {
    attemptCount: 0, checkedAt: new Date(), costCents: null, error: null,
    estimatedCostCents: reservation.estimatedCostCents,
    degradedToCountry: false,
    keywordId: input.keywordId, normalizationVersion: null, position: null, previousPosition: null,
    provider: input.providerId ?? "primary",
    rankingUrl: null, scheduleId: input.scheduleId, scheduledAt: input.scheduledAt,
    startedAt: new Date(), status: "running", trigger: input.trigger, viaFallback: false,
    workflowRunId: input.workflowRunId,
  };
  const createData = { ...data, publicId: makePublicId("check") };
  const rankCheck = await prisma.$transaction(async (tx) => {
    const persisted = input.rankCheckId
      ? await tx.rankCheck.update({
          data,
          select: { id: true, publicId: true },
          where: { id: input.rankCheckId },
        })
      : await tx.rankCheck.create({ data: createData, select: { id: true, publicId: true } });

    await writeAudit(
      {
        action: "rank_check.running",
        actorId: null,
        after: {
          estimatedCostCents: reservation.estimatedCostCents,
          keywordId: requiredPublicAuditId(reservation.keywordPublicId, "kw", "Rank-check"),
          provider: data.provider,
          status: "running",
        },
        projectId: reservation.projectId,
        targetId: requiredPublicAuditId(persisted.publicId, "check", "Rank-check"),
        targetType: "rank_check",
      },
      tx,
    );

    return persisted;
  });

  return { keywordId: input.keywordId, rankCheckId: rankCheck.id };
}

export async function discardRankCheckActivity(input: DiscardRankCheckActivityInput) {
  const rankCheck = await prisma.$transaction(async (tx) => {
    const deferred = await tx.rankCheck.update({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        deferredReason: input.reason,
        finishedAt: new Date(),
        normalizationVersion: null,
        status: "deferred",
        viaFallback: false,
      },
      select: {
        estimatedCostCents: true,
        id: true,
        publicId: true,
        keyword: { select: { id: true, projectId: true, publicId: true, text: true } },
        provider: true,
        scheduledAt: true,
        startedAt: true,
      },
      where: { id: input.rankCheckId },
    });

    await writeAudit(
      {
        action: "rank_check.deferred",
        actorId: null,
        after: {
          estimatedCostCents: Number(deferred.estimatedCostCents ?? 0),
          keywordId: requiredPublicAuditId(deferred.keyword.publicId, "kw", "Rank-check"),
          provider: deferred.provider,
          reason: input.reason,
          status: "deferred",
        },
        projectId: deferred.keyword.projectId,
        targetId: requiredPublicAuditId(deferred.publicId, "check", "Rank-check"),
        targetType: "rank_check",
      },
      tx,
    );

    return deferred;
  });
  await notifyDeferredRankCheckOps({
    keywordId: rankCheck.keyword.id,
    keywordText: rankCheck.keyword.text,
    projectId: rankCheck.keyword.projectId,
    provider: rankCheck.provider,
    reason: input.reason,
    scheduledAt: rankCheck.scheduledAt,
    startedAt: rankCheck.startedAt,
  });
  return { rankCheckId: rankCheck.id };
}

export async function failRankCheckActivity(
  input: FailRankCheckActivityInput,
): Promise<FailRankCheckActivityResult> {
  const keyword = await prisma.keyword.findUnique({
    select: {
      id: true,
      project: { select: { defaults: { select: { serpDepth: true } }, domain: true } },
      projectId: true,
      publicId: true,
      rankChecks: {
        orderBy: { checkedAt: "desc" },
        select: { position: true },
        take: 1,
        where: { status: "completed" },
      },
      schedule: { select: { serpDepth: true } },
      text: true,
    },
    where: { id: input.keywordId },
  });
  if (!keyword) {
    throw new Error("Keyword not found.");
  }

  const rankCheck = await persistFailedRankCheck({
    error: input.message,
    existingRankCheckId: input.rankCheckId,
    keywordId: keyword.id,
    keywordPublicId: keyword.publicId,
    keywordText: keyword.text,
    previousPosition: keyword.rankChecks[0]?.position ?? null,
    projectDomain: trackedProjectDomain(keyword.project.domain) ?? "",
    projectId: keyword.projectId,
    provider: input.providerId ?? "primary",
    requestedDepth: resolveEffectiveSerpDepth({
      projectDepth: keyword.project.defaults?.serpDepth,
      scheduleDepth: keyword.schedule?.serpDepth,
    }),
  }).catch((error) => {
    if (error instanceof RankCheckClosedBeforePersistenceError) return null;
    throw error;
  });
  if (!rankCheck) return { rankCheckId: input.rankCheckId };
  await notifyFailedRankCheckOps({
    keywordId: keyword.id,
    keywordText: keyword.text,
    projectId: keyword.projectId,
    provider: rankCheck.provider,
    providerAttemptCount: Array.isArray(rankCheck.attempts) ? rankCheck.attempts.length : null,
    scheduledAt: rankCheck.scheduledAt,
    startedAt: rankCheck.startedAt,
  });
  return { rankCheckId: rankCheck.id };
}

export async function runRankCheckActivity(
  input: RunRankCheckActivityInput,
): Promise<RankCheckActivitySuccess> {
  const authorization = authorizeRankCheckExecutionActivity({
    keywordId: input.keywordId,
    scheduleId: null,
    source: input.source,
  });
  if (!authorization.allowed) {
    throw ApplicationFailure.create({
      message: authorization.reason ?? "Automatic rank-check execution is disabled.",
      nonRetryable: true,
      type: AUTOMATIC_EXECUTION_DISABLED_FAILURE,
    });
  }
  let outcome: Awaited<ReturnType<typeof runKeywordCheckWithFallback>>;
  try {
    outcome = await runKeywordCheckWithFallback({
      depth: input.depth,
      keywordId: input.keywordId,
      providerId: input.providerId,
      rankCheckId: input.rankCheckId,
    });
  } catch (error) {
    if (error instanceof RankCheckClosedBeforePersistenceError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: RANK_CHECK_CLOSED_FAILURE,
      });
    }
    if (error instanceof ProviderRateLimitedError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: PROVIDER_RATE_LIMITED_FAILURE,
      });
    }
    if (error instanceof ProjectReadOnlyError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: PROJECT_READ_ONLY_FAILURE,
      });
    }
    if (isBudgetExhaustedError(error)) {
      throw ApplicationFailure.create({
        message: error instanceof Error ? error.message : "Rank check budget exhausted.",
        nonRetryable: true,
        type: BUDGET_EXHAUSTED_FAILURE,
      });
    }
    throw error;
  }

  return {
    attempts: outcome.attempts,
    checkedAt: outcome.rankCheck.checkedAt.toISOString(),
    costCents: Number(outcome.rankCheck.costCents ?? 0),
    keywordId: outcome.rankCheck.keywordId,
    position: outcome.rankCheck.position,
    provider: outcome.provider,
    rankCheckId: outcome.rankCheck.id,
    rankingUrl: outcome.rankCheck.rankingUrl,
  };
}
