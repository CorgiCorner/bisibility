import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { startSearchInsightsBackfillWorkflow } from "@/lib/temporal/search-insights-client";
import { resolveSearchInsightsConnection } from "./credentials";
import { resolveOrganicSessionsConnection } from "./sessions-credentials";

const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 100;
// A sweep starts at most batchSize workflows and scans at most four pages.
const MAX_SCAN_BATCHES = 4;

type QueuedImportSource = "ga4" | "gsc";

export type QueuedImportReconciliationResult = {
  attempted: number;
  failed: number;
  scanned: number;
  skipped: number;
  stamped: number;
};

function boundedBatchSize(value: number | undefined) {
  if (!Number.isInteger(value) || !value) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.max(1, value));
}

function unfinished(row: { cursorDate: Date | null; earliestTargetDate: Date | null }) {
  return !(row.cursorDate && row.earliestTargetDate && row.cursorDate < row.earliestTargetDate);
}

async function matchesActiveConnection(row: {
  projectId: string;
  property: string;
  source: QueuedImportSource;
}) {
  const connection =
    row.source === "gsc"
      ? await resolveSearchInsightsConnection(row.projectId)
      : await resolveOrganicSessionsConnection(row.projectId);
  return connection?.property === row.property;
}

export async function reconcileQueuedSearchInsightsImports(options: { batchSize?: number } = {}) {
  const batchSize = boundedBatchSize(options.batchSize);
  const scanLimit = batchSize * MAX_SCAN_BATCHES;
  const result: QueuedImportReconciliationResult = {
    attempted: 0,
    failed: 0,
    scanned: 0,
    skipped: 0,
    stamped: 0,
  };
  let cursorId: string | undefined;

  while (result.scanned < scanLimit && result.attempted < batchSize) {
    const rows = await prisma.searchAnalyticsImport.findMany({
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        cursorDate: true,
        earliestTargetDate: true,
        id: true,
        projectId: true,
        property: true,
        source: true,
      },
      take: Math.min(batchSize, scanLimit - result.scanned),
      where: { pausedReason: null, source: { in: ["gsc", "ga4"] }, state: "queued" },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      if (result.attempted >= batchSize) break;
      result.scanned += 1;
      cursorId = row.id;
      const source = row.source as QueuedImportSource;
      if (!unfinished(row)) {
        result.skipped += 1;
        continue;
      }
      try {
        if (!(await matchesActiveConnection({ ...row, source }))) {
          result.skipped += 1;
          continue;
        }
        result.attempted += 1;
        const started = await startSearchInsightsBackfillWorkflow({
          projectId: row.projectId,
          property: row.property,
          source,
        });
        if (!(await matchesActiveConnection({ ...row, source }))) {
          result.skipped += 1;
          continue;
        }
        const propertyGuard = (
          source === "gsc"
            ? { propertyKey: row.property, status: "active" }
            : { ga4PropertyId: row.property, status: "active" }
        ) satisfies Prisma.SearchInsightsPropertyRegistryWhereInput;
        const stamped = await prisma.searchAnalyticsImport.updateMany({
          data: { workflowId: started.workflowId },
          where: {
            id: row.id,
            pausedReason: null,
            project: { searchInsightsPropertyRegistry: { some: propertyGuard } },
            state: "queued",
          },
        });
        if (stamped.count === 1) result.stamped += 1;
        else result.skipped += 1;
      } catch (error) {
        result.failed += 1;
        console.error("[search-insights] queued import reconciliation failed", {
          error,
          importId: row.id,
          projectId: row.projectId,
          source,
        });
      }
    }
    if (rows.length < batchSize) break;
  }
  return result;
}
