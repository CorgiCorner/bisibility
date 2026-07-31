import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { resolveEffectiveSerpDepth } from "@/lib/serp/markets";
import type { QueuedRankCheckWorkflowInput } from "@/lib/temporal/queued-rank-check-contract";
import { assertBudgetAvailable, isBudgetExhaustedError } from "./budget";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import { queuedRankCheckConfig } from "./queued-config";
import { dataForSeoQueuedEstimate } from "./queued-pricing";
import { sha256Hex } from "./sha256";

const TERMINAL_RETENTION_DAYS = 30;
const AUTOMATIC_FREQUENCIES = new Set(["daily", "weekly", "monthly", "custom_cron"]);

type PreparedKeyword = Awaited<ReturnType<typeof loadContext>>["keywords"][number];
type EffectiveSchedule = {
  frequency: string;
  serpDepth: number | null;
};

async function loadContext(tx: Prisma.TransactionClient, input: QueuedRankCheckWorkflowInput) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rank-check-budget:${input.projectId}`}))`;
  const project = await tx.project.findUnique({
    include: {
      defaults: true,
      owner: { select: { deactivatedAt: true } },
      providerConnections: {
        orderBy: serpProviderChainOrderBy(),
        where: { enabled: true, kind: "serp", status: "connected" },
      },
    },
    where: { id: input.projectId },
  });
  const keywords = await tx.keyword.findMany({
    include: {
      locationRef: true,
      rankChecks: {
        orderBy: { checkedAt: "desc" },
        take: 1,
        where: { status: "completed" },
      },
      schedule: true,
    },
    orderBy: { id: "asc" },
    where: { id: { in: input.keywordIds }, projectId: input.projectId },
  });
  if (!project) throw new Error("Queued rank-check project no longer exists.");
  if (keywords.length !== input.keywordIds.length) {
    throw new Error("Queued rank-check batch contains missing or duplicate keywords.");
  }
  const connection = project.providerConnections[0];
  let eligibilityReason = input.preflightDeferredReason ?? null;
  if (!eligibilityReason && (project.owner.deactivatedAt || project.writeMode !== "active")) {
    eligibilityReason = "Project state no longer permits scheduled rank checks.";
  }
  if (!eligibilityReason && connection?.provider !== "dataforseo") {
    eligibilityReason = "DataForSEO is no longer the effective primary SERP provider.";
  }
  if (!eligibilityReason && connection) {
    try {
      const credentials = resolveProviderCredentials(
        connection.provider,
        connection.credentialsEncrypted,
      );
      if (!credentials.login || !credentials.password) {
        eligibilityReason = "DataForSEO credentials are unavailable.";
      }
    } catch {
      eligibilityReason = "DataForSEO credentials are unavailable.";
    }
  }
  return { connection, eligibilityReason, keywords, project };
}

