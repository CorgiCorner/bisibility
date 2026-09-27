import "server-only";

import { ApiConflictError } from "@/lib/api/errors";
import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import {
  activeMarketLocationIds,
  isRunnableKeyword,
  runnableKeywordWhere,
  unrunnableKeywordReason,
} from "@/lib/rank-check/runnable";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import {
  apiIdempotencyKey,
  findIdempotentRun,
  isUniqueConstraintError,
} from "./launch-idempotency";
import {
  assertLaunchBudget,
  estimatedRunUsageQuantity,
  estimateRunRows,
  lockLaunchSourceSnapshot,
  providerAllocationReservation,
  quoteRankRunReservationForLaunch,
  runUsageEstimate,
  verifyLaunchPreviewToken,
} from "./launch-preflight";
import {
  LaunchRankCheckRunError,
  type LaunchRankCheckRunInput,
  type LaunchRankCheckRunResult,
  launchNothingToRunReason,
  launchRankCheckRunNothingToRun,
  type RetryLaunch,
  type RetryParentRun,
  requireRankCheckRunProject,
} from "./launch-types";
import {
  lockRunSelectionKeywords,
  resolveRunSelection,
  runSelectionKeywordHeld,
  runSelectionKeywordSelect,
} from "./selection";

export async function launchRankCheckRun(
  input: LaunchRankCheckRunInput & { retry?: RetryLaunch },
): Promise<LaunchRankCheckRunResult> {
  requireRankCheckRunProject(input.project);
  // Early preflight: a manual request the gate refuses is rejected before any
  // selection, connection, or run row is created.
  await assertOperationAccess(input.project.id);
  // A lost response must recover the committed run even after its preview or membership changes.
  const idempotencyKey = apiIdempotencyKey(input.idempotencyKey);
  const existing = await findIdempotentRun(input.project.id, idempotencyKey);
  if (existing) return existing;
  const now = new Date();
  const resolved = await resolveRunSelection(input.project, input.spec);
  const activeLocationIds = await activeMarketLocationIds(input.project.id, prisma);
  const [project, rows, connections] = await Promise.all([
    prisma.project.findUnique({
      select: {
        budgetCapCents: true,
        defaults: { select: { serpDepth: true } },
        providerAllocationsInitializedAt: true,
      },
      where: { id: input.project.id },
    }),
    prisma.keyword.findMany({
      orderBy: { id: "asc" },
      select: runSelectionKeywordSelect,
      where: {
        ...runnableKeywordWhere(activeLocationIds),
        id: { in: resolved.keywordIds },
        projectId: input.project.id,
      },
    }),
    loadSerpProviderChain(input.project.id, input.providerId),
  ]);
  if (!project) throw new Error("Project not found.");
  // A retry may bypass the in-progress check, never runnability: a paused market or an
  // archived row must not be bought again just because an earlier item failed. A manual launch
  // skips only keywords in flight, exactly as its preview does, so the signed estimate matches.
  const executable = rows.filter(
    (row) =>
      Boolean(connections[0]) &&
      isRunnableKeyword(row, activeLocationIds) &&
      (input.retry ? true : !runSelectionKeywordHeld(row, input.trigger)),
  );
  const estimate = connections[0]
    ? estimateRunRows(executable, project.defaults?.serpDepth, input, connections[0])
    : {
        native: { providerId: null, unit: null, quantity: null, unknownTargets: 0 },
        costCents: null,
        targets: [],
      };
  if (!input.retry) {
    verifyLaunchPreviewToken(input, estimate.costCents, resolved.selectionHash, now);
  }
  if (!connections[0]) throw new LaunchRankCheckRunError("no_provider");
  const publicId = makePublicId("rcr");
  const orchestrationWorkflowId = `rank-check-run-${publicId}`;
  let created:
    | { estimatedCostCents: number; id: string; keywordCount: number; targetCount: number }
    | { existing: Exclude<Awaited<ReturnType<typeof findIdempotentRun>>, null> }
    | ReturnType<typeof launchRankCheckRunNothingToRun>;
  try {
    created = await prisma.$transaction(
      async (tx) => {
        const { connection: currentConnection, project: currentProject } =
          await lockLaunchSourceSnapshot(tx, input.project.id, input.providerId);
        const lockedRows = await lockRunSelectionKeywords(
          tx,
          input.project.id,
          resolved.keywordIds,
        );
        const lockedActiveLocationIds = await activeMarketLocationIds(input.project.id, tx);
        const executable = lockedRows.filter(
          (row) =>
            isRunnableKeyword(row, lockedActiveLocationIds) &&
            !runSelectionKeywordHeld(row, input.trigger),
        );
        if (executable.length === 0) {
          // Nothing ran, so the operator is owed the cause rather than the most common guess. The
          // locked rows are the authority: the predicate verdict for each one, read under the same
          // lock that decided not to buy anything.
          return launchRankCheckRunNothingToRun(
            launchNothingToRunReason(
              lockedRows.map((row) => unrunnableKeywordReason(row, lockedActiveLocationIds)),
            ),
          );
        }
        const estimate = estimateRunRows(
          executable,
          currentProject.defaults?.serpDepth,
          input,
          currentConnection,
        );
        if (!input.retry) {
          verifyLaunchPreviewToken(input, estimate.costCents, resolved.selectionHash, now);
        }
        const concurrent = await findIdempotentRun(input.project.id, idempotencyKey, tx);
        if (concurrent) return { existing: concurrent };
        if (currentConnection.credentialSource !== "hosted") {
          await assertLaunchBudget(input, currentProject, currentConnection, estimate, now, tx);
        }
        const rankReservation = await quoteRankRunReservationForLaunch(tx, {
          connection: currentConnection,
          projectId: input.project.id,
          source: input.origin.source,
          targets: estimate.targets,
        });
        const estimatedCostCents = estimate.costCents ?? 0;
        const allocationReservation =
          currentProject.providerAllocationsInitializedAt && currentConnection.id
            ? providerAllocationReservation(
                currentConnection.id,
                estimatedRunUsageQuantity(estimate),
              )
            : currentConnection.id
              ? { providerConnectionId: currentConnection.id }
              : {};
        const usageEstimate = runUsageEstimate(currentConnection, estimate);
        const keywordCount = new Set(executable.map(({ text }) => text)).size;
        const run = await tx.rankCheckRun.create({
          data: {
            credentialId: input.origin.credential?.id ?? null,
            credentialKind: input.origin.credential?.kind ?? null,
            estimatedCostCents,
            idempotencyKey,
            keywordCount,
            launchedAt: now,
            orchestrationWorkflowId,
            parentRelation: input.retry?.relation,
            parentRunId: input.retry?.parentRunId,
            projectId: input.project.id,
            publicId,
            requestedById: input.actorId,
            requestedCount: resolved.keywordIds.length,
            selectionHash: resolved.selectionHash,
            selectionKind: input.retry?.relation ?? input.spec.kind,
            selectionSpec: input.retry
              ? {
                  kind: input.retry.relation,
                  parentRunId: input.retry.parentRunPublicId,
                  v: 1,
                  ...usageEstimate,
                  ...allocationReservation,
                  ...rankReservation,
                }
              : {
                  ...input.spec,
                  depth: input.depth ?? null,
                  providerId: input.providerId ?? null,
                  ...usageEstimate,
                  ...allocationReservation,
                  ...rankReservation,
                },
            skippedCount: 0,
            source: input.origin.source,
            status: "queued",
            targetCount: executable.length,
            totalCount: executable.length,
            trigger: input.trigger,
          },
          select: { id: true },
        });
        await tx.rankCheckRunItem.createMany({
          data: estimate.targets.map((target) => ({
            estimatedCostCents: target.cost,
            keywordId: target.keywordId,
            notBefore: null,
            runId: run.id,
            sourceRunItemId: input.retry?.sources.get(target.keywordId),
            status: "queued",
          })),
        });
        await writeAudit(
          {
            action: input.retry ? "rank_check_run.retry" : "rank_check_run.launch",
            actorId: input.actorId,
            after: input.retry
              ? { parentRunId: input.retry.parentRunPublicId, relation: input.retry.relation }
              : {
                  estimatedCostCents,
                  keywordCount,
                  publicId,
                  selectionKind: input.spec.kind,
                  targetCount: executable.length,
                  trigger: input.trigger,
                },
            projectId: input.project.id,
            targetId: publicId,
            targetType: "rank_check_run",
          },
          tx,
        );
        return { estimatedCostCents, id: run.id, keywordCount, targetCount: executable.length };
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const concurrent = await findIdempotentRun(input.project.id, idempotencyKey);
    if (!concurrent) throw error;
    return concurrent;
  }
  if ("outcome" in created) return created;
  if ("existing" in created) return created.existing;
  // The committed row is the intent; this wake only shortens the worker's pickup latency.
  void publishWorkerIntent("rank_run").catch(() => undefined);
  return {
    estimatedCostCents: created.estimatedCostCents,
    keywordCount: created.keywordCount,
    publicId,
    status: "queued",
    targetCount: created.targetCount,
  };
}
export function launchRetryRun(input: {
  actorId: string;
  origin: ProviderRequestOrigin;
  parentRun: RetryParentRun;
  relation: RetryLaunch["relation"];
}) {
  if (input.parentRun.status !== "completed" && input.parentRun.status !== "cancelled") {
    throw new ApiConflictError("Only completed or cancelled runs can be retried.");
  }
  const itemStatus = input.relation === "retry_failed" ? "failed" : "deferred";
  const items = input.parentRun.items.filter((item) => item.status === itemStatus);
  if (items.length === 0) throw new ApiConflictError("The run has no matching items to retry.");
  return launchRankCheckRun({
    actorId: input.actorId,
    origin: input.origin,
    previewToken: "",
    project: input.parentRun.project,
    retry: {
      parentRunId: input.parentRun.id,
      parentRunPublicId: input.parentRun.publicId,
      relation: input.relation,
      sources: new Map(items.map((item) => [item.keyword.id, item.id])),
    },
    spec: {
      kind: "selected",
      keywordIds: items.map((item) => item.keyword.publicId as `kw_${string}`),
      v: 1,
    },
    trigger: "retry" as LaunchRankCheckRunInput["trigger"],
  });
}
