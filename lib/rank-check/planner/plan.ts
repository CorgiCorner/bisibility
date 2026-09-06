import "server-only";

import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import { resolveEffectiveSerpDepth } from "@/lib/serp/markets";
import { plannedOccurrences } from "./occurrence";
import { scheduledRunMembers } from "./schedule-members";

const MAX_SCHEDULE_PAGE = 200;

const plannerScheduleSelect = {
  cronExpression: true,
  enabled: true,
  frequency: true,
  id: true,
  jitterMinutes: true,
  keywords: { orderBy: { id: "asc" as const }, select: { id: true, publicId: true } },
  project: {
    select: {
      defaults: { select: { timezone: true } },
    },
  },
  projectId: true,
  publicId: true,
  timeOfDay: true,
  timezone: true,
} as const;

type PlannerSchedule = Awaited<
  ReturnType<typeof prisma.checkSchedule.findMany<{ select: typeof plannerScheduleSelect }>>
>[number];

type ScheduleAdmissionInput = {
  keywords: readonly { id: string }[];
  project: {
    budgetCapCents: number;
    defaults: { serpDepth: number } | null;
    providerAllocationsInitializedAt: Date | null;
  };
  projectId: string;
  providerPolicy: string | null;
  serpDepth: number | null;
};

export type PlanRankCheckRunsInput = { cursor?: string | null; limit?: number; now?: Date };
export type PlanRankCheckRunsResult = {
  blocked: number;
  cursor: string | null;
  done: boolean;
  planned: number;
  schedules: number;
};

function boundedLimit(value?: number) {
  if (!Number.isFinite(value)) return MAX_SCHEDULE_PAGE;
  return Math.min(MAX_SCHEDULE_PAGE, Math.max(1, Math.floor(value ?? MAX_SCHEDULE_PAGE)));
}

export async function scheduleAdmission(schedule: ScheduleAdmissionInput, now: Date) {
  const connections = await loadSerpProviderChain(
    schedule.projectId,
    schedule.providerPolicy === "project" ? undefined : (schedule.providerPolicy ?? undefined),
  );
  const connection = connections[0];
  if (!connection) {
    return {
      blockedReason: "no_provider" as const,
      connection: null,
      estimatedCostCents: 0,
      itemCosts: schedule.keywords.map(() => null),
      usageQuantity: 0,
    };
  }
  const depth = resolveEffectiveSerpDepth({
    projectDepth: schedule.project.defaults?.serpDepth,
    scheduleDepth: schedule.serpDepth,
  });
  const itemCosts = schedule.keywords.map(() =>
    estimatedRankCheckCostCents(
      connection.provider,
      depth,
      connection.costPerCheckCents,
      connection.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
    ),
  );
  const estimatedCostCents = Math.ceil(
    itemCosts.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
  );
  try {
    if (!schedule.project.providerAllocationsInitializedAt) {
      await assertBudgetAvailable(schedule.projectId, now, {
        capCents: schedule.project.budgetCapCents,
        estimatedCostCents,
      });
    }
    return {
      blockedReason: null,
      connection,
      estimatedCostCents,
      itemCosts,
      usageQuantity: schedule.keywords.length * pagesPerCheck(depth),
    };
  } catch (error) {
    if (!isBudgetExhaustedError(error)) throw error;
    return {
      blockedReason: "budget_exhausted" as const,
      connection,
      estimatedCostCents,
      itemCosts,
      usageQuantity: schedule.keywords.length * pagesPerCheck(depth),
    };
  }
}

async function persistOccurrence(
  schedule: PlannerSchedule,
  occurrence: ReturnType<typeof plannedOccurrences>[number],
) {
  const idempotencyKey = `plan:${schedule.publicId}:${occurrence.occurrenceKey}`;
  const existing = await prisma.rankCheckRun.findUnique({
    select: { id: true },
    where: { projectId_idempotencyKey: { idempotencyKey, projectId: schedule.projectId } },
  });
  if (existing) return null;
  const publicId = makePublicId("rcr");
  const members = scheduledRunMembers(schedule.keywords);
  const run = await prisma.rankCheckRun.upsert({
    create: {
      checkScheduleId: schedule.id,
      estimatedCostCents: 0,
      idempotencyKey,
      keywordCount: 0,
      orchestrationWorkflowId: `rank-check-run-${publicId}`,
      plannedFor: occurrence.plannedFor,
      projectId: schedule.projectId,
      publicId,
      requestedCount: 0,
      selectionHash: members.selectionHash,
      selectionKind: "scheduled_due",
      selectionSpec: {
        checkScheduleId: schedule.publicId,
        kind: "scheduled_due",
        occurrenceKey: occurrence.occurrenceKey,
        v: 1,
      },
      status: "planned",
      targetCount: 0,
      totalCount: 0,
      trigger: "scheduled",
    },
    update: {},
    where: { projectId_idempotencyKey: { idempotencyKey, projectId: schedule.projectId } },
  });
  return run.id;
}

async function planSchedule(schedule: PlannerSchedule, now: Date) {
  const effective = {
    ...schedule,
    timezone: schedule.timezone ?? schedule.project.defaults?.timezone ?? "UTC",
  };
  const occurrences = plannedOccurrences(effective, now);
  if (occurrences.length === 0) return { blocked: 0, planned: 0 };
  let planned = 0;
  for (const occurrence of occurrences) {
    const runId = await persistOccurrence(schedule, occurrence);
    if (runId) planned += 1;
  }
  return { blocked: 0, planned };
}

export async function planRankCheckRuns(
  input: PlanRankCheckRunsInput = {},
): Promise<PlanRankCheckRunsResult> {
  const now = input.now ?? new Date();
  const limit = boundedLimit(input.limit);
  const rows = await prisma.checkSchedule.findMany({
    orderBy: { id: "asc" },
    select: plannerScheduleSelect,
    take: limit + 1,
    where: {
      enabled: true,
      frequency: { in: ["daily", "weekly", "monthly", "custom_cron"] },
      ...(input.cursor ? { id: { gt: input.cursor } } : {}),
    },
  });
  const schedules = rows.slice(0, limit);
  let blocked = 0;
  let planned = 0;
  for (const schedule of schedules) {
    const result = await planSchedule(schedule, now);
    blocked += result.blocked;
    planned += result.planned;
  }
  const done = rows.length <= limit;
  return {
    blocked,
    cursor: done ? null : (schedules.at(-1)?.id ?? null),
    done,
    planned,
    schedules: schedules.length,
  };
}
