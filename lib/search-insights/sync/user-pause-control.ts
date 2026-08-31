import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { formatSyncPaused, formatSyncResumed, logSyncInfo } from "./activity-log";
import { resolveSearchInsightsConnection } from "./credentials";
import { USER_PAUSE_REASON } from "./user-pause";

export type SearchImportTransition = "pause" | "resume" | "retry";

type PauseSnapshot = {
  pauseStartedAt: Date | null;
  pausedById: string | null;
  pausedReason: string | null;
  state: string;
};

function auditSnapshot(row: PauseSnapshot) {
  return {
    pauseStartedAt: row.pauseStartedAt,
    pausedById: row.pausedById,
    pausedReason: row.pausedReason,
    reason: USER_PAUSE_REASON,
    state: row.state,
  };
}

export async function transitionActiveSearchImport(input: {
  actorId: string;
  projectId: string;
  projectPublicId: string;
  transition: SearchImportTransition;
}) {
  const connection = await resolveSearchInsightsConnection(input.projectId);
  if (!connection) return { changed: false, state: "unavailable" as const };

  const result = await prisma.$transaction(async (tx) => {
    const row = await tx.searchAnalyticsImport.findUnique({
      where: {
        projectId_property_source: {
          projectId: input.projectId,
          property: connection.property,
          source: "gsc",
        },
      },
    });
    if (!row) return { changed: false, row: null };
    const valid =
      (input.transition === "pause" &&
        row.pausedReason === null &&
        (row.state === "queued" || row.state === "running")) ||
      (input.transition === "resume" && row.pausedReason === USER_PAUSE_REASON) ||
      (input.transition === "retry" && (row.state === "failed" || row.pausedReason === "error"));
    if (!valid) return { changed: false, row };
    const wantsPause = input.transition === "pause";

    const changedAt = new Date();
    const updated = await tx.searchAnalyticsImport.update({
      data: wantsPause
        ? {
            pauseStartedAt: changedAt,
            pausedById: input.actorId,
            pausedReason: USER_PAUSE_REASON,
            state: "paused",
          }
        : {
            lastError: null,
            lastErrorClass: null,
            pauseStartedAt: null,
            pausedById: null,
            pausedReason: null,
            state:
              row.cursorDate && row.earliestTargetDate && row.cursorDate < row.earliestTargetDate
                ? "completed"
                : "queued",
          },
      where: { id: row.id },
    });
    await writeAudit(
      {
        action: `search_data_sync.${input.transition}`,
        actorId: input.actorId,
        after: auditSnapshot(updated),
        before: auditSnapshot(row),
        projectId: input.projectId,
        targetId: row.id,
        targetType: "search_analytics_import",
      },
      tx,
    );
    return { changed: true, row: updated };
  });

  if (result.changed) {
    logSyncInfo(
      input.transition === "pause"
        ? formatSyncPaused({ reason: "user", stream: "backfill" })
        : formatSyncResumed({
            reason: input.transition === "resume" ? "user" : "error",
            stream: "backfill",
          }),
    );
  }
  return {
    changed: result.changed,
    state: result.row?.state ?? ("unavailable" as const),
  };
}
