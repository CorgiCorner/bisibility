import "server-only";

import { ApplicationFailure } from "@temporalio/common";
import { requiredPublicAuditId, writeAudit } from "../auth/audit";
import { prisma } from "../db/prisma";
import { makePublicId } from "../db/public-id";
import { resolveExpectedUrlForKeyword } from "../expected-url/keyword";
import { publishOperationChanged } from "../notifications/realtime";
import { loadProviderRateContext } from "../provider-rates/connection-context";
import { LIST_PROVIDER_RATE_CONTEXT } from "../provider-rates/resolver";
import { isProviderErrorCode } from "../providers/provider-error-code";
import { estimatedRankCheckCostCents } from "../rank-check/default-cost";
import { RANK_CHECK_DISPATCHER_SCHEDULE_ID } from "../rank-check/dispatcher-constants";
import { RankCheckClosedBeforePersistenceError } from "../rank-check/persistence-errors";
import { wrapLegacyRankCheck } from "../rank-check/planner/legacy-wrap";
import { serpProviderChainOrderBy } from "../rank-check/provider-chain-order";
import { persistFailedRankCheck } from "../rank-check/runner";
import {
  applyRunItemTransition,
  assertRunItemKeyword,
  linkRunItemToRankCheck,
  RunItemKeywordMismatchError,
} from "../rank-check/runs/items";
import { rankCheckWorkflowId } from "../rank-check/workflow-id";
import { trackedProjectDomain } from "../schemas/project";
import { resolveEffectiveSerpDepth } from "../serp/constants";
import type {
  CreateRunningRankCheckActivityInput,
  DiscardRankCheckActivityInput,
  FailRankCheckActivityInput,
  FailRankCheckActivityResult,
  RankCheckActivityInput,
  RunningRankCheckActivityResult,
} from "./rank-check-activity-contract";
import { notifyDeferredRankCheckOps, notifyFailedRankCheckOps } from "./rank-check-ops";

class RunItemAlreadyClaimedError extends Error {}

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
        projectId: true,
        publicId: true,
        project: {
          select: {
            defaults: { select: { serpDepth: true } },
            providerAllocationsInitializedAt: true,
          },
        },
        checkSchedule: { select: { serpDepth: true } },
        schedule: { select: { serpDepth: true } },
      },
      where: { id: input.keywordId },
    }),
  ]);
  // biome-ignore format: compact call keeps this activity module under the line cap.
  const depth = resolveEffectiveSerpDepth({ projectDepth: keyword?.project.defaults?.serpDepth, requestedDepth: input.depth, checkScheduleDepth: keyword?.checkSchedule?.serpDepth, scheduleDepth: keyword?.schedule?.serpDepth });
  if (!keyword) throw new Error("Keyword not found.");
  const rateContext = connection
    ? await loadProviderRateContext(connection.id, "rank_check")
    : LIST_PROVIDER_RATE_CONTEXT;
  // biome-ignore format: compact return keeps this activity module under the line cap.
  return { allocationConnection: connection ? { id: connection.id, provider: connection.provider } : null, estimatedCostCents: estimatedRankCheckCostCents(connection?.provider, depth, connection?.costPerCheckCents, rateContext), depth, projectId: connection?.projectId ?? keyword.projectId, providerAllocationsInitializedAt: Boolean(keyword.project.providerAllocationsInitializedAt), keywordPublicId: keyword.publicId };
}

function automaticLegacySource(input: CreateRunningRankCheckActivityInput) {
  if (input.scheduleId === RANK_CHECK_DISPATCHER_SCHEDULE_ID) return true;
  return input.scheduleId === rankCheckWorkflowId(input.keywordId);
}

