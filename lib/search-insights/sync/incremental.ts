import "server-only";

import { prisma } from "@/lib/db/prisma";
import { createGscSearchAnalyticsSession } from "@/lib/providers/analytics/gsc-search-analytics";
import { providerChainWhere } from "@/lib/rank-check/provider-chain-order";
import { dateFromKey, dateKey } from "@/lib/search-insights/dates";
import { formatSyncResumed, logSyncInfo } from "./activity-log";
import { fetchAggregateRange, probeFreshness } from "./aggregate";
import { resolveSearchInsightsConnection, SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { syncCompleteGscDay } from "./day-sync";
import { ensureSearchInsightsImport } from "./ensure-import";
import { recordImportFailure } from "./import-state";
import { countCappedDays } from "./partitions";
import { incrementalDays, resumedImportState } from "./plan";
import { resolveOrganicSessionsConnection } from "./sessions-credentials";
import {
  runOrganicSessionsIncrementalForAllProjects,
  runOrganicSessionsIncrementalSync,
} from "./sessions-incremental";
import { isImportUserPaused, userPauseGuard } from "./user-pause";

export type IncrementalStatus =
  | "failed"
  | "needs_reauth"
  | "no_new_days"
  | "not_connected"
  | "rate_limited"
  | "user_paused"
  | "synced";

export type IncrementalResult = {
  daysProcessed: number;
  projectId: string;
  status: IncrementalStatus;
};

export type IncrementalForAllResult = {
  projects: IncrementalResult[];
};

const FAILURE_STATUS = {
  error: "failed",
  needs_reauth: "needs_reauth",
  rate_limited: "rate_limited",
} as const satisfies Record<string, IncrementalStatus>;

// Older days belong to the backfill workflow, which owns the cursor walking backward. A fresh
// import overlaps it on one day, and later advancing runs reread a short tail; each writer
// replaces the whole day slice, so whichever lands last is authoritative.
export async function runIncrementalSync(input: {
  now?: Date;
  projectId: string;
  property?: string;
  syncSessions?: boolean;
}): Promise<IncrementalResult> {
  const syncSessions = input.syncSessions ?? true;
  const connection = await resolveSearchInsightsConnection(input.projectId);
  if (!connection) {
    if (syncSessions) {
      await runOrganicSessionsIncrementalForProject({
        now: input.now ?? new Date(),
        projectId: input.projectId,
      });
    }
    return { daysProcessed: 0, projectId: input.projectId, status: "not_connected" };
  }

  const now = input.now ?? new Date();
  const property = input.property ?? connection.property;
  const key = {
    projectId_property_source: {
      projectId: input.projectId,
      property,
      source: SEARCH_INSIGHTS_SOURCE,
    },
  };
  // Nothing to update: lastSyncStartedAt belongs to the manual sync, whose cooldown must not
  // be spent by the scheduled sweep.
  const row = await prisma.searchAnalyticsImport.upsert({
    create: {
      projectId: input.projectId,
      property,
      source: SEARCH_INSIGHTS_SOURCE,
      state: "queued",
    },
    update: {},
    where: key,
  });
  if (row.pausedReason === "user") {
    return { daysProcessed: 0, projectId: input.projectId, status: "user_paused" };
  }
  const resumed = resumedImportState({
    cursorDate: row.cursorDate ? dateKey(row.cursorDate) : null,
    earliestTargetDate: row.earliestTargetDate ? dateKey(row.earliestTargetDate) : null,
    pausedReason: row.pausedReason,
    state: row.state,
  });

  try {
    // One access token for the sweep: a refresh is its own POST outside the provider rate
    // limit, and a catch-up run makes one probe plus three requests per day.
    if (await isImportUserPaused(row.id)) {
      return { daysProcessed: 0, projectId: input.projectId, status: "user_paused" };
    }
    const session = await createGscSearchAnalyticsSession(connection.credentials);
    const probe = await probeFreshness({ now, projectId: input.projectId, property, session });
    if (await isImportUserPaused(row.id)) {
      return { daysProcessed: 0, projectId: input.projectId, status: "user_paused" };
    }
    const days = incrementalDays({
      finalizedThroughDate: row.finalizedThroughDate ? dateKey(row.finalizedThroughDate) : null,
      newestFinalizedDate: probe.newestFinalizedDate,
    });
    const newestFinalizedDate = dateFromKey(probe.newestFinalizedDate);

    if (days.length === 0) {
      await prisma.searchAnalyticsImport.update({
        data: {
          lastError: null,
          availabilityBoundarySource: probe.availabilityBoundarySource,
          lastProbeAt: probe.probedAt,
          newestFinalizedDate,
          pausedReason: null,
          ...resumed,
        },
        where: userPauseGuard(row.id),
      });
      if (row.pausedReason === "rate_limited") {
        logSyncInfo(formatSyncResumed({ reason: "quota", stream: "incremental" }));
      }
      return { daysProcessed: 0, projectId: input.projectId, status: "no_new_days" };
    }

    await fetchAggregateRange({
      end: days[days.length - 1],
      projectId: input.projectId,
      property,
      session,
      start: days[0],
    });

    let capped = false;
    let daysProcessed = 0;
    for (const date of days) {
      if (await isImportUserPaused(row.id)) break;
      const result = await syncCompleteGscDay({
        date,
        projectId: input.projectId,
        property,
        session,
      });
      capped = capped || result.capHit;
      daysProcessed += 1;
    }
    // Read back from the stored partitions rather than incremented: the backfill can fetch
    // a day this sweep already stored, and a counter would claim more truncated days than
    // the coverage line can point at.
    const cappedDays = capped
      ? await countCappedDays({ projectId: input.projectId, property })
      : null;

    if (daysProcessed === 0) {
      return { daysProcessed: 0, projectId: input.projectId, status: "user_paused" };
    }
    const lastProcessedDay = days[daysProcessed - 1];
    await prisma.searchAnalyticsImport.update({
      data: {
        ...(cappedDays === null ? {} : { capHitDays: cappedDays }),
        finalizedThroughDate: dateFromKey(lastProcessedDay),
        lastError: null,
        availabilityBoundarySource: probe.availabilityBoundarySource,
        lastProbeAt: probe.probedAt,
        lastSyncFinishedAt: new Date(),
        newestFinalizedDate,
        pausedReason: null,
        // A successful read is proof the pause is over; the backfill keeps its cursor.
        ...resumed,
      },
      where: userPauseGuard(row.id),
    });
    if (row.pausedReason === "rate_limited") {
      logSyncInfo(formatSyncResumed({ reason: "quota", stream: "incremental" }));
    }
    return { daysProcessed, projectId: input.projectId, status: "synced" };
  } catch (error) {
    const reason = await recordImportFailure({
      connectionId: connection.connectionId,
      error,
      importId: row.id,
      projectId: input.projectId,
      stream: "incremental",
    });
    return { daysProcessed: 0, projectId: input.projectId, status: FAILURE_STATUS[reason] };
  } finally {
    if (syncSessions && !(await isImportUserPaused(row.id))) {
      await runOrganicSessionsIncrementalForProject({ now, projectId: input.projectId });
    }
  }
}

async function runOrganicSessionsIncrementalForProject(input: { now: Date; projectId: string }) {
  try {
    const connection = await resolveOrganicSessionsConnection(input.projectId);
    if (!connection) return;
    await ensureSearchInsightsImport({
      projectId: input.projectId,
      property: connection.property,
      source: "ga4",
    });
    await runOrganicSessionsIncrementalSync({
      now: input.now,
      projectId: input.projectId,
      property: connection.property,
    });
  } catch (error) {
    console.error("[search-insights] sessions manual sync failed", {
      error,
      projectId: input.projectId,
    });
  }
}

// Per-project isolation: one project's quota or credentials cannot stop the rest.
export async function runIncrementalForAllProjects(
  now = new Date(),
): Promise<IncrementalForAllResult> {
  const projects = await prisma.project.findMany({
    select: { id: true },
    where: {
      providerConnections: {
        some: { ...providerChainWhere("analytics"), provider: SEARCH_INSIGHTS_SOURCE },
      },
    },
  });

  const results: IncrementalResult[] = [];
  for (const project of projects) {
    try {
      results.push(await runIncrementalSync({ now, projectId: project.id, syncSessions: false }));
    } catch (error) {
      console.error("[search-insights] project sync failed", { error, projectId: project.id });
      results.push({ daysProcessed: 0, projectId: project.id, status: "failed" });
    }
  }
  try {
    await runOrganicSessionsIncrementalForAllProjects(now);
  } catch (error) {
    console.error("[search-insights] sessions sweep failed", { error });
  }
  return { projects: results };
}
