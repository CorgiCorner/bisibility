import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { publishOperationChanged } from "@/lib/notifications/realtime";
import {
  launchQueuedRankCheckRuns,
  type StartQueuedRankCheckRun,
} from "@/lib/rank-check/planner/queued-launch";
import { ACTIVE_RUN_STATUSES } from "./contract";
import { pendingRunItemCount, runCounterData, runCountsFromItemGroups } from "./counts";
import { finalizeRankCheckRun } from "./finalize";

const EMPTY_RUN_GRACE_MS = 10 * 60_000;
export const RANK_CHECK_RUN_CLAIM_TIMEOUT_MS = 10 * 60_000;

export type RankCheckRunWorkflowGateway = {
  startRun: StartQueuedRankCheckRun;
  workflowExists: (workflowId: string) => Promise<boolean>;
};

export async function reclaimStaleRankCheckRunWorkflowClaims(
  input: { limit: number; now: Date; workflowExists: (workflowId: string) => Promise<boolean> },
  client: Pick<typeof prisma, "rankCheckRun"> = prisma,
) {
  const cutoff = new Date(input.now.getTime() - RANK_CHECK_RUN_CLAIM_TIMEOUT_MS);
  const rows = await client.rankCheckRun.findMany({
    orderBy: { claimedAt: "asc" },
    select: { claimedAt: true, id: true, orchestrationWorkflowId: true },
    take: input.limit,
    where: {
      claimedAt: { lt: cutoff },
      orchestrationWorkflowId: { not: null },
      status: "queued",
    },
  });
  let reclaimed = 0;
  for (const run of rows) {
    if (!run.orchestrationWorkflowId || !run.claimedAt) continue;
    if (await input.workflowExists(run.orchestrationWorkflowId)) continue;
    const updated = await client.rankCheckRun.updateMany({
      data: { claimedAt: null },
      where: { claimedAt: run.claimedAt, id: run.id, status: "queued" },
    });
    reclaimed += updated.count;
  }
  return reclaimed;
}

export async function reconcileRankCheckRuns(
  input: { limit: number; now: Date },
  client: typeof prisma = prisma,
  workflowGateway?: RankCheckRunWorkflowGateway,
) {
  if (!Number.isInteger(input.limit) || input.limit <= 0) {
    throw new Error("limit must be a positive integer.");
  }
  const emptyRunCutoff = new Date(input.now.getTime() - EMPTY_RUN_GRACE_MS);
  if (workflowGateway) {
    await reclaimStaleRankCheckRunWorkflowClaims(
      { ...input, workflowExists: workflowGateway.workflowExists },
      client,
    );
    await launchQueuedRankCheckRuns({ ...input, startRun: workflowGateway.startRun }, client);
  }
  let cursor: string | undefined;
  let reconciled = 0;

  for (;;) {
    const candidates = await client.rankCheckRun.findMany({
      orderBy: { id: "asc" },
      select: {
        createdAt: true,
        id: true,
        orchestrationWorkflowId: true,
        projectId: true,
        requestedCount: true,
        status: true,
        updatedAt: true,
      },
      take: input.limit + 1,
      where: {
        OR: [{ items: { some: {} } }, { createdAt: { lt: emptyRunCutoff } }],
        ...(cursor ? { id: { gt: cursor } } : {}),
        // Planned occurrences are schedule projections and have no items until launch.
        status: { in: [...ACTIVE_RUN_STATUSES, "blocked"] },
        updatedAt: { lt: input.now },
      },
    });
    const page = candidates.slice(0, input.limit);

    for (const run of page) {
      const status = run.status;
      const groupedItems = await client.rankCheckRunItem.groupBy({
        _count: { _all: true },
        _sum: { actualCostCents: true },
        by: ["keywordId", "status"],
        where: { runId: run.id },
      });
      const groups = groupedItems;
      if (groups.length === 0 && run.createdAt >= emptyRunCutoff) continue;
      const counts = runCountsFromItemGroups(groups, run.requestedCount);
      const pending = pendingRunItemCount(groups);
      const data = runCounterData(counts, groups);
      if (pending > 0) {
        await client.$executeRaw(Prisma.sql`
          UPDATE "rank_check_runs"
          SET
            "cancelledCount" = GREATEST("cancelledCount", ${counts.cancelled}),
            "completedCount" = GREATEST("completedCount", ${counts.completed}),
            "deferredCount" = GREATEST("deferredCount", ${counts.deferred}),
            "failedCount" = GREATEST("failedCount", ${counts.failed}),
            "skippedCount" = GREATEST("skippedCount", ${counts.skipped}),
            "keywordCount" = ${data.keywordCount},
            "targetCount" = ${data.targetCount},
            "totalCount" = ${data.totalCount},
            "updatedAt" = ${input.now}
          WHERE "id" = ${run.id} AND "status" = ${status}
        `);
        continue;
      }
      const finalized = await finalizeRankCheckRun(client, {
        groups,
        now: input.now,
        run: { ...run, status },
      });
      if (finalized.finalized) {
        await publishOperationChanged({ projectId: finalized.projectId }).catch(() => undefined);
      }
    }

    reconciled += page.length;
    if (candidates.length <= input.limit) {
      return { hasMore: false, reconciled, sweepAt: input.now };
    }
    cursor = page.at(-1)?.id;
  }
}
