"use server";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { parsePublicId } from "@/lib/db/public-id";
import type { RankCheckFrequency } from "@/lib/generated/prisma/client";
import { requireTrackedDomain } from "@/lib/projects/tracked-domain";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import {
  type BudgetExhaustedResult,
  budgetExhaustedResult,
} from "@/lib/rank-check/budget-contract";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { refreshKeywordDispatchStates } from "@/lib/rank-check/dispatcher-state";
import { loadSerpProviderChain, runKeywordCheckWithFallback } from "@/lib/rank-check/fallback";
import { isScheduledFrequency, SCHEDULED_FREQUENCIES } from "@/lib/rank-check/schedule";
import { SchedulerDisabledError } from "@/lib/scheduler/driver";
import { queueFirstChecksSchema, runCheckNowSchema } from "@/lib/schemas/keyword";
import { resolveEffectiveSerpDepth } from "@/lib/serp/markets";
import {
  manualRankCheckWorkflowId,
  rankCheckSearchAttributes,
  startRankCheckWorkflow,
} from "@/lib/temporal/client";
import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  requireProjectScope,
  revalidateRankCheckViews,
} from "./_shared";

export type RunCheckNowResult =
  | BudgetExhaustedResult
  | { status: "running" }
  | {
      attempts: number;
      billingUnits: number | null;
      position: number | null;
      provider: string;
      rankCheckId: string;
      requestedDepth: number | null;
      status: "completed";
    };

export type QueueFirstChecksResult = { queued: number } | { queued: 0; reason: "no_provider" };

const scheduleSelect = {
  cronExpression: true,
  frequency: true,
  jitterMinutes: true,
  lastCheckedAt: true,
  timezone: true,
} as const;

type FirstCheckSchedule = {
  cronExpression: string | null;
  frequency: RankCheckFrequency;
  jitterMinutes: number;
  lastCheckedAt: Date | null;
  timezone: string;
};

function isTemporalUnavailable(error: unknown) {
  if (error instanceof SchedulerDisabledError) return true;
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ECONNREFUSED|UNAVAILABLE|Unavailable|connection refused|failed to connect|No connection established|deadline exceeded/i.test(
    message,
  );
}

function canQueueFirstCheck(schedule: Pick<FirstCheckSchedule, "frequency"> | null) {
  return Boolean(schedule && isScheduledFrequency(schedule.frequency));
}

function inheritedFirstCheckSchedule(defaults: FirstCheckSchedule, keywordId: string, now: Date) {
  return {
    cronExpression: defaults.cronExpression,
    frequency: defaults.frequency,
    jitterMinutes: defaults.jitterMinutes,
    keywordId,
    lastCheckedAt: defaults.lastCheckedAt,
    nextCheckAt: now,
    timezone: defaults.timezone,
  };
}

export async function queueFirstChecks(input: unknown): Promise<QueueFirstChecksResult> {
  const data = parseActionInput(queueFirstChecksSchema, input);
  const actor = await getActionActor();
  const project = await requireProjectScope(actor, "update", data.projectId, { type: "keyword" });
  requireTrackedDomain(project);
  const providerCount = await prisma.providerConnection.count({
    where: { enabled: true, kind: "serp", projectId: project.id, status: "connected" },
  });

  if (providerCount === 0) {
    const result = { queued: 0, reason: "no_provider" } as const;
    await writeAudit({
      action: "rank_check.queue_first",
      actorId: actor.id,
      after: result,
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    });
    revalidateRankCheckViews();
    return result;
  }

  const now = new Date();
  const excludedKeywordIds = data.excludeKeywordIds ?? [];
  if (excludedKeywordIds.some((keywordId) => parsePublicId(keywordId)?.prefix !== "kw")) {
    throw new Error("Keyword not found.");
  }
  const keywordIdFilter =
    excludedKeywordIds.length > 0 ? { publicId: { notIn: excludedKeywordIds } } : {};
  const defaults = await prisma.projectDefaults.findUnique({
    select: scheduleSelect,
    where: { projectId: project.id },
  });
  const [scheduledKeywords, inheritedKeywords] = await Promise.all([
    prisma.keyword.findMany({
      select: { id: true },
      where: {
        ...keywordIdFilter,
        projectId: project.id,
        schedule: {
          is: {
            frequency: { in: [...SCHEDULED_FREQUENCIES] },
          },
        },
      },
    }),
    canQueueFirstCheck(defaults)
      ? prisma.keyword.findMany({
          select: { id: true },
          // Previewed keywords persisted their own schedule update; re-queueing
          // them here would trigger an immediate duplicate check.
          where: { ...keywordIdFilter, projectId: project.id, schedule: null },
        })
      : Promise.resolve([]),
  ]);
  const scheduledIds = scheduledKeywords.map((keyword) => keyword.id);
  const inheritedIds = inheritedKeywords.map((keyword) => keyword.id);

  const keywordIds = [...scheduledIds, ...inheritedIds];
  await prisma.$transaction(async (tx) => {
    if (scheduledIds.length > 0) {
      await tx.keywordSchedule.updateMany({
        data: { nextCheckAt: now },
        where: { keywordId: { in: scheduledIds } },
      });
    }
    if (defaults && inheritedIds.length > 0) {
      await tx.keywordSchedule.createMany({
        data: inheritedIds.map((keywordId) =>
          inheritedFirstCheckSchedule(defaults, keywordId, now),
        ),
        skipDuplicates: true,
      });
    }
    await refreshKeywordDispatchStates({ keywordIds }, tx);
  });
  await writeAudit({
    action: "rank_check.queue_first",
    actorId: actor.id,
    after: { queued: keywordIds.length },
    projectId: project.id,
    targetId: project.publicId,
    targetType: "project",
  });
  revalidateRankCheckViews();

  return { queued: keywordIds.length };
}

