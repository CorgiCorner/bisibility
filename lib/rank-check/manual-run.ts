import "server-only";

import {
  getActionActor,
  parseActionInput,
  requireKeywordScope,
  revalidateRankCheckViews,
} from "@/lib/actions/_shared";
import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { assertBudgetAvailable, isBudgetExhaustedError } from "@/lib/rank-check/budget";
import {
  type BudgetExhaustedResult,
  budgetExhaustedResult,
} from "@/lib/rank-check/budget-contract";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import {
  loadSerpProviderChain,
  ProviderChainError,
  runKeywordCheckWithFallback,
} from "@/lib/rank-check/fallback";
import { ACTIVE_QUEUED_TASK_STATES } from "@/lib/rank-check/queued-state";
import { persistFailedRankCheck } from "@/lib/rank-check/runner-persistence";
import { SchedulerDisabledError } from "@/lib/scheduler/driver";
import { runCheckNowSchema } from "@/lib/schemas/keyword";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { resolveEffectiveSerpDepth } from "@/lib/serp/markets";
import {
  manualRankCheckWorkflowId,
  rankCheckSearchAttributes,
  startRankCheckWorkflow,
} from "@/lib/temporal/client";

export type RunCheckNowResult =
  | BudgetExhaustedResult
  | { code: "check_in_progress"; message: string; status: "not_started" }
  | { rankCheckId: string; status: "running" }
  | {
      attempts: number;
      billingUnits: number | null;
      position: number | null;
      provider: string;
      rankCheckId: string;
      requestedDepth: number | null;
      status: "completed";
    };

function isTemporalUnavailable(error: unknown) {
  if (error instanceof SchedulerDisabledError) return true;
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /ECONNREFUSED|UNAVAILABLE|Unavailable|connection refused|failed to connect|No connection established|deadline exceeded/i.test(
    message,
  );
}

export async function manualRunCheckNow(input: unknown): Promise<RunCheckNowResult> {
  const data = parseActionInput(runCheckNowSchema, input);
  const actor = await getActionActor();
  const keywordScope = await requireKeywordScope(actor, "update", data.keywordId);
  if (keywordScope.projectIsSample) {
    throw new Error("Sample projects don't run real checks.");
  }
  const budgetContext = await prisma.keyword.findUnique({
    select: {
      project: {
        select: {
          budgetCapCents: true,
          defaults: { select: { serpDepth: true } },
          domain: true,
        },
      },
      queuedRankCheckTasks: {
        select: { state: true },
        take: 1,
        where: { state: { in: ACTIVE_QUEUED_TASK_STATES } },
      },
      rankChecks: {
        orderBy: [{ checkedAt: "desc" }, { id: "desc" }],
        select: { status: true },
        take: 1,
      },
      schedule: { select: { serpDepth: true } },
    },
    where: { id: keywordScope.id },
  });
  if (!budgetContext) {
    throw new Error("Keyword not found.");
  }
  const auditResult = async (result: RunCheckNowResult) => {
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
  };
  if (
    budgetContext.queuedRankCheckTasks.length > 0 ||
    budgetContext.rankChecks[0]?.status === "running"
  ) {
    const result = {
      code: "check_in_progress",
      message: "A rank check is already queued or running.",
      status: "not_started",
    } as const;
    await auditResult(result);
    return result;
  }
  const connections = await loadSerpProviderChain(keywordScope.projectId, data.providerId);
  const depth = resolveEffectiveSerpDepth({
    projectDepth: budgetContext.project.defaults?.serpDepth,
    requestedDepth: data.depth,
    scheduleDepth: budgetContext.schedule?.serpDepth,
  });
  const estimatedCostCents = estimatedRankCheckCostCents(
    connections[0]?.provider,
    depth,
    connections[0]?.costPerCheckCents,
    connections[0]?.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
  );
  try {
    await assertBudgetAvailable(keywordScope.projectId, new Date(), {
      capCents: budgetContext.project.budgetCapCents,
      estimatedCostCents,
    });
  } catch (error) {
    if (isBudgetExhaustedError(error)) {
      return budgetExhaustedResult(error.message);
    }
    throw error;
  }
  // Pre-create the running row so a public id is available immediately for
  // status polling. The workflow activity claims this row by its internal id.
  const now = new Date();
  const runningRow = await prisma.rankCheck.create({
    data: {
      attemptCount: 0,
      checkedAt: now,
      estimatedCostCents,
      keywordId: keywordScope.id,
      provider: data.providerId ?? "primary",
      publicId: makePublicId("check"),
      requestedDepth: depth,
      startedAt: now,
      status: "running",
      trigger: "manual",
    },
    select: { id: true, publicId: true },
  });
  let result: Exclude<RunCheckNowResult, BudgetExhaustedResult>;
  try {
    await startRankCheckWorkflow(
      {
        depth: data.depth,
        keywordId: keywordScope.id,
        providerId: data.providerId,
        rankCheckId: runningRow.id,
      },
      {
        searchAttributes: rankCheckSearchAttributes({
          keywordId: keywordScope.id,
          projectId: keywordScope.projectId,
          provider: data.providerId,
        }),
        workflowId: manualRankCheckWorkflowId(keywordScope.id),
      },
    );
    result = {
      rankCheckId: requiredPublicAuditId(runningRow.publicId, "check", "Rank-check"),
      status: "running",
    };
  } catch (error) {
    if (!isTemporalUnavailable(error)) {
      await prisma.rankCheck.delete({ where: { id: runningRow.id } });
      throw error;
    }
    let fallback: Awaited<ReturnType<typeof runKeywordCheckWithFallback>>;
    try {
      fallback = await runKeywordCheckWithFallback({
        depth: data.depth,
        keywordId: keywordScope.id,
        providerId: data.providerId,
        rankCheckId: runningRow.id,
      });
    } catch (fallbackError) {
      if (fallbackError instanceof ProviderChainError) {
        await persistFailedRankCheck({
          attempts: fallbackError.attempts,
          checkedAt: now,
          error: fallbackError.message,
          errorCode: fallbackError.dominantCode,
          existingRankCheckId: runningRow.id,
          keywordId: keywordScope.id,
          keywordPublicId: keywordScope.publicId,
          keywordText: keywordScope.text,
          projectDomain: trackedProjectDomain(budgetContext.project.domain) ?? undefined,
          projectId: keywordScope.projectId,
          provider: data.providerId ?? connections[0]?.provider ?? "primary",
          requestedDepth: depth,
        });
        result = {
          rankCheckId: requiredPublicAuditId(runningRow.publicId, "check", "Rank-check"),
          status: "running",
        };
        await auditResult(result);
        return result;
      }
      await prisma.rankCheck.deleteMany({
        where: { id: runningRow.id, status: "running" },
      });
      throw fallbackError;
    }
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

  await auditResult(result);

  return result;
}
