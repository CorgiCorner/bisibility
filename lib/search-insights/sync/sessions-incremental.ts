import "server-only";

import { prisma } from "@/lib/db/prisma";
import { providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { addDays, dateFromKey, dateKey, diffDays, pacificToday } from "@/lib/search-insights/dates";
import { ensureSearchInsightsImport } from "./ensure-import";
import { recordImportFailure } from "./import-state";
import { countCappedDays } from "./partitions";
import { MAX_INCREMENTAL_DAYS, resumedImportState } from "./plan";
import { ORGANIC_SESSIONS_SOURCE, resolveOrganicSessionsConnection } from "./sessions-credentials";
import {
  ORGANIC_SESSIONS_SETTLING_LAG_DAYS,
  syncOrganicSessionsRange,
} from "./sessions-partitions";
import { isProjectGscUserPaused } from "./user-pause";

export type SessionsIncrementalStatus =
  | "failed"
  | "needs_reauth"
  | "not_connected"
  | "rate_limited"
  | "synced";
export type SessionsIncrementalResult = {
  daysProcessed: number;
  projectId: string;
  status: SessionsIncrementalStatus;
};

const TRAILING_DAYS = 3;

function newestSettledDate(now: Date) {
  // Re-upserting the short tail lets yesterday converge as the provider settles it.
  return addDays(pacificToday(now), -ORGANIC_SESSIONS_SETTLING_LAG_DAYS);
}

export async function runOrganicSessionsIncrementalSync(input: {
  now?: Date;
  projectId: string;
  property?: string;
}): Promise<SessionsIncrementalResult> {
  if (await isProjectGscUserPaused(input.projectId)) {
    return { daysProcessed: 0, projectId: input.projectId, status: "not_connected" };
  }
  const connection = await resolveOrganicSessionsConnection(input.projectId);
  if (!connection) return { daysProcessed: 0, projectId: input.projectId, status: "not_connected" };

  const now = input.now ?? new Date();
  const property = input.property ?? connection.property;
  const row = await prisma.searchAnalyticsImport.findUnique({
    where: {
      projectId_property_source: {
        projectId: input.projectId,
        property,
        source: ORGANIC_SESSIONS_SOURCE,
      },
    },
  });
  if (!row) return { daysProcessed: 0, projectId: input.projectId, status: "not_connected" };
  const newest = newestSettledDate(now);
  const trailingStart = addDays(newest, -(TRAILING_DAYS - 1));
  const start = row.finalizedThroughDate
    ? [trailingStart, addDays(dateKey(row.finalizedThroughDate), 1)].sort()[0]
    : trailingStart;
  const end =
    addDays(start, MAX_INCREMENTAL_DAYS - 1) < newest
      ? addDays(start, MAX_INCREMENTAL_DAYS - 1)
      : newest;
  const resumed = resumedImportState({
    cursorDate: row.cursorDate ? dateKey(row.cursorDate) : null,
    earliestTargetDate: row.earliestTargetDate ? dateKey(row.earliestTargetDate) : null,
    pausedReason: row.pausedReason,
    state: row.state,
  });

  try {
    const { capHit } = await syncOrganicSessionsRange({
      credentials: connection.credentials,
      end,
      projectId: input.projectId,
      property,
      start,
    });
    const capHitDays = capHit
      ? await countCappedDays({ projectId: input.projectId, property, source: "ga4" })
      : null;
    await prisma.searchAnalyticsImport.update({
      data: {
        ...(capHitDays === null ? {} : { capHitDays }),
        ...(row.finalizedThroughDate ? { finalizedThroughDate: dateFromKey(end) } : {}),
        lastError: null,
        lastProbeAt: now,
        lastSyncFinishedAt: new Date(),
        newestFinalizedDate: dateFromKey(newest),
        pausedReason: null,
        ...resumed,
      },
      where: { id: row.id },
    });
    return {
      daysProcessed: diffDays(start, end) + 1,
      projectId: input.projectId,
      status: "synced",
    };
  } catch (error) {
    const reason = await recordImportFailure({
      connectionId: connection.connectionId,
      error,
      importId: row.id,
      projectId: input.projectId,
      source: ORGANIC_SESSIONS_SOURCE,
    });
    return {
      daysProcessed: 0,
      projectId: input.projectId,
      status: reason === "error" ? "failed" : reason,
    };
  }
}

/** The schedule keeps the old result contract while independently advancing session imports. */
export async function runOrganicSessionsIncrementalForAllProjects(now = new Date()) {
  const projects = await prisma.project.findMany({
    select: { id: true },
    where: {
      providerConnections: {
        some: { ...providerChainWhere("analytics"), provider: ORGANIC_SESSIONS_SOURCE },
      },
    },
  });
  for (const project of projects) {
    try {
      const connection = await resolveOrganicSessionsConnection(project.id);
      if (!connection) continue;
      await ensureSearchInsightsImport({
        projectId: project.id,
        property: connection.property,
        source: ORGANIC_SESSIONS_SOURCE,
      });
      await runOrganicSessionsIncrementalSync({
        now,
        projectId: project.id,
        property: connection.property,
      });
    } catch (error) {
      console.error("[search-insights] sessions project sync failed", {
        error,
        projectId: project.id,
      });
    }
  }
}
