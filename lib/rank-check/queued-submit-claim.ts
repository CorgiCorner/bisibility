import "server-only";

import { prisma } from "@/lib/db/prisma";
import { assertOperationAccess } from "@/lib/operations/access-extension";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import { resolveSerpDepth } from "@/lib/serp/constants";
import { assertQueuedRankCheckBatchAllocation } from "./allocation-enforcement";

/** A prepared batch gets one claim; resumed submitting work cannot POST again. */
export async function claimQueuedSubmission(batchId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`queued-rank-submit:${batchId}`}))`;
    const batchQuery = {
      include: {
        connection: true,
        project: { include: { defaults: true } },
        tasks: {
          include: {
            keyword: { include: { locationRef: true, schedule: true } },
            rankCheck: { select: { requestedDepth: true } },
          },
          orderBy: { id: "asc" },
        },
      },
      where: { id: batchId },
    } as const;
    let batch = await tx.queuedRankCheckBatch.findUniqueOrThrow(batchQuery);
    if (batch.state === "submitting") return { batch, claimed: false };
    if (batch.state !== "prepared") return { batch, claimed: false };
    if (batch.runId) {
      const runs = await tx.$queryRaw<Array<{ status: string }>>`
        SELECT "status" FROM "rank_check_runs" WHERE "id" = ${batch.runId} FOR UPDATE
      `;
      if (!runs[0] || !["queued", "running"].includes(runs[0].status)) {
        batch = await tx.queuedRankCheckBatch.findUniqueOrThrow(batchQuery);
        return { batch, claimed: false };
      }
    }
    // Access applies only to a new claim. Retrieval remains possible after a later denial.
    await assertOperationAccess(batch.projectId);
    const connection = batch.connection;
    if (connection && connection.credentialSource !== "hosted") {
      await assertQueuedRankCheckBatchAllocation(
        {
          connection,
          priority: batch.priority === "normal" ? "normal" : "high",
          projectId: batch.projectId,
          surface: surfaceOf(batch.source as ProviderRequestSource | null),
          tasks: batch.tasks.map((task) => ({
            depth: resolveSerpDepth(task.rankCheck.requestedDepth ?? undefined),
          })),
        },
        tx,
      );
    }
    const claimed = await tx.queuedRankCheckBatch.updateMany({
      data: { state: "submitting" },
      where: { id: batchId, state: "prepared" },
    });
    if (claimed.count === 0) return { batch, claimed: false };
    await tx.queuedRankCheckTask.updateMany({
      data: { state: "submitting" },
      where: { batchId, state: "prepared" },
    });
    return { batch, claimed: true };
  });
}