export async function runCheckNow(input: unknown): Promise<RunCheckNowResult> {
  const data = parseActionInput(runCheckNowSchema, input);
  const actor = await getActionActor();
  const keywordScope = await requireKeywordScope(actor, "update", data.keywordId);
  if (keywordScope.projectIsSample) {
    throw new Error("Sample projects don't run real checks.");
  }
  const [budgetContext, connections] = await Promise.all([
    prisma.keyword.findUnique({
      select: {
        project: {
          select: {
            budgetCapCents: true,
            defaults: { select: { serpDepth: true } },
          },
        },
        schedule: { select: { serpDepth: true } },
      },
      where: { id: keywordScope.id },
    }),
    loadSerpProviderChain(keywordScope.projectId, data.providerId),
  ]);
  if (!budgetContext) {
    throw new Error("Keyword not found.");
  }
  const depth = resolveEffectiveSerpDepth({
    projectDepth: budgetContext.project.defaults?.serpDepth,
    requestedDepth: data.depth,
    scheduleDepth: budgetContext.schedule?.serpDepth,
  });
  try {
    // This preflight improves feedback only; durable execution repeats the budget gate.
    await assertBudgetAvailable(keywordScope.projectId, new Date(), {
      capCents: budgetContext.project.budgetCapCents,
      estimatedCostCents: estimatedRankCheckCostCents(
        connections[0]?.provider,
        depth,
        connections[0]?.costPerCheckCents,
        connections[0]?.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
      ),
    });
  } catch (error) {
    if (isBudgetExhaustedError(error)) {
      return budgetExhaustedResult(error.message);
    }
    throw error;
  }
  let result: Exclude<RunCheckNowResult, BudgetExhaustedResult>;
  try {
    await startRankCheckWorkflow(
      { depth: data.depth, keywordId: keywordScope.id, providerId: data.providerId },
      {
        searchAttributes: rankCheckSearchAttributes({
          keywordId: keywordScope.id,
          projectId: keywordScope.projectId,
          provider: data.providerId,
        }),
        workflowId: manualRankCheckWorkflowId(keywordScope.id),
      },
    );
    result = { status: "running" };
  } catch (error) {
    if (!isTemporalUnavailable(error)) throw error;
    const fallback = await runKeywordCheckWithFallback({
      depth: data.depth,
      keywordId: keywordScope.id,
      providerId: data.providerId,
    });
    result = {
      attempts: fallback.attempts.length,
      billingUnits: fallback.rankCheck.billingUnits,
      position: fallback.rankCheck.position,
      provider: fallback.provider,
      rankCheckId: requiredPublicAuditId(fallback.rankCheck.publicId, "check", "Rank-check"),
      requestedDepth: fallback.rankCheck.requestedDepth,
      status: "completed",
    };
  }

  await writeAudit({
    action: "rank_check.run_now",
    actorId: actor.id,
    after: {
      keywordId: keywordScope.publicId,
      provider: data.providerId ?? ("provider" in result ? result.provider : "primary"),
      text: keywordScope.text,
      ...result,
    },
    projectId: keywordScope.projectId,
    targetId: keywordScope.publicId,
    targetType: "keyword",
  });
  revalidateRankCheckViews(keywordScope.publicId);

  return result;
}
