import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  startSearchInsightsBackfillWorkflow,
  startSearchInsightsSyncWorkflow,
} from "@/lib/temporal/search-insights-client";
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

/**
 * Whether the backfill still has history to walk. False once the cursor has passed the earliest
 * target, which is what a completed import looks like.
 */
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
      try {
        if (!(await matchesActiveConnection({ ...row, source }))) {
          result.skipped += 1;
          continue;
        }
        result.attempted += 1;
        // A queued row with history left is a backfill. A queued row with none is a sync the user
        // asked for on an import that already finished, which is what the Sync now button now
        // records instead of starting a workflow it cannot reach. Skipping the second case, as
        // this loop used to, would turn that button into a control that quietly does nothing.
        const started = unfinished(row)
          ? await startSearchInsightsBackfillWorkflow({
              projectId: row.projectId,
              property: row.property,
              source,
            })
          : await startSearchInsightsSyncWorkflow({ projectId: row.projectId });
        if (!(await matchesActiveConnection({ ...row, source }))) {
          result.skipped += 1;
          continue;
        }
        console.info("[search-insights] queued backfill started", {
          importId: row.id,
          projectId: row.projectId,
          source,
          workflowId: started.workflowId,
        });
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
