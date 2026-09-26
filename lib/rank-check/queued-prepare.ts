import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import { resolveProviderCredentials } from "@/lib/providers/credentials";
import { queuedDeploymentCredentialsAvailable } from "@/lib/providers/execution-extension";
import { resolveEffectiveSerpDepth } from "@/lib/serp/constants";
import type { QueuedRankCheckWorkflowInput } from "@/lib/temporal/queued-rank-check-contract";
import { serpProviderChainOrderBy } from "./provider-chain-order";
import { queuedBatchBudgetDeferral, queuedBatchOrigin } from "./queued-attribution";
import { queuedRankCheckConfig } from "./queued-config";
import { unrunnableBatchReason } from "./queued-eligibility";
import { writeQueuedRunningAudit } from "./queued-prepare-audit";
import { dataForSeoQueuedEstimate } from "./queued-pricing";
import { applyRunItemTransition } from "./runs/items";
import { sha256Hex } from "./sha256";

const TERMINAL_RETENTION_DAYS = 30;
const AUTOMATIC_FREQUENCIES = new Set(["daily", "weekly", "monthly", "custom_cron"]);
type PreparedKeyword = Awaited<ReturnType<typeof loadContext>>["keywords"][number];
type EffectiveSchedule = {
  frequency: string;
  serpDepth: number | null;
};
type ResolvedRunItem = { id: string; keywordId: string; runId: string };
async function resolveRunItems(tx: Prisma.TransactionClient, input: QueuedRankCheckWorkflowInput) {
  if (input.runItemIds && input.runItemIds.length !== input.keywordIds.length) {
    throw new Error("runItemIds must align with keywordIds.");
  }
  if (input.runItemIds && new Set(input.runItemIds).size !== input.runItemIds.length) {
    throw new Error("runItemIds must be unique.");
  }
  if (!input.runItemIds && !input.runId) {
    return { byKeyword: new Map<string, ResolvedRunItem>(), runId: undefined };
  }
  const rows = await tx.rankCheckRunItem.findMany({
    select: { id: true, keywordId: true, runId: true },
    where: input.runItemIds
      ? { id: { in: input.runItemIds } }
      : input.runId
        ? { keywordId: { in: input.keywordIds }, runId: input.runId }
        : { id: { in: [] } },
  });
  if (input.runItemIds && rows.length !== input.runItemIds.length) {
    throw new Error("Queued rank-check run item no longer exists.");
  }
  const byId = new Map(rows.map((item) => [item.id, item]));
  const byKeyword = new Map<string, ResolvedRunItem>();
  for (const [index, keywordId] of input.keywordIds.entries()) {
    const itemId = input.runItemIds?.[index];
    const item = itemId ? byId.get(itemId) : rows.find((row) => row.keywordId === keywordId);
    if (!item) continue;
    if (item.keywordId !== keywordId || (input.runId && item.runId !== input.runId)) {
      throw new Error("Queued rank-check run item does not match its keyword or run.");
    }
    byKeyword.set(keywordId, item);
  }
  const runIds = new Set(rows.map((item) => item.runId));
  if (runIds.size > 1) throw new Error("Queued rank-check batch spans multiple runs.");
  return { byKeyword, runId: rows[0]?.runId };
}
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
      checkSchedule: { select: { serpDepth: true } },
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
  eligibilityReason ??= await unrunnableBatchReason(tx, input.projectId, keywords);
  if (!eligibilityReason && connection?.provider !== "dataforseo") {
    eligibilityReason = "DataForSEO is no longer the effective primary SERP provider.";
  }
  if (!eligibilityReason && connection) {
    try {
      if (connection.credentialSource === "hosted") {
        if (!queuedDeploymentCredentialsAvailable("dataforseo")) {
          eligibilityReason = "DataForSEO credentials are unavailable.";
        }
      } else {
        const credentials = resolveProviderCredentials(
          connection.provider,
          connection.credentialsEncrypted,
        );
        if (!credentials.login || !credentials.password) {
          eligibilityReason = "DataForSEO credentials are unavailable.";
        }
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
    checkScheduleDepth: keyword.checkSchedule?.serpDepth,
    scheduleDepth: keyword.schedule?.serpDepth,
  });
  return {
    depth,
  };
}
function terminalExpiry(now: Date) {
  return new Date(now.getTime() + TERMINAL_RETENTION_DAYS * 86_400_000);
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
  const result = await prisma.$transaction(async (tx) => {
    const context = await loadContext(tx, input);
    const runItems = await resolveRunItems(tx, input);
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
    const origin = await queuedBatchOrigin(tx, runItems.runId);
    if (!deferredReason && context.connection?.credentialSource !== "hosted") {
      deferredReason = await queuedBatchBudgetDeferral(
        {
          connectionId: context.connection?.id,
          estimatedCostCents: estimated,
          project: context.project,
          source: origin.source,
          tasks: prepared.flatMap((item) => (item ? [{ depth: item.depth }] : [])),
        },
        { now, priority: config.priority, projectId: input.projectId },
        tx,
      );
    }
    const batch = await tx.queuedRankCheckBatch.create({
      data: {
        ...origin,
        claimedAt: new Date(input.claimedAt),
        connectionId: context.connection?.id,
        error: deferredReason,
        expiresAt: deferredReason ? terminalExpiry(now) : null,
        id: input.batchId,
        priority: config.priority,
        projectId: input.projectId,
        queueDeadlineAt: new Date(now.getTime() + config.maxQueueAgeSeconds * 1000),
        ...(runItems.runId ? { runId: runItems.runId } : {}),
        state: deferredReason ? "deferred" : "prepared",
        terminalAt: deferredReason ? now : null,
      },
    });
    for (const [index, keyword] of context.keywords.entries()) {
      const details = prepared[index];
      const runItem = runItems.byKeyword.get(keyword.id);
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
          ...(runItem ? { runId: runItem.runId } : {}),
          scheduleId: "dispatcher-rank-checks",
          scheduledAt: new Date(input.claimedAt),
          startedAt: now,
          status: deferredReason ? "deferred" : "running",
          trigger: "scheduled",
          workflowRunId: input.workflowRunId,
        },
      });
      if (runItem) {
        const linked = await tx.rankCheckRunItem.updateMany({
          data: { claimExpiresAt: null, rankCheckId: rankCheck.id },
          where: {
            id: runItem.id,
            keywordId: keyword.id,
            rankCheckId: null,
            status: "running",
          },
        });
        if (linked.count !== 1) {
          throw new Error("Queued rank-check run item claim was lost before preparation.");
        }
      }
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
      await writeQueuedRunningAudit(tx, {
        deferredReason,
        estimatedCostCents: estimate,
        keywordPublicId: keyword.publicId,
        projectId: input.projectId,
        publicId,
      });
      if (deferredReason && runItem) {
        await applyRunItemTransition(tx, { rankCheckId: rankCheck.id, to: "deferred" });
      }
    }
    return {
      batchId: batch.id,
      maxQueueAgeSeconds: config.maxQueueAgeSeconds,
      pollIntervalSeconds: config.pollIntervalSeconds,
      startedAt: batch.createdAt.toISOString(),
      state: batch.state,
    };
  });
  await publishOperationChanged({ projectId: input.projectId }).catch(() => undefined);
  return result;
}