function preparedKeyword(keyword: PreparedKeyword, defaults: EffectiveSchedule | null) {
  const schedule = keyword.schedule ?? defaults;
  if (!schedule || !AUTOMATIC_FREQUENCIES.has(schedule.frequency)) return null;
  const depth = resolveEffectiveSerpDepth({
    projectDepth: defaults?.serpDepth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  return {
    depth,
    estimatedCostCents: 0,
    keyword,
    previousPosition: keyword.rankChecks[0]?.position ?? null,
    schedule,
  };
}

function terminalExpiry(now: Date) {
  return new Date(now.getTime() + TERMINAL_RETENTION_DAYS * 86_400_000);
}

async function writeRunningAudit(
  tx: Prisma.TransactionClient,
  input: {
    estimatedCostCents: number;
    deferredReason: string | null;
    keywordPublicId: string;
    projectId: string;
    publicId: string;
  },
) {
  await writeAudit(
    {
      action: input.deferredReason ? "rank_check.deferred" : "rank_check.running",
      actorId: null,
      after: {
        estimatedCostCents: input.deferredReason ? 0 : input.estimatedCostCents,
        keywordId: requiredPublicAuditId(input.keywordPublicId, "kw", "Rank-check"),
        provider: "dataforseo",
        ...(input.deferredReason ? { reason: input.deferredReason } : {}),
        status: input.deferredReason ? "deferred" : "running",
      },
      projectId: input.projectId,
      targetId: requiredPublicAuditId(input.publicId, "check", "Rank-check"),
      targetType: "rank_check",
    },
    tx,
  );
}

export async function prepareQueuedRankCheckBatch(
  input: QueuedRankCheckWorkflowInput & { batchId: string; workflowRunId: string },
) {
  const config = queuedRankCheckConfig();
  const existing = await prisma.queuedRankCheckBatch.findUnique({ where: { id: input.batchId } });
  if (existing) {
    return {
      batchId: existing.id,
      maxQueueAgeSeconds: Math.max(
        1,
        Math.round((existing.queueDeadlineAt.getTime() - existing.createdAt.getTime()) / 1000),
      ),
      pollIntervalSeconds: config.pollIntervalSeconds,
      startedAt: existing.createdAt.toISOString(),
      state: existing.state,
    };
  }
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, input);
    const prepared = context.keywords.map((keyword) =>
      preparedKeyword(keyword, context.project.defaults),
    );
    const allScheduled = prepared.every((keyword) => keyword !== null);
    const estimated = prepared.reduce(
      (sum, item) => sum + (item ? dataForSeoQueuedEstimate(config.priority, item.depth) : 0),
      0,
    );
    let deferredReason: string | null = !config.enabled
      ? "Queued DataForSEO rank checks were disabled before batch preparation."
      : (context.eligibilityReason ??
        (allScheduled ? null : "Keyword schedule no longer permits automatic work."));
    if (!deferredReason) {
      try {
        await assertBudgetAvailable(input.projectId, now, {
          capCents: context.project.budgetCapCents,
          client: tx,
          estimatedCostCents: estimated,
        });
      } catch (error) {
        if (!isBudgetExhaustedError(error)) throw error;
        deferredReason = "Rank check monthly budget reached before queued batch submission.";
      }
    }

    const batch = await tx.queuedRankCheckBatch.create({
      data: {
        claimedAt: new Date(input.claimedAt),
        connectionId: context.connection?.id,
        error: deferredReason,
        expiresAt: deferredReason ? terminalExpiry(now) : null,
        id: input.batchId,
        priority: config.priority,
        projectId: input.projectId,
        queueDeadlineAt: new Date(now.getTime() + config.maxQueueAgeSeconds * 1000),
        state: deferredReason ? "deferred" : "prepared",
        terminalAt: deferredReason ? now : null,
      },
    });

    for (const [index, keyword] of context.keywords.entries()) {
      const details = prepared[index];
      const estimate = details ? dataForSeoQueuedEstimate(config.priority, details.depth) : 0;
      const publicId = makePublicId("check");
      const rankCheck = await tx.rankCheck.create({
        data: {
          checkedAt: now,
          deferredReason,
          error: deferredReason,
          estimatedCostCents: deferredReason ? null : estimate,
          finishedAt: deferredReason ? now : null,
          keywordId: keyword.id,
          normalizationVersion: null,
          previousPosition: keyword.rankChecks[0]?.position ?? null,
          provider: "dataforseo",
          publicId,
          requestedDepth: details?.depth,
          scheduleId: "dispatcher-rank-checks",
          scheduledAt: new Date(input.claimedAt),
          startedAt: now,
          status: deferredReason ? "deferred" : "running",
          trigger: "scheduled",
          workflowRunId: input.workflowRunId,
        },
      });
      const taskId = `qtask_${sha256Hex(`${input.batchId}:${keyword.id}`).slice(0, 32)}`;
      await tx.queuedRankCheckTask.create({
        data: {
          batchId: batch.id,
          error: deferredReason,
          id: taskId,
          keywordId: keyword.id,
          rankCheckId: rankCheck.id,
          state: deferredReason ? "deferred" : "prepared",
        },
      });
      await writeRunningAudit(tx, {
        deferredReason,
        estimatedCostCents: estimate,
        keywordPublicId: keyword.publicId,
        projectId: input.projectId,
        publicId,
      });
    }

    return {
      batchId: batch.id,
      maxQueueAgeSeconds: config.maxQueueAgeSeconds,
      pollIntervalSeconds: config.pollIntervalSeconds,
      startedAt: batch.createdAt.toISOString(),
      state: batch.state,
    };
  });
}
