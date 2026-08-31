import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { SchedulerDisabledError } from "@/lib/scheduler/driver";
import { SYNC_NOW_COOLDOWN_MS } from "@/lib/search-insights/constants";
import { startSearchInsightsSyncWorkflow } from "@/lib/temporal/search-insights-client";
import { resolveSearchInsightsConnection, SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { loadImportRow } from "./import-state";

export type SyncNowInput = {
  actorId: string | null;
  /** The internal project id the action layer already resolved while authorizing. */
  projectId: string;
};

export type SyncNowResult = {
  nextAllowedAt?: string;
  status: "started" | "already_running" | "cooldown" | "no_connection" | "unavailable";
};

/**
 * Precondition: the caller has already authorized the actor for this project with
 * requireProjectScope. This service starts a workflow, stamps the import row and writes an
 * audit record; it performs no authorization of its own.
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
  if (row?.workflowId && (row.state === "running" || row.state === "queued")) {
    return { status: "already_running" };
  }

  try {
    const started = await startSearchInsightsSyncWorkflow({ projectId: project.id });
    // Upsert, not update: the row is missing whenever the module has never been rendered for
    // this property, and a stamp that matched nothing would leave this path unthrottled. The
    // sync workflow upserts the same key, so creating it here only brings that forward.
    await prisma.searchAnalyticsImport.upsert({
      create: {
        lastSyncStartedAt: now,
        projectId: project.id,
        property: connection.property,
        source: SEARCH_INSIGHTS_SOURCE,
        state: "queued",
      },
      update: { lastSyncStartedAt: now },
      where: {
        projectId_property_source: {
          projectId: project.id,
          property: connection.property,
          source: SEARCH_INSIGHTS_SOURCE,
        },
      },
    });
    // The sync is already running and the cooldown is already stamped, so a failed audit
    // write must not report it as unavailable: the retry it invites would answer "cooldown".
    try {
      await writeAudit({
        action: "search_insights.sync_now",
        actorId: input.actorId,
        after: { property: connection.property, workflowId: started.workflowId },
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
    return { status: "started" };
  } catch (error) {
    if (!(error instanceof SchedulerDisabledError)) {
      console.error("[search-insights] sync now failed", { error, projectId: project.id });
    }
    return { status: "unavailable" };
  }
}