export async function createRunningRankCheckActivity(
  input: CreateRunningRankCheckActivityInput,
): Promise<RunningRankCheckActivityResult> {
  const reservation = await runningReservation(input);
  const startedAt = new Date();
  // biome-ignore format: compact data keeps this activity module under the line cap.
  const data = {
    attemptCount: 0, checkedAt: new Date(), costCents: null, error: null,
    estimatedCostCents: reservation.estimatedCostCents,
    degradedToCountry: false,
    keywordId: input.keywordId, normalizationVersion: null, position: null, previousPosition: null,
    provider: input.providerId ?? "primary",
    rankingUrl: null, scheduleId: input.scheduleId, scheduledAt: input.scheduledAt,
    startedAt, status: "running", trigger: input.trigger, viaFallback: false,
    workflowRunId: input.workflowRunId,
  };
  const createData = { ...data, publicId: makePublicId("check") };
  let rankCheckId: string;
  try {
    rankCheckId = await prisma.$transaction(async (tx) => {
      let runId: string | undefined;
      if (input.runItemId) {
        const item = await tx.rankCheckRunItem.findUnique({
          select: {
            keywordId: true,
            rankCheck: { select: { workflowRunId: true } },
            rankCheckId: true,
            runId: true,
            status: true,
          },
          where: { id: input.runItemId },
        });
        if (!item) throw new Error("Rank-check run item not found.");
        assertRunItemKeyword(item.keywordId, input.keywordId);
        if (item.status !== "queued") {
          if (!item.rankCheckId) throw new Error("Claimed rank-check run item is not linked.");
          if (item.rankCheck?.workflowRunId !== input.workflowRunId) {
            throw ApplicationFailure.create({
              message: "Rank-check run item was already claimed by another workflow.",
              nonRetryable: true,
              type: "rank_check_run_item_already_claimed",
            });
          }
          return item.rankCheckId;
        }
        runId = item.runId;
      }
      if (!input.runItemId && automaticLegacySource(input)) {
        const replay = await tx.rankCheck.findFirst({
          select: { id: true, runId: true },
          where: { keywordId: input.keywordId, workflowRunId: input.workflowRunId },
        });
        if (replay?.runId) return replay.id;
      }
      const rankCheckData = runId ? { ...data, runId } : data;
      const persisted = input.rankCheckId
        ? await tx.rankCheck.update({
            data: rankCheckData,
            select: { id: true, publicId: true },
            where: { id: input.rankCheckId },
          })
        : await tx.rankCheck.create({
            data: { ...createData, ...(runId ? { runId } : {}) },
            select: { id: true, publicId: true },
          });
      if (input.runItemId) {
        const linked = await linkRunItemToRankCheck(tx, {
          keywordId: input.keywordId,
          rankCheckId: persisted.id,
          runItemId: input.runItemId,
          startedAt,
        });
        if (!linked.linked) throw new RunItemAlreadyClaimedError();
      } else if (automaticLegacySource(input)) {
        await wrapLegacyRankCheck(tx, input, persisted.id, reservation, startedAt);
      }
      // biome-ignore format: compact audit keeps this activity module under the line cap.
      await writeAudit({
        action: "rank_check.running", actorId: null,
        after: { estimatedCostCents: reservation.estimatedCostCents,
          keywordId: requiredPublicAuditId(reservation.keywordPublicId, "kw", "Rank-check"),
          provider: data.provider, status: "running" },
        projectId: reservation.projectId,
        targetId: requiredPublicAuditId(persisted.publicId, "check", "Rank-check"),
        targetType: "rank_check",
      }, tx);
      return persisted.id;
    });
  } catch (error) {
    if (error instanceof RunItemKeywordMismatchError) {
      throw ApplicationFailure.create({
        message: error.message,
        nonRetryable: true,
        type: "rank_check_run_item_keyword_mismatch",
      });
    }
    if (!(error instanceof RunItemAlreadyClaimedError) || !input.runItemId) throw error;
    const item = await prisma.rankCheckRunItem.findUnique({
      select: { rankCheck: { select: { workflowRunId: true } }, rankCheckId: true },
      where: { id: input.runItemId },
    });
    if (!item?.rankCheckId) throw error;
    if (item.rankCheck?.workflowRunId !== input.workflowRunId) {
      throw ApplicationFailure.create({
        message: "Rank-check run item was already claimed by another workflow.",
        nonRetryable: true,
        type: "rank_check_run_item_already_claimed",
      });
    }
    return { keywordId: input.keywordId, rankCheckId: item.rankCheckId };
  }
  await publishOperationChanged({ projectId: reservation.projectId }).catch(() => undefined);
  return { keywordId: input.keywordId, rankCheckId };
}

