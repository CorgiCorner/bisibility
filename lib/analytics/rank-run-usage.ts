import "server-only";

import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { readCanonicalUsage } from "@/lib/metering/usage-read";
import { classifyRequestUsage } from "./request-usage";
import { queueRequestUsageEvent, queueRequestUsageTask } from "./request-usage-delivery";

/** Read committed native evidence once the whole run reaches a terminal state. */
export function queueRankRunUsage(runId: string) {
  queueRequestUsageTask(async () => {
    const run = await prisma.rankCheckRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        createdAt: true,
        projectId: true,
        requestedById: true,
        trigger: true,
        source: true,
        project: { select: { ownerId: true } },
      },
    });
    if (!run) return;
    const rows = await readCanonicalUsage(Prisma.sql`"projectId"=${run.projectId}
      AND feature='rank_check' AND NOT "chargeReplayed" AND (
        "rankCheckRunId"=${run.id} OR EXISTS (
          SELECT 1 FROM rank_checks c LEFT JOIN queued_rank_check_tasks q ON q."rankCheckId"=c.id
          WHERE c."runId"=${run.id} AND (u."correlationId"=c.id OR u."correlationId"=q.id)
        ) OR EXISTS (
          SELECT 1 FROM measurement_native_dispatch_proofs d
          JOIN measurement_execution_bindings b ON b.id=d."bindingId"
          JOIN rank_checks c ON c.id=b."rankCheckId"
          WHERE d.namespace=u.namespace AND d."operationId"=u.id AND c."runId"=${run.id}
        ))`);
    const paid = rows
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
      .find(
        (row) =>
          row.measurementStatus === "recorded" &&
          classifyRequestUsage({
            provider: row.provider,
            used: true,
            cached: row.cached,
            costCents:
              row.provider === "serpapi" && row.credentialSource === "own"
                ? row.budgetCents === null
                  ? null
                  : Number(row.budgetCents)
                : row.costCents === null
                  ? null
                  : Number(row.costCents),
            quantity: row.usageQuantity === null ? null : Number(row.usageQuantity),
            failed: row.failed,
          }) === "paid_request_used",
      );
    if (!paid || (paid.provider !== "dataforseo" && paid.provider !== "serpapi")) return;
    queueRequestUsageEvent({
      operationKey: `rank-run/${run.id}`,
      userId: run.requestedById ?? run.project.ownerId,
      timestamp: run.createdAt,
      properties: {
        provider: paid.provider,
        feature: "rank_check",
        trigger:
          run.trigger === "scheduled"
            ? "scheduled"
            : run.trigger === "api" || ["api", "mcp", "sdk", "cli"].includes(run.source ?? "")
              ? "api"
              : run.trigger === "manual"
                ? "manual"
                : "unknown",
        payment: paid.credentialSource === "hosted" ? "credits" : "byok",
      },
    });
  });
}
