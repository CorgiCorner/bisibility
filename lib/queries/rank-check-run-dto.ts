import { initials as avatarInitials } from "@/lib/avatar/initials";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { RankCheckOperation, RunStatus } from "@/lib/rank-check/runs/contract";
import { rankCheckProviderPresentation } from "@/lib/rank-check/runs/provider-presentation";
import {
  pendingRunItems,
  runStartFacts,
  startedRunItemWhere,
} from "@/lib/rank-check/runs/start-facts";

export const rankCheckRunSelect = {
  _count: {
    select: {
      items: { where: startedRunItemWhere },
    },
  },
  blockedReason: true,
  cancelledCount: true,
  checkSchedule: {
    select: {
      archivedAt: true,
      id: true,
      frequency: true,
      timeOfDay: true,
      jitterMinutes: true,
      name: true,
      providerPolicy: true,
      publicId: true,
      serpDepth: true,
    },
  },
  completedCount: true,
  costCents: true,
  deferredCount: true,
  estimatedCostCents: true,
  failedCount: true,
  finishedAt: true,
  id: true,
  items: pendingRunItems,
  keywordCount: true,
  launchedAt: true,
  orchestrationWorkflowId: true,
  outcome: true,
  parentRelation: true,
  parentRun: { select: { publicId: true } },
  plannedFor: true,
  project: { select: { budgetCapCents: true, defaults: { select: { serpDepth: true } } } },
  projectId: true,
  publicId: true,
  requestedBy: { select: { email: true, image: true, name: true } },
  requestedCount: true,
  selectionKind: true,
  selectionSpec: true,
  skippedCount: true,
  startedAt: true,
  status: true,
  targetCount: true,
  totalCount: true,
  trigger: true,
} satisfies Prisma.RankCheckRunSelect;

export type RankCheckRunRow = Prisma.RankCheckRunGetPayload<{ select: typeof rankCheckRunSelect }>;

export type RankCheckRunActor = {
  avatarUrl: string | null;
  initials: string;
  name: string;
};

function iso(value: Date | null) {
  return value?.toISOString() ?? null;
}

export function rankCheckRunActorDto(
  actor: { email: string; image: string | null; name: string | null } | null,
): RankCheckRunActor | null {
  if (!actor) return null;
  const name = actor.name?.trim() || actor.email;
  return {
    avatarUrl: actor.image,
    initials: avatarInitials(name, actor.email),
    name,
  };
}

export function rankCheckRunDto(
  row: RankCheckRunRow,
  budget: { capCents: number; spentCents: number } | null = null,
) {
  const parentRunPublicId = row.parentRun?.publicId ?? null;
  const operation: RankCheckOperation = {
    blockedReason: row.blockedReason,
    budget: row.blockedReason === "budget_exhausted" ? budget : null,
    costCents: row.costCents,
    counts: {
      cancelled: row.cancelledCount,
      completed: row.completedCount,
      deferred: row.deferredCount,
      failed: row.failedCount,
      requested: row.requestedCount,
      skipped: row.skippedCount,
      total: row.totalCount,
    },
    estimatedCostCents: row.estimatedCostCents,
    finishedAt: iso(row.finishedAt),
    id: row.publicId,
    keywordCount: row.keywordCount,
    kind: "rank_check",
    ...runStartFacts(row),
    outcome: row.outcome as RankCheckOperation["outcome"],
    parentRunId: parentRunPublicId,
    plannedFor: iso(row.plannedFor),
    ...rankCheckProviderPresentation(row.selectionSpec),
    selectionKind: row.selectionKind as RankCheckOperation["selectionKind"],
    startedAt: iso(row.startedAt),
    status: row.status as RunStatus,
    targetCount: row.targetCount,
    trigger: row.trigger as RankCheckOperation["trigger"],
  };
  return {
    ...operation,
    checkScheduleArchived: Boolean(row.checkSchedule?.archivedAt),
    checkScheduleName: row.checkSchedule?.name ?? null,
    checkSchedulePublicId: row.checkSchedule?.publicId ?? null,
    launchedAt: iso(row.launchedAt),
    parentRelation: row.parentRelation,
    parentRunPublicId,
    requestedBy: rankCheckRunActorDto(row.requestedBy),
  };
}
