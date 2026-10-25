import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { checkNotificationSummariesEnabled } from "@/lib/notifications/check-summaries/switch";
import { readCheckEvidence } from "@/lib/provider-evidence/projection/read";
import { isRestoredCheck } from "@/lib/rank-check/restored-check";
import { appPath } from "@/lib/routing/app-path";
import type { RankCheckOperation } from "./contract";
import {
  RECENT_RUN_LIMIT,
  RECENT_RUN_WINDOW_MS,
  recentCheckCounts,
  recentRunExpiresAt,
} from "./recent-model";

export function recentRunsWhere(
  projectId: string,
  userId: string,
  now: Date,
): Prisma.RankCheckRunWhereInput {
  return {
    projectId,
    deletedAt: null,
    status: { in: ["completed", "cancelled"] },
    finishedAt: { gt: new Date(now.getTime() - RECENT_RUN_WINDOW_MS), lte: now },
    trayDismissals: { none: { userId, expiresAt: { gt: now } } },
    OR: [{ rankChecks: { none: {} } }, { rankChecks: { some: { recoveryRestoredAt: null } } }],
  };
}

/** Own query and limit: active work cannot crowd terminal entries out. Caller authorizes project. */
export async function readRecentRunOperations(
  projectId: string,
  userId: string,
  now = new Date(),
): Promise<RankCheckOperation[]> {
  if (!checkNotificationSummariesEnabled()) return [];
  const runs = await prisma.rankCheckRun.findMany({
    where: recentRunsWhere(projectId, userId, now),
    orderBy: [{ finishedAt: "desc" }, { id: "desc" }],
    take: RECENT_RUN_LIMIT,
    include: {
      project: { select: { publicId: true } },
      rankChecks: {
        select: {
          id: true,
          publicId: true,
          status: true,
          position: true,
          previousPosition: true,
          recoveryRestoredAt: true,
          comparisonAllowed: true,
        },
      },
    },
  });
  const checkIds = runs.flatMap((run) => run.rankChecks.map((check) => check.publicId));
  const [evidence, links] = await Promise.all([
    readCheckEvidence(projectId, { checkIds }),
    checkIds.length
      ? prisma.providerIncidentOperation.findMany({
          where: {
            incident: { projectId },
            operation: {
              providerDispatchIdentity: {
                rankCheckId: { in: runs.flatMap((run) => run.rankChecks.map((check) => check.id)) },
              },
            },
          },
          select: {
            incidentId: true,
            operation: { select: { providerDispatchIdentity: { select: { rankCheckId: true } } } },
          },
        })
      : [],
  ]);
  return runs.map((run) => {
    const checks = run.rankChecks.filter((check) => !isRestoredCheck(check));
    const counts = recentCheckCounts(checks, evidence);
    const incident = links.find((link) =>
      checks.some((check) => check.id === link.operation.providerDispatchIdentity?.rankCheckId),
    );
    return {
      kind: "rank_check",
      id: run.publicId,
      status: run.status as RankCheckOperation["status"],
      outcome: run.outcome as RankCheckOperation["outcome"],
      trigger: run.trigger as RankCheckOperation["trigger"],
      selectionKind: run.selectionKind as RankCheckOperation["selectionKind"],
      counts: {
        requested: run.requestedCount,
        total: run.totalCount,
        completed: counts.completed,
        failed: counts.failed,
        deferred: counts.deferred,
        skipped: run.skippedCount,
        cancelled: run.cancelledCount,
      },
      keywordCount: run.keywordCount,
      targetCount: run.targetCount,
      estimatedCostCents: run.estimatedCostCents,
      costCents: null,
      blockedReason: null,
      plannedFor: run.plannedFor?.toISOString() ?? null,
      nextCheckAt: null,
      startedAt: run.startedAt?.toISOString() ?? null,
      finishedAt: run.finishedAt?.toISOString() ?? null,
      parentRunId: null,
      recent: {
        up: counts.up,
        down: counts.down,
        underReview: counts.underReview,
        incidentHref:
          incident && (counts.failed > 0 || counts.underReview > 0 || run.outcome === "failed")
            ? `${appPath(run.project.publicId, "runs")}?view=checks&incidentId=${encodeURIComponent(incident.incidentId)}`
            : null,
      },
    };
  });
}

export async function dismissRecentRun(
  projectId: string,
  userId: string,
  runPublicId: string,
  now = new Date(),
) {
  if (!checkNotificationSummariesEnabled()) return { dismissed: false };
  const run = await prisma.rankCheckRun.findFirst({
    where: { ...recentRunsWhere(projectId, userId, now), publicId: runPublicId },
    select: { id: true, finishedAt: true },
  });
  if (!run?.finishedAt) return { dismissed: false };
  const data = { dismissedAt: now, expiresAt: recentRunExpiresAt(run.finishedAt) };
  await prisma.runTrayDismissal.upsert({
    where: { userId_runId: { userId, runId: run.id } },
    create: { userId, runId: run.id, ...data },
    update: data,
  });
  return { dismissed: true };
}
