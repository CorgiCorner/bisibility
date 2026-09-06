import "server-only";

import { prisma } from "@/lib/db/prisma";
import { startSearchInsightsSyncWorkflow } from "@/lib/temporal/search-insights-client";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;

export type RequestedSyncReconciliationResult = {
  claimed: number;
  failed: number;
  scanned: number;
  skipped: number;
  started: number;
};

function boundedBatchSize(value: number | undefined) {
  if (!Number.isInteger(value) || !value) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, value));
}

export async function reconcileRequestedSearchInsightsSyncs(options: { batchSize?: number } = {}) {
  const rows = await prisma.searchAnalyticsImport.findMany({
    orderBy: [{ syncRequestedAt: "asc" }, { id: "asc" }],
    select: { id: true, projectId: true, syncRequestedAt: true },
    take: boundedBatchSize(options.batchSize),
    where: {
      pausedReason: null,
      source: "gsc",
      state: { notIn: ["queued", "running"] },
      syncRequestedAt: { not: null },
      syncStartedAt: null,
    },
  });
  const result: RequestedSyncReconciliationResult = {
    claimed: 0,
    failed: 0,
    scanned: rows.length,
    skipped: 0,
    started: 0,
  };

  for (const row of rows) {
    if (!row.syncRequestedAt) {
      result.skipped += 1;
      continue;
    }
    const syncStartedAt = new Date();
    const claimed = await prisma.searchAnalyticsImport.updateMany({
      data: { syncStartedAt },
      where: {
        id: row.id,
        state: { notIn: ["queued", "running"] },
        syncRequestedAt: row.syncRequestedAt,
        syncStartedAt: null,
      },
    });
    if (claimed.count !== 1) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;

    try {
      const started = await startSearchInsightsSyncWorkflow({ projectId: row.projectId });
      await prisma.searchAnalyticsImport.updateMany({
        data: { syncRequestedAt: null },
        where: {
          id: row.id,
          syncRequestedAt: row.syncRequestedAt,
          syncStartedAt,
        },
      });
      result.started += 1;
      console.info("[search-insights] queued sync started", {
        importId: row.id,
        projectId: row.projectId,
        workflowId: started.workflowId,
      });
    } catch (error) {
      result.failed += 1;
      await prisma.searchAnalyticsImport.updateMany({
        data: { syncStartedAt: null },
        where: {
          id: row.id,
          syncRequestedAt: row.syncRequestedAt,
          syncStartedAt,
        },
      });
      console.error("[search-insights] queued sync reconciliation failed", {
        error,
        importId: row.id,
        projectId: row.projectId,
      });
    }
  }

  return result;
}