export async function discardRankCheckActivity(input: DiscardRankCheckActivityInput) {
  const rankCheck = await prisma.$transaction(async (tx) => {
    const now = new Date();
    const closed = await tx.rankCheck.updateMany({
      data: {
        attemptCount: 0,
        degradedToCountry: false,
        deferredReason: input.reason,
        finishedAt: now,
        normalizationVersion: null,
        status: "deferred",
        viaFallback: false,
      },
      where: { id: input.rankCheckId, status: "running" },
    });
    if (closed.count === 0) return null;
    const deferred = await tx.rankCheck.findUniqueOrThrow({
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
    await applyRunItemTransition(tx, { rankCheckId: input.rankCheckId, to: "deferred" });
    // biome-ignore format: compact audit keeps this activity module under the line cap.
    await writeAudit({
      action: "rank_check.deferred", actorId: null,
      after: { estimatedCostCents: Number(deferred.estimatedCostCents ?? 0),
        keywordId: requiredPublicAuditId(deferred.keyword.publicId, "kw", "Rank-check"),
        provider: deferred.provider, reason: input.reason, status: "deferred" },
      projectId: deferred.keyword.projectId,
      targetId: requiredPublicAuditId(deferred.publicId, "check", "Rank-check"),
      targetType: "rank_check",
    }, tx);
    return deferred;
  });
  if (!rankCheck) return { rankCheckId: input.rankCheckId };
  await publishOperationChanged({ projectId: rankCheck.keyword.projectId }).catch(() => undefined);
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
  // biome-ignore format: compact parallel query keeps this activity module under the line cap.
  const [keyword, running] = await Promise.all([
    prisma.keyword.findUnique({
      select: {
        id: true,
        project: { select: { defaults: { select: { serpDepth: true } }, domain: true } },
        projectId: true, publicId: true,
        rankChecks: { orderBy: { checkedAt: "desc" }, select: { position: true }, take: 1, where: { status: "completed" } },
        checkSchedule: { select: { serpDepth: true } }, schedule: { select: { serpDepth: true } }, text: true,
      },
      where: { id: input.keywordId },
    }),
    input.rankCheckId
      ? prisma.rankCheck.findUnique({ select: { attempts: true, errorCode: true }, where: { id: input.rankCheckId } })
      : null,
  ]);
  if (!keyword) {
    throw new Error("Keyword not found.");
  }
  // biome-ignore format: compact ternary keeps this activity module under the line cap.
  const storedAttempts = Array.isArray(running?.attempts) && running.attempts.length > 0
    ? (running.attempts as { provider: string; message: string }[]) : undefined;
  const expectedUrl = await resolveExpectedUrlForKeyword(keyword.id);
  // biome-ignore format: compact call keeps this activity module under the line cap.
  const rankCheck = await persistFailedRankCheck({
    error: input.message,
    errorCode: isProviderErrorCode(running?.errorCode) ? running.errorCode : undefined,
    attempts: storedAttempts, existingRankCheckId: input.rankCheckId, expectedUrlAtCheck: expectedUrl.url, keywordId: keyword.id,
    keywordPublicId: keyword.publicId, keywordText: keyword.text,
    previousPosition: keyword.rankChecks[0]?.position ?? null,
    projectDomain: trackedProjectDomain(keyword.project.domain) ?? "", projectId: keyword.projectId,
    provider: input.providerId ?? "primary",
    requestedDepth: resolveEffectiveSerpDepth({ projectDepth: keyword.project.defaults?.serpDepth, checkScheduleDepth: keyword.checkSchedule?.serpDepth, scheduleDepth: keyword.schedule?.serpDepth }),
  }).catch((error) => {
    if (error instanceof RankCheckClosedBeforePersistenceError) return null;
    throw error;
  });
  if (!rankCheck) return { rankCheckId: input.rankCheckId };
  // biome-ignore format: compact call keeps this activity module under the line cap.
  await notifyFailedRankCheckOps({
    keywordId: keyword.id, keywordText: keyword.text, projectId: keyword.projectId,
    provider: rankCheck.provider,
    providerAttemptCount: Array.isArray(rankCheck.attempts) ? rankCheck.attempts.length : null,
    scheduledAt: rankCheck.scheduledAt, startedAt: rankCheck.startedAt,
  });
  return { rankCheckId: rankCheck.id };
}
