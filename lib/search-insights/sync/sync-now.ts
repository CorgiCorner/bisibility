import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { SchedulerDisabledError, schedulerDriver } from "@/lib/scheduler/driver";
import { SYNC_NOW_COOLDOWN_MS } from "@/lib/search-insights/constants";
import { publishWorkerIntent } from "@/lib/worker-intents/realtime";
import { resolveSearchInsightsConnection, SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { loadImportRow } from "./import-state";

export type SyncNowInput = {
  actorId: string | null;
  /** The internal project id the action layer already resolved while authorizing. */
  projectId: string;
};

export type SyncNowResult = {
  nextAllowedAt?: string;
  status: "queued" | "already_running" | "cooldown" | "no_connection" | "unavailable";
};

/**
 * Precondition: the caller has already authorized the actor for this project with
 * requireProjectScope. This service records worker-owned sync intent and an audit record; it
 * performs no authorization of its own.
 */
export async function requestSearchInsightsSync(input: SyncNowInput): Promise<SyncNowResult> {
  // The internal id is what requireProjectScope already resolved, so the lookup here only
  // fetches the public id the audit record points at.
  const project = await prisma.project.findUnique({
    select: { id: true, publicId: true },
    where: { id: input.projectId },
  });
  if (!project) return { status: "no_connection" };

  const connection = await resolveSearchInsightsConnection(project.id);
  if (!connection) return { status: "no_connection" };

  const row = await loadImportRow(project.id, connection.property);
  const now = new Date();
  const lastStartedAt = row?.lastSyncStartedAt?.getTime();
  if (lastStartedAt !== undefined && now.getTime() - lastStartedAt < SYNC_NOW_COOLDOWN_MS) {
    return {
      nextAllowedAt: new Date(lastStartedAt + SYNC_NOW_COOLDOWN_MS).toISOString(),
      status: "cooldown",
    };
  }

  // The sixteen-month backfill already holds the load quota; a manual sync queued behind
  // it would spend that quota twice for the same days.
  if (
    row?.state === "paused" ||
    (row?.workflowId && (row.state === "running" || row.state === "queued"))
  ) {
    return { status: "already_running" };
  }

  try {
    if (schedulerDriver() === "none") throw new SchedulerDisabledError();
  } catch (error) {
    if (!(error instanceof SchedulerDisabledError)) throw error;
    return { status: "unavailable" };
  }

  // A queued or running row belongs to the backfill, which already owns the provider quota.
  // A failed import is requeued for that same backfill instead of starting an incremental run
  // without a completed history. Only settled imports can carry incremental sync intent.
  const requestsIncremental = row?.state === "completed" || row?.state === "waiting_for_first_data";

  // Upsert, not update: the row is missing whenever the module has never been rendered for
  // this property. Creating it as queued gives the backfill reconciler the only intent it
  // should consume for a fresh import.
  await prisma.searchAnalyticsImport.upsert({
    create: {
      lastSyncStartedAt: now,
      projectId: project.id,
      property: connection.property,
      source: SEARCH_INSIGHTS_SOURCE,
      state: "queued",
    },
    update: requestsIncremental
      ? { lastSyncStartedAt: now, syncRequestedAt: now, syncStartedAt: null }
      : row?.state === "failed"
        ? {
            lastSyncStartedAt: now,
            pausedReason: null,
            state: "queued",
            syncRequestedAt: null,
            syncStartedAt: null,
            workflowId: null,
          }
        : {
            lastSyncStartedAt: now,
            // A prior version could leave this incompatible intent on a queued row. Clear it
            // so completing the backfill cannot start a stale incremental sync later.
            syncRequestedAt: null,
          },
    where: {
      projectId_property_source: {
        projectId: project.id,
        property: connection.property,
        source: SEARCH_INSIGHTS_SOURCE,
      },
    },
  });
  if (requestsIncremental) void publishWorkerIntent("search_insights_sync").catch(() => undefined);
  // The intent and cooldown are durable, so a failed audit must not invite a retry that can
  // only answer "cooldown".
  try {
    await writeAudit({
      action: "search_insights.sync_now",
      actorId: input.actorId,
      after: {
        property: connection.property,
        ...(requestsIncremental ? { syncRequestedAt: now } : {}),
      },
      projectId: project.id,
      targetId: project.publicId,
      targetType: "project",
    });
  } catch (error) {
    console.error("[search-insights] sync now audit could not be written", {
      error,
      projectId: project.id,
    });
  }
  return { status: "queued" };
}
