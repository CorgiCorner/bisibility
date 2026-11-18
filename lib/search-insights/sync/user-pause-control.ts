import "server-only";

import { writeAudit } from "@/lib/auth/audit";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { readGscCredentials } from "@/lib/providers/analytics/gsc-credentials";
import { decryptProviderCredentials } from "@/lib/providers/crypto";
import { formatSyncPaused, formatSyncResumed, logSyncInfo } from "./activity-log";
import { SEARCH_INSIGHTS_SOURCE } from "./credentials";
import { USER_PAUSE_REASON } from "./user-pause";

export type SearchImportTransition = "pause" | "resume" | "retry";
export type ExactSearchImportTransition = {
  actorId: string;
  importId: string;
  projectId: string;
  property: string;
  transition: SearchImportTransition;
};

type SearchImportRow = {
  cursorDate: Date | null;
  earliestTargetDate: Date | null;
  id: string;
  pauseStartedAt: Date | null;
  pausedById: string | null;
  pausedReason: string | null;
  property: string;
  source: string;
  state: string;
};

type TransitionResult = { changed: boolean; state: string };

function auditSnapshot(row: SearchImportRow) {
  return {
    pauseStartedAt: row.pauseStartedAt,
    pausedById: row.pausedById,
    pausedReason: row.pausedReason,
    reason: USER_PAUSE_REASON,
    state: row.state,
  };
}

function clearedPause(row: Pick<SearchImportRow, "cursorDate" | "earliestTargetDate">) {
  return {
    lastError: null,
    lastErrorClass: null,
    pauseStartedAt: null,
    pausedById: null,
    pausedReason: null,
    state:
      row.cursorDate && row.earliestTargetDate && row.cursorDate < row.earliestTargetDate
        ? "completed"
        : "queued",
  };
}

function transitionData(row: SearchImportRow, input: ExactSearchImportTransition) {
  if (input.transition === "pause") {
    if (row.pausedReason !== null || (row.state !== "queued" && row.state !== "running"))
      return null;
    return {
      pauseStartedAt: new Date(),
      pausedById: input.actorId,
      pausedReason: USER_PAUSE_REASON,
      state: "paused",
    };
  }
  if (input.transition === "resume") {
    if (row.pausedReason !== USER_PAUSE_REASON || row.state !== "paused") return null;
    return clearedPause(row);
  }
  if (row.state !== "failed" && row.pausedReason !== "error") return null;
  return clearedPause(row);
}

const userPausedImports = (projectId: string) =>
  ({ pausedReason: USER_PAUSE_REASON, projectId, source: SEARCH_INSIGHTS_SOURCE }) as const;

/** Counts the property-level user pauses that also stop a project's Search Console import. */
export async function countUserPausedSearchImports(
  db: Pick<Prisma.TransactionClient, "searchAnalyticsImport">,
  projectId: string,
) {
  return db.searchAnalyticsImport.count({ where: userPausedImports(projectId) });
}

/**
 * Clears every property-level user pause of a project's Search Console imports inside the
 * caller's transaction. The Schedules resume uses it so one switch really restarts the import;
 * the caller writes the audit row for the whole change.
 */
export async function resumeUserPausedSearchImports(
  tx: Pick<Prisma.TransactionClient, "searchAnalyticsImport">,
  projectId: string,
) {
  const rows = await tx.searchAnalyticsImport.findMany({
    select: { cursorDate: true, earliestTargetDate: true, id: true },
    where: userPausedImports(projectId),
  });
  let resumed = 0;
  for (const row of rows) {
    const updated = await tx.searchAnalyticsImport.updateMany({
      data: clearedPause(row),
      where: { id: row.id, ...userPausedImports(projectId) },
    });
    resumed += updated.count;
  }
  return resumed;
}

function activeProperty(
  connection: {
    credentialsEncrypted: string | null;
    enabled: boolean;
    status: string;
  } | null,
) {
  if (
    !connection?.enabled ||
    connection.status !== "connected" ||
    !connection.credentialsEncrypted
  ) {
    return null;
  }
  try {
    return readGscCredentials(decryptProviderCredentials(connection.credentialsEncrypted)).property;
  } catch {
    return null;
  }
}

function unavailable(): TransitionResult {
  return { changed: false, state: "unavailable" };
}

/**
 * Writes only the import row named by the client. The connection is reread in the transaction so
 * an archived property or a post-render property switch cannot redirect a control to another row.
 */
export async function transitionExactSearchImport(
  input: ExactSearchImportTransition,
): Promise<TransitionResult> {
  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      select: { id: true, writeMode: true },
      where: { id: input.projectId },
    });
    if (!project || isProjectReadOnly(project.writeMode)) return unavailable();

    const [connection, row] = await Promise.all([
      tx.providerConnection.findUnique({
        select: { credentialsEncrypted: true, enabled: true, status: true },
        where: {
          projectId_provider: { projectId: input.projectId, provider: SEARCH_INSIGHTS_SOURCE },
        },
      }),
      tx.searchAnalyticsImport.findFirst({
        where: { id: input.importId, projectId: input.projectId, source: SEARCH_INSIGHTS_SOURCE },
      }),
    ]);
    if (!row || row.property !== input.property || activeProperty(connection) !== input.property) {
      return unavailable();
    }

    const data = transitionData(row, input);
    if (!data) return unavailable();
    const updated = await tx.searchAnalyticsImport.updateMany({
      data,
      where: {
        id: input.importId,
        pausedReason: row.pausedReason,
        projectId: input.projectId,
        property: input.property,
        source: SEARCH_INSIGHTS_SOURCE,
        state: row.state,
      },
    });
    if (updated.count !== 1) return unavailable();

    const after = { ...row, ...data };
    await writeAudit(
      {
        action: `search_data_sync.${input.transition}`,
        actorId: input.actorId,
        after: auditSnapshot(after),
        before: auditSnapshot(row),
        projectId: input.projectId,
        targetId: input.importId,
        targetType: "search_analytics_import",
      },
      tx,
    );
    return { changed: true, state: data.state };
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
  return result;
}
