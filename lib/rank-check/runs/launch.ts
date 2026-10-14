import { materializeRankRun } from "./launch-write";
import "server-only";
import { ApiConflictError } from "@/lib/api/errors";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id";
import { assertLaunchPolicy } from "@/lib/measurement-definitions/host-launch-policy";
import { readHostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-snapshot";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import type { ProviderRequestOrigin } from "@/lib/provider-usage/surface";
import { loadSerpProviderChain } from "@/lib/rank-check/provider-chain-loader";
import {
  activeMarketLocationIds,
  isRunnableKeyword,
  runnableKeywordWhere,
  unrunnableKeywordReason,
} from "@/lib/rank-check/runnable";
import { resolveSerpStopOnMatch } from "@/lib/serp/constants";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import type { RankRunHostBoundary } from "./launch-host";
import {
  apiIdempotencyKey,
  findIdempotentRun,
  isUniqueConstraintError,
} from "./launch-idempotency";
import {
  assertLaunchBudget,
  lockLaunchSourceSnapshot,
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
import { quoteRunRows } from "./native-quotes";
import { previewSourceHash } from "./preview-source-hash";
import {
  lockRunSelectionKeywords,
  resolveRunSelection,
  runSelectionKeywordHeld,
  runSelectionKeywordSelect,
} from "./selection";
export async function launchRankCheckRun(
  input: LaunchRankCheckRunInput & { retry?: RetryLaunch },
  host: RankRunHostBoundary = {},
): Promise<LaunchRankCheckRunResult> {
  requireRankCheckRunProject(input.project);
  // Early preflight: a manual request the gate refuses is rejected before any
  // selection, connection, or run row is created.
  await assertOperationAccess(input.project.id);
  // A lost response must recover the committed run even after its preview or membership changes.
  const idempotencyKey = apiIdempotencyKey(input.idempotencyKey);
  const existing = await findIdempotentRun(input.project.id, idempotencyKey);
  if (existing) {
    await host.assertReplay?.(prisma, idempotencyKey);
    return existing;
  }
  const now = new Date();
  const resolved = await resolveRunSelection(input.project, input.spec);
  const activeLocationIds = await activeMarketLocationIds(input.project.id, prisma);
  const [project, rows, connections] = await Promise.all([
    prisma.project.findUnique({
      select: {
        domain: true,
        defaults: { select: { serpDepth: true, serpStopOnMatch: true } },
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
    ? await quoteRunRows(executable, project.defaults?.serpDepth, input, connections[0])
    : {
        native: { providerId: null, unit: null, quantity: null, unknownTargets: 0 },
        costCents: null,
        targets: [],
      };
  const measurementPolicy = await prisma.$transaction(
    (tx) => readHostPolicySnapshot(tx, input.project.id),
    { isolationLevel: "RepeatableRead" },
  );
  if (connections[0])
    assertLaunchPolicy(
      measurementPolicy,
      connections[0].provider,
      executable,
      estimate.targets.map((target) => target.depth),
    );
  if (!input.retry) {
    verifyLaunchPreviewToken(
      input,
      estimate.costCents,
      resolved.selectionHash,
      now,
      previewSourceHash({
        domain: project.domain,
        rows: executable,
        stopOnMatch: resolveSerpStopOnMatch(project.defaults?.serpStopOnMatch),
        depths: estimate.targets.map((target) => target.depth),
        provider: connections[0] ?? null,
        measurementPolicy,
      }),
    );
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
        await host.assertActor?.(tx);
        const {
          connection: currentConnection,
          project: currentProject,
          measurementPolicy: currentPolicy,
        } = await lockLaunchSourceSnapshot(tx, input.project.id, input.providerId);
        const concurrent = await findIdempotentRun(input.project.id, idempotencyKey, tx);
        if (concurrent) {
          await host.assertReplay?.(tx, idempotencyKey);
          return { existing: concurrent };
        }
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
        const consent = await host.assertAdmission?.(tx);
        const estimate = await quoteRunRows(
          executable,
          currentProject.defaults?.serpDepth,
          input,
          currentConnection,
          tx,
        );
        assertLaunchPolicy(
          currentPolicy,
          currentConnection.provider,
          executable,
          estimate.targets.map((target) => target.depth),
        );
        if (!input.retry) {
          verifyLaunchPreviewToken(
            input,
            estimate.costCents,
            resolved.selectionHash,
            now,
            previewSourceHash({
              domain: currentProject.domain,
              rows: executable,
              stopOnMatch: resolveSerpStopOnMatch(currentProject.defaults?.serpStopOnMatch),
              depths: estimate.targets.map((target) => target.depth),
              provider: currentConnection,
              measurementPolicy: currentPolicy,
            }),
          );
        }
        if (currentConnection.credentialSource !== "hosted") {
          await assertLaunchBudget(input, currentConnection, estimate, now, tx);
        }
        return materializeRankRun(tx, {
          input,
          currentConnection,
          estimate,
          executable,
          resolved,
          now,
          publicId,
          orchestrationWorkflowId,
          host,
          consent: consent || undefined,
          idempotencyKey,
        });
      },
      { maxWait: 10_000, timeout: 60_000 },
    );
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const concurrent = await findIdempotentRun(input.project.id, idempotencyKey);
    if (!concurrent) throw error;
    await host.assertReplay?.(prisma, idempotencyKey);
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
