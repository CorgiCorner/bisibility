import "server-only";

import { prisma } from "@/lib/db/prisma";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import {
  activeMarketLocationIds,
  isRunnableKeyword,
  runnableKeywordWhere,
} from "@/lib/rank-check/runnable";
import {
  lockRunSelectionKeywords,
  runSelectionKeywordInProgress,
  runSelectionKeywordSelect,
} from "@/lib/rank-check/runs/selection";
import { completeWithoutItems, completeWithoutItemsInTransaction } from "./complete-without-items";
import { reserveScheduledRunAllocation } from "./launch-reservation";
import { itemNotBefore, plannedOccurrenceForKey, selectionOccurrenceKey } from "./occurrence";
import { scheduleAdmission } from "./plan";
import { scheduledRunMembers } from "./schedule-members";

export async function materializePlannedRun(runId: string, now: Date, runNow = false) {
  const run = await prisma.rankCheckRun.findUnique({
    select: {
      checkSchedule: {
        select: {
          archivedAt: true,
          id: true,
          cronExpression: true,
          enabled: true,
          frequency: true,
          jitterMinutes: true,
          keywords: { orderBy: { id: "asc" }, select: { id: true } },
          providerPolicy: true,
          publicId: true,
          serpDepth: true,
          timeOfDay: true,
          timezone: true,
        },
      },
      project: {
        select: {
          budgetCapCents: true,
          defaults: { select: { serpDepth: true, timezone: true } },
          providerAllocationsInitializedAt: true,
        },
      },
      projectId: true,
      selectionSpec: true,
      launchedAt: true,
      startedAt: true,
      status: true,
      items: { select: { id: true } },
    },
    where: { id: runId },
  });
  if (
    !run?.checkSchedule ||
    (!(run.status === "planned" || run.status === "blocked") &&
      !(
        runNow &&
        run.status === "queued" &&
        !run.launchedAt &&
        !run.startedAt &&
        run.items.length === 0
      ))
  ) {
    return "not_ready" as const;
  }
  const schedule = run.checkSchedule;
  const key = selectionOccurrenceKey(run.selectionSpec);
  const occurrence =
    !schedule.archivedAt && schedule.enabled && key
      ? plannedOccurrenceForKey(
          { ...schedule, timezone: schedule.timezone ?? run.project.defaults?.timezone ?? "UTC" },
          key,
        )
      : null;
  if (!occurrence) return "not_ready" as const;
  if (run.status === "blocked" && run.items.length > 0) {
    const resumed = await prisma.rankCheckRun.updateMany({
      data: {
        blockedReason: null,
        ...(run.startedAt ? {} : { claimedAt: null }),
        status: run.startedAt ? "running" : "queued",
      },
      where: { id: runId, status: "blocked" },
    });
    return resumed.count > 0 ? ("resume" as const) : ("not_ready" as const);
  }
  if (
    run.status === "blocked" &&
    occurrence.plannedFor.getTime() + occurrence.intervalMs <= now.getTime()
  ) {
    const expired = await prisma.rankCheckRun.updateMany({
      data: {
        blockedReason: "occurrence_expired",
        finishedAt: now,
        outcome: "deferred",
        status: "completed",
      },
      where: { id: runId, status: "blocked" },
    });
    return expired.count > 0 ? ("expired" as const) : ("not_ready" as const);
  }
  const members = scheduledRunMembers(schedule.keywords);
  if (members.keywordIds.length === 0) {
    return completeWithoutItems({
      keywordCount: 0,
      now,
      requestedCount: 0,
      reason: "no_active_keywords",
      projectId: run.projectId,
      checkScheduleId: schedule.id,
      runId,
      selectionHash: members.selectionHash,
      status: run.status,
    });
  }
  const activeLocationIds = await activeMarketLocationIds(run.projectId, prisma);
  const candidateRows = await prisma.keyword.findMany({
    select: runSelectionKeywordSelect,
    where: {
      ...runnableKeywordWhere(activeLocationIds),
      id: { in: members.keywordIds },
      projectId: run.projectId,
    },
  });
  const keywordIds = candidateRows
    .filter((row) => !runSelectionKeywordInProgress(row))
    .map((row) => row.id);
  if (keywordIds.length === 0) {
    return completeWithoutItems({
      keywordCount: 0,
      now,
      requestedCount: members.keywordIds.length,
      reason: candidateRows.length === 0 ? "no_active_keywords" : "targets_in_progress",
      projectId: run.projectId,
      checkScheduleId: schedule.id,
      runId,
      selectionHash: members.selectionHash,
      status: run.status,
    });
  }
  const admission = await scheduleAdmission(
    {
      keywords: keywordIds.map((id) => ({ id })),
      project: run.project,
      projectId: run.projectId,
      providerPolicy: schedule.providerPolicy,
      serpDepth: schedule.serpDepth,
    },
    now,
  );
  if (admission.blockedReason) {
    await prisma.rankCheckRun.updateMany({
      data: { blockedReason: admission.blockedReason, status: "blocked" },
      where: { id: runId, status: run.status },
    });
    return "not_ready" as const;
  }

  const materialized = await prisma.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, run.projectId);
    const current = await tx.checkSchedule.findFirst({
      where: {
        projectId: run.projectId,
        publicId: schedule.publicId,
        archivedAt: null,
        enabled: true,
      },
      select: { id: true },
    });
    if (!current) return "not_ready" as const;
    const pending = await tx.rankCheckRun.findFirst({
      select: { id: true },
      where: {
        id: runId,
        status: run.status,
        ...(runNow ? { launchedAt: null, startedAt: null, items: { none: {} } } : {}),
      },
    });
    if (!pending) return "not_ready" as const;
    const lockedRows = await lockRunSelectionKeywords(tx, run.projectId, keywordIds);
    const lockedActiveLocationIds = await activeMarketLocationIds(run.projectId, tx);
    if (lockedRows.filter((row) => isRunnableKeyword(row, lockedActiveLocationIds)).length === 0) {
      return completeWithoutItemsInTransaction(tx, {
        keywordCount: 0,
        now,
        requestedCount: members.keywordIds.length,
        reason: "no_active_keywords",
        projectId: run.projectId,
        checkScheduleId: schedule.id,
        runId,
        selectionHash: members.selectionHash,
        status: run.status,
      });
    }
    if (
      lockedRows.length !== keywordIds.length ||
      lockedRows.some((row) => runSelectionKeywordInProgress(row)) ||
      lockedRows.some((row) => !isRunnableKeyword(row, lockedActiveLocationIds))
    ) {
      return "not_ready" as const;
    }
    const selectionSpec = await reserveScheduledRunAllocation(tx, {
      connection: admission.connection,
      estimatedCostCents: admission.estimatedCostCents,
      initializedAllocations: Boolean(run.project.providerAllocationsInitializedAt),
      now,
      projectId: run.projectId,
      selectionSpec: run.selectionSpec,
      usageQuantity: admission.usageQuantity,
      items: keywordIds.map((keywordId, index) => ({
        keywordId,
        cost: admission.itemCosts[index],
        depth: admission.depth,
      })),
    });
    if (!selectionSpec) return "allocation_exhausted" as const;
    const claimed = await tx.rankCheckRun.updateMany({
      data: {
        blockedReason: null,
        estimatedCostCents: admission.estimatedCostCents,
        keywordCount: keywordIds.length,
        launchedAt: now,
        claimedAt: null,
        requestedCount: members.keywordIds.length,
        selectionHash: members.selectionHash,
        selectionSpec,
        skippedCount: members.keywordIds.length - keywordIds.length,
        startedAt: null,
        status: "queued",
        targetCount: keywordIds.length,
        totalCount: keywordIds.length,
      },
      where: { id: runId, status: run.status },
    });
    if (claimed.count === 0) return "not_ready" as const;
    if (run.status === "planned") {
      await tx.rankCheckRunItem.deleteMany({
        where: { rankCheckId: null, runId, status: "queued" },
      });
    }
    await tx.rankCheckRunItem.createMany({
      data: keywordIds.map((keywordId, index) => ({
        estimatedCostCents:
          admission.itemCosts[index] === null ? null : Math.ceil(admission.itemCosts[index] ?? 0),
        keywordId,
        notBefore: runNow ? now : itemNotBefore(occurrence, schedule, keywordId, now),
        runId,
        status: "queued",
      })),
    });
    return "launch" as const;
  });
  if (materialized !== "allocation_exhausted") return materialized;
  await prisma.rankCheckRun.updateMany({
    data: { blockedReason: "budget_exhausted", status: "blocked" },
    where: { id: runId, status: run.status },
  });
  return "not_ready" as const;
}
