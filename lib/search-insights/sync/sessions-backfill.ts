import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { ProviderCredentials } from "@/lib/providers/types";
import { addDays, dateFromKey, dateKey, diffDays, pacificToday } from "@/lib/search-insights/dates";
import { type ImportRow, loadImportRow, recordImportFailure } from "./import-state";
import { countCappedDays } from "./partitions";
import { nextDateRanges, planBackfill } from "./plan";
import { readOrganicSessionsConnection } from "./sessions-credentials";
import {
  ORGANIC_SESSIONS_SETTLING_LAG_DAYS,
  syncOrganicSessionsRange,
} from "./sessions-partitions";

export const DEFAULT_SESSIONS_BACKFILL_BATCH_SIZE = 3;

export type SessionsBackfillBatchInput = {
  batchSize?: number;
  projectId: string;
  property: string;
};

export type SessionsBackfillBatchOptions = { signal?: AbortSignal };

export type SessionsBackfillBatchResult = {
  blocked: boolean;
  daysProcessed: number;
  done: boolean;
  nextCursor: string | null;
};

type BackfillPlanState = {
  cursorDate: string;
  daysTotal: number;
  earliestTargetDate: string;
  finalizedThroughDate: string | null;
  newestFinalizedDate: string;
};

const BLOCKED: SessionsBackfillBatchResult = {
  blocked: true,
  daysProcessed: 0,
  done: false,
  nextCursor: null,
};
const IDLE: SessionsBackfillBatchResult = {
  blocked: false,
  daysProcessed: 0,
  done: true,
  nextCursor: null,
};

function existingPlan(row: NonNullable<ImportRow>): BackfillPlanState | null {
  if (!row.cursorDate || !row.earliestTargetDate || !row.newestFinalizedDate) return null;
  return {
    cursorDate: dateKey(row.cursorDate),
    daysTotal: row.daysTotal,
    earliestTargetDate: dateKey(row.earliestTargetDate),
    finalizedThroughDate: row.finalizedThroughDate ? dateKey(row.finalizedThroughDate) : null,
    newestFinalizedDate: dateKey(row.newestFinalizedDate),
  };
}

async function ensurePlan(row: NonNullable<ImportRow>, now: Date): Promise<BackfillPlanState> {
  const stored = existingPlan(row);
  if (stored) return stored;

  // The daily upsert revisits yesterday while the provider's latest data settles.
  const newestFinalizedDate = addDays(pacificToday(now), -ORGANIC_SESSIONS_SETTLING_LAG_DAYS);
  const plan = planBackfill({ newestFinalizedDate });
  const probedAt = new Date();
  await prisma.searchAnalyticsImport.update({
    data: {
      cursorDate: dateFromKey(newestFinalizedDate),
      daysTotal: plan.daysTotal,
      earliestTargetDate: dateFromKey(plan.earliestTargetDate),
      lastError: null,
      lastProbeAt: probedAt,
      newestFinalizedDate: dateFromKey(newestFinalizedDate),
      pausedReason: null,
      state: "running",
    },
    where: { id: row.id },
  });
  return {
    cursorDate: newestFinalizedDate,
    daysTotal: plan.daysTotal,
    earliestTargetDate: plan.earliestTargetDate,
    finalizedThroughDate: null,
    newestFinalizedDate,
  };
}

async function storeRange(input: {
  end: string;
  importId: string;
  plan: BackfillPlanState;
  projectId: string;
  property: string;
  start: string;
  credentials: ProviderCredentials;
}) {
  const { capHit } = await syncOrganicSessionsRange({
    credentials: input.credentials,
    end: input.end,
    projectId: input.projectId,
    property: input.property,
    start: input.start,
  });
  const capHitDays = capHit
    ? await countCappedDays({ projectId: input.projectId, property: input.property, source: "ga4" })
    : null;
  const daysProcessed = diffDays(input.start, input.end) + 1;
  const reachedNewest =
    input.plan.finalizedThroughDate === null && input.end === input.plan.newestFinalizedDate;
  await prisma.searchAnalyticsImport.update({
    data: {
      ...(capHitDays === null ? {} : { capHitDays }),
      cursorDate: dateFromKey(addDays(input.start, -1)),
      daysDone: input.plan.daysTotal - diffDays(input.plan.earliestTargetDate, input.start),
      ...(reachedNewest ? { finalizedThroughDate: dateFromKey(input.end) } : {}),
      lastError: null,
      pausedReason: null,
      state: "running",
    },
    where: { id: input.importId },
  });
  if (reachedNewest) input.plan.finalizedThroughDate = input.end;
  return daysProcessed;
}

export async function runOrganicSessionsBackfillBatch(
  input: SessionsBackfillBatchInput,
  options: SessionsBackfillBatchOptions = {},
): Promise<SessionsBackfillBatchResult> {
  const row = await loadImportRow(input.projectId, input.property, "ga4");
  if (!row) return BLOCKED;
  if (row.state === "completed") return IDLE;

  const { connection, problem } = await readOrganicSessionsConnection(input.projectId);
  if (!connection) {
    await prisma.searchAnalyticsImport.update({
      data: {
        pausedReason: problem === "needs_reauth" ? "needs_reauth" : "error",
        state: "paused",
        workflowId: null,
      },
      where: { id: row.id },
    });
    return BLOCKED;
  }
  if (connection.property !== row.property) {
    await prisma.searchAnalyticsImport.update({
      data: { workflowId: null },
      where: { id: row.id },
    });
    return BLOCKED;
  }

  try {
    const plan = await ensurePlan(row, new Date());
    const ranges = nextDateRanges({
      batchSize: input.batchSize ?? DEFAULT_SESSIONS_BACKFILL_BATCH_SIZE,
      cursorDate: plan.cursorDate,
      earliestTargetDate: plan.earliestTargetDate,
    });
    let daysProcessed = 0;
    let stored = 0;
    for (const range of ranges) {
      if (options.signal?.aborted) break;
      daysProcessed += await storeRange({
        ...range,
        credentials: connection.credentials,
        importId: row.id,
        plan,
        projectId: row.projectId,
        property: row.property,
      });
      stored += 1;
    }
    const last = stored > 0 ? ranges[stored - 1] : undefined;
    const nextCursor = last ? addDays(last.start, -1) : plan.cursorDate;
    const done = stored === ranges.length && nextCursor < plan.earliestTargetDate;
    if (done) {
      await prisma.searchAnalyticsImport.update({
        data: {
          lastError: null,
          lastSyncFinishedAt: new Date(),
          pausedReason: null,
          state: "completed",
        },
        where: { id: row.id },
      });
    }
    return { blocked: false, daysProcessed, done, nextCursor: done ? null : nextCursor };
  } catch (error) {
    try {
      await recordImportFailure({
        connectionId: connection.connectionId,
        error,
        importId: row.id,
        projectId: row.projectId,
        source: "ga4",
      });
    } catch (bookkeepingError) {
      console.error("[search-insights] sessions import failure could not be recorded", {
        error: bookkeepingError,
        importId: row.id,
        projectId: row.projectId,
      });
    }
    throw error;
  }
}
