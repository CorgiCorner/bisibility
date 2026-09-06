import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  createGscSearchAnalyticsSession,
  type GscSearchAnalyticsSession,
} from "@/lib/providers/analytics/gsc-search-analytics";
import { addDays, dateFromKey, diffDays } from "@/lib/search-insights/dates";
import { formatSyncComplete, formatSyncPaused, logSyncInfo } from "./activity-log";
import { type BackfillPlanState, ensurePlan } from "./backfill-plan";
import { readSearchInsightsConnection } from "./credentials";
import { syncCompleteGscDay } from "./day-sync";
import { loadImportRow, recordImportFailure } from "./import-state";
import { countCappedDays } from "./partitions";
import { nextPartitions } from "./plan";
import { isImportUserPaused, userPauseGuard } from "./user-pause";
import { refreshReadyWindowFacts } from "./window-facts-refresh";
export const DEFAULT_BACKFILL_BATCH_SIZE = 7;
export type BackfillBatchInput = {
  batchSize?: number;
  projectId: string;
  property: string;
  retentionMonths?: number;
};
export type BackfillBatchOptions = {
  /** Aborted when Temporal cancels or times out the attempt; the batch stops at a day boundary. */
  signal?: AbortSignal;
};
export type BackfillBatchResult = {
  blocked: boolean;
  daysProcessed: number;
  importId: string | null;
  done: boolean;
  nextCursor: string | null;
  requestSets: number;
  batchElapsedMs: number;
  waitingForFirstData?: boolean;
};
const IDLE: BackfillBatchResult = {
  blocked: false,
  daysProcessed: 0,
  done: true,
  importId: null,
  nextCursor: null,
  requestSets: 0,
  batchElapsedMs: 0,
};
const BLOCKED: BackfillBatchResult = {
  blocked: true,
  daysProcessed: 0,
  done: false,
  importId: null,
  nextCursor: null,
  requestSets: 0,
  batchElapsedMs: 0,
};
function planGuard(importId: string, plan: BackfillPlanState) {
  return {
    ...userPauseGuard(importId),
    daysTotal: plan.daysTotal,
    earliestTargetDate: dateFromKey(plan.earliestTargetDate),
  };
}
async function storeDay(input: {
  date: string;
  importId: string;
  plan: BackfillPlanState;
  projectId: string;
  property: string;
  session: GscSearchAnalyticsSession;
}): Promise<boolean> {
  const { capHit } = await syncCompleteGscDay({
    date: input.date,
    projectId: input.projectId,
    property: input.property,
    session: input.session,
  });

  // The cursor advances per day, so a rate limit in the middle of a batch costs at most
  // the day it interrupted. A stored day also clears the previous pause, so the import strip
  // cannot show a quota reason for an import that is progressing again.
  const reachedNewest =
    input.plan.finalizedThroughDate === null && input.date === input.plan.newestFinalizedDate;
  // A day the sweep already stored can be fetched again here, so the count is read back
  // from the stored partitions; it can only have changed when this day was itself capped.
  const cappedDays = capHit
    ? await countCappedDays({ projectId: input.projectId, property: input.property })
    : null;
  const changed = await prisma.searchAnalyticsImport.updateMany({
    data: {
      ...(cappedDays === null ? {} : { capHitDays: cappedDays }),
      cursorDate: dateFromKey(addDays(input.date, -1)),
      // Measured against the frozen plan, not the moving newest day: a retry can re-process a
      // day, a counter would push the progress past the planned total, and a nightly sweep that
      // finalizes a newer day must not make the bar read more days than the plan holds.
      daysDone: input.plan.daysTotal - diffDays(input.plan.earliestTargetDate, input.date),
      lastError: null,
      pausedReason: null,
      state: "running",
    },
    where: planGuard(input.importId, input.plan),
  });
  if (changed.count === 0 || !reachedNewest) return changed.count === 1;

  const marker = dateFromKey(input.date);
  await prisma.searchAnalyticsImport.updateMany({
    data: { firstDataDetectedAt: new Date() },
    where: {
      ...planGuard(input.importId, input.plan),
      firstDataDetectedAt: null,
      waitingForFirstDataAt: { not: null },
    },
  });
  await prisma.searchAnalyticsImport.updateMany({
    data: { finalizedThroughDate: marker },
    where: {
      ...planGuard(input.importId, input.plan),
      AND: [{ OR: [{ finalizedThroughDate: null }, { finalizedThroughDate: { lt: marker } }] }],
    },
  });
  input.plan.finalizedThroughDate = input.date;
  return true;
}
export async function runBackfillBatch(
  input: BackfillBatchInput,
  options: BackfillBatchOptions = {},
): Promise<BackfillBatchResult> {
  const batchStartedAt = Date.now();
  const row = await loadImportRow(input.projectId, input.property);
  if (!row) return BLOCKED;
  if (row.state === "completed") return IDLE;
  if (row.pausedReason === "user") return BLOCKED;

  const { connection, problem } = await readSearchInsightsConnection(input.projectId);
  if (!connection) {
    const pausedReason = problem === "needs_reauth" ? "needs_reauth" : "error";
    const changed = await prisma.searchAnalyticsImport.updateMany({
      data: { pausedReason, state: "paused", workflowId: null },
      where: {
        id: row.id,
        OR: [{ pausedReason: { not: pausedReason } }, { state: { not: "paused" } }],
      },
    });
    if (changed.count > 0) {
      logSyncInfo(
        formatSyncPaused({
          reason: pausedReason === "needs_reauth" ? "authorization" : "error",
          stream: "backfill",
        }),
      );
    }
    return BLOCKED;
  }

  // The row belongs to a property the connection no longer points at: switching the property
  // queues a second import and leaves this execution walking the old one. Its rows would be
  // fetched for the new property and stored under the old key, so it stops here and releases
  // the id it was holding against the manual sync.
  if (connection.property !== row.property) {
    await prisma.searchAnalyticsImport.update({
      data: { workflowId: null },
      where: { id: row.id },
    });
    return BLOCKED;
  }

  const now = new Date();
  try {
    const session = await createGscSearchAnalyticsSession(connection.credentials);
    if (await isImportUserPaused(row.id)) return BLOCKED;
    const planning = await ensurePlan({
      now,
      retentionMonths: input.retentionMonths,
      row,
      session,
    });
    if (planning.kind === "retry") {
      return { ...IDLE, done: false, importId: planning.importId };
    }
    if (planning.kind === "waiting_for_first_data") {
      return {
        ...IDLE,
        done: false,
        importId: planning.importId,
        waitingForFirstData: true,
      };
    }
    const { plan } = planning;
    if (await isImportUserPaused(row.id)) return BLOCKED;

    const days = nextPartitions({
      batchSize: input.batchSize ?? DEFAULT_BACKFILL_BATCH_SIZE,
      cursorDate: plan.cursorDate,
      earliestTargetDate: plan.earliestTargetDate,
    });
    const stored: string[] = [];
    let requestSets = 0;
    for (const date of days) {
      if (options.signal?.aborted || (await isImportUserPaused(row.id))) break;
      const storedDay = await storeDay({
        date,
        importId: row.id,
        plan,
        projectId: row.projectId,
        property: row.property,
        session,
      });
      requestSets += 3;
      if (!storedDay) break;
      stored.push(date);
    }

    const nextCursor = stored.length > 0 ? addDays(stored[stored.length - 1], -1) : plan.cursorDate;
    let done = stored.length === days.length && nextCursor < plan.earliestTargetDate;
    if (done) {
      const changed = await prisma.searchAnalyticsImport.updateMany({
        data: {
          lastError: null,
          lastSyncFinishedAt: new Date(),
          pausedReason: null,
          state: "completed",
        },
        where: { ...planGuard(row.id, plan), state: { not: "completed" } },
      });
      if (changed.count === 0) done = false;
      if (changed.count > 0) logSyncInfo(formatSyncComplete("backfill"));
    }
    if (stored.length > 0) {
      try {
        const importRow = await loadImportRow(row.projectId, row.property);
        if (importRow) await refreshReadyWindowFacts(importRow);
      } catch (error) {
        console.error("[search-insights] window facts refresh failed", {
          error,
          importId: row.id,
          projectId: row.projectId,
        });
      }
    }
    return {
      blocked: false,
      daysProcessed: stored.length,
      done,
      importId: row.id,
      nextCursor: done ? null : nextCursor,
      requestSets,
      batchElapsedMs: Date.now() - batchStartedAt,
    };
  } catch (error) {
    // Bookkeeping must never replace the provider error on the way out: the workflow reads a
    // quota pause and a lost authorization off this exact error, and a database failure that
    // shadowed it would end the import as failed instead of waiting the quota out.
    try {
      await recordImportFailure({
        connectionId: connection.connectionId,
        error,
        importId: row.id,
        projectId: row.projectId,
        stream: "backfill",
      });
    } catch (bookkeepingError) {
      console.error("[search-insights] import failure could not be recorded", {
        error: bookkeepingError,
        importId: row.id,
        projectId: row.projectId,
        stream: "backfill",
      });
    }
    throw error;
  }
}
