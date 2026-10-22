import { loadContext, preparedKeyword } from "./queued-prepare-context";
import "server-only";

import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { sameDefinitionBytes } from "@/lib/measurement-definitions/canonical";
import {
  definitionWorkerInvocation,
  queuedDefinitionPermit,
} from "@/lib/measurement-definitions/worker-claim";
import { queuedDefinitionRequests } from "@/lib/measurement-definitions/worker-queued";
import { captureWorkerDefinition } from "@/lib/measurement-definitions/worker-session";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import { ProviderQuoteUnavailableError } from "@/lib/provider-rates/native-quote";
import type { QueuedRankCheckWorkflowInput } from "@/lib/temporal/queued-rank-check-contract";
import { storedDeferralReason } from "./deferral-reason";
import { queuedBatchBudgetDeferral, queuedBatchOrigin } from "./queued-attribution";
import { queuedRankCheckConfig } from "./queued-config";
import { queuedDefinitionLegacyRun } from "./queued-definition-run";
import { writeQueuedRunningAudit } from "./queued-prepare-audit";
import { resolveRunItems } from "./queued-prepare-items";
import { queuedRequestCosts } from "./queued-request-costs";
import { preparedRankRecoveryContext } from "./recovery-context";
import { applyRunItemTransition } from "./runs/items";
import { sha256Hex } from "./sha256";

const TERMINAL_RETENTION_DAYS = 30;

function terminalExpiry(now: Date) {
  return new Date(now.getTime() + TERMINAL_RETENTION_DAYS * 86_400_000);
}
export async function prepareQueuedRankCheckBatch(
  input: QueuedRankCheckWorkflowInput & { batchId: string; workflowRunId: string },
) {
  const config = queuedRankCheckConfig();
  const invocation = definitionWorkerInvocation();
  if (input.workflowRunId !== invocation.workflowRunId)
    throw new Error("Queued preparation workflow changed.");
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
    let runItems = await resolveRunItems(tx, input);
    let prepared = context.keywords.map((keyword) =>
      preparedKeyword(keyword, context.project.defaults, runItems.byKeyword.has(keyword.id)),
    );
    const allScheduled = prepared.every((keyword) => keyword !== null);
    let deferredReason: string | null = !config.enabled
      ? "Queued DataForSEO rank checks were disabled before batch preparation."
      : (context.eligibilityReason ??
        (allScheduled ? null : "Keyword schedule no longer permits automatic work."));
    const requests = !deferredReason
      ? await queuedDefinitionRequests(
          tx,
          input.projectId,
          context.keywords.map((keyword) => keyword.id),
          runItems.runId ? runItems.byKeyword : undefined,
        )
      : null;
    if (requests)
      prepared = prepared.map((entry, index) =>
        entry
          ? {
              depth: requests.get(context.keywords[index].id)!.depth,
              keyword: requests.get(context.keywords[index].id)!.keyword,
            }
          : null,
      );
    let costs: number[] = [];
    if (!deferredReason && context.connection) {
      try {
        costs = await queuedRequestCosts(
          context.connection,
          prepared.filter((item) => item !== null),
          config.priority,
          tx,
          now,
        );
      } catch (error) {
        if (!(error instanceof ProviderQuoteUnavailableError)) throw error;
        deferredReason = error.message;
      }
    }
    const estimated = costs.reduce((sum, amount) => sum + amount, 0);
    if (!deferredReason && !runItems.runId && context.connection && requests) {
      runItems = await queuedDefinitionLegacyRun(
        tx,
        { ...input, keywordIds: context.keywords.map((keyword) => keyword.id) },
        context.connection,
        requests,
        costs,
        now,
      );
    }
    const origin = await queuedBatchOrigin(tx, runItems.runId);
    if (!deferredReason && context.connection?.credentialSource !== "hosted") {
      deferredReason = await queuedBatchBudgetDeferral(
        {
          connectionId: context.connection?.id,
          credentialSource: context.connection?.credentialSource ?? null,
          estimatedCostCents: estimated,
          source: origin.source,
          tasks: prepared.flatMap((item, index) =>
            item ? [{ depth: item.depth, estimatedCostCents: costs[index] }] : [],
          ),
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
    if (!deferredReason)
      await tx.$executeRaw`UPDATE queued_rank_check_batches SET "definitionWorkflowId"=${invocation.workflowId},"definitionWorkflowRunId"=${invocation.workflowRunId} WHERE id=${batch.id}`;
    for (const [index, keyword] of context.keywords.entries()) {
      const details = prepared[index];
      const runItem = runItems.byKeyword.get(keyword.id);
      const estimate = costs[index];
      const publicId = makePublicId("check");
      const rankCheck = await tx.rankCheck.create({
        data: {
          checkedAt: now,
          deferredReason: deferredReason ? storedDeferralReason(deferredReason) : null,
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
          trigger: origin.trigger,
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
            claimAttempts: runItem.claimAttempts,
            claimExpiresAt: runItem.claimExpiresAt,
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
          recoveryContextHash: preparedRankRecoveryContext(
            keyword,
            context.project.domain,
            details?.depth,
          ),
          state: deferredReason ? "deferred" : "prepared",
        },
      });
      if (!deferredReason && context.connection) {
        const permit = await queuedDefinitionPermit(tx, rankCheck.id, true);
        const definition = await captureWorkerDefinition(tx, {
          permit,
          projectId: input.projectId,
          keywordId: keyword.id,
          connection: context.connection,
          depth: details?.depth,
          queuedTaskId: taskId,
        });
        if (!sameDefinitionBytes(definition.binding.request, requests?.get(keyword.id)))
          throw new Error("Prepared request changed before capture.");
      }
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
