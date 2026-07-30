// This type-only marker is erased for the plain-Node worker but still prevents
// client bundling.
import "server-only";

import { createHash } from "node:crypto";
import { Context } from "@temporalio/activity";
import { purgeAuditLogs } from "../audit/retention";
import { purgeExpiredSessions } from "../auth/session-retention";
import { prisma } from "../db/prisma";
import { releaseExpiredMigrationHolds } from "../migration/stale-holds";
import { markStaleImportJobs } from "../migration/stale-jobs";
import { syncPresenceForAllProjects } from "../presence/sync";
import type { QueuedDeadlineMaintenanceCursor } from "../rank-check/queued-deadline-maintenance";
import { purgeExpiredQueuedRankCheckBatches } from "../rank-check/queued-retention";
import {
  cleanupRankCheckRawPurgeProgress,
  purgeRankCheckRawPayloads,
  RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
} from "../rank-check/raw-retention";
import { sweepRankCheckRawPurgeProgress } from "../rank-check/raw-retention-fences";
import { markStaleRunningChecks } from "../rank-check/stale-checks";
import { sendWeeklyDigestForProject } from "../reports/weekly-digest-send";
import { syncSitemapForAllProjects } from "../sitemap/sync";

// Activities run in the worker's Node.js process (NOT the workflow sandbox), so
// importing the prisma-backed maintenance logic here is correct. Purge routes
// and the weekly digest cron route share these same side-effecting functions.
// Results cross the Temporal payload boundary, so Date fields are returned as
// ISO strings to stay plain and JSON-serializable.

export type PurgeAuditLogsActivityResult = {
  cutoff: string;
  deleted: number;
  retentionDays: number;
};

/** AUDIT_RETENTION_DAYS controls the purge window. */
export async function purgeAuditLogsActivity(): Promise<PurgeAuditLogsActivityResult> {
  const summary = await purgeAuditLogs();
  return {
    cutoff: summary.cutoff.toISOString(),
    deleted: summary.deleted,
    retentionDays: summary.retentionDays,
  };
}

export type PurgeRankCheckRawPayloadsActivityResult = {
  batchCount: number;
  batchSize: number;
  cutoff: string | null;
  hasMore: boolean;
  retentionDays: number | null;
  updated: number;
};

export type PurgeRankCheckRawPayloadsActivityExecutionResult =
  PurgeRankCheckRawPayloadsActivityResult & {
    progressId: string;
  };

export type PurgeRankCheckRawPayloadsActivityInput = {
  cutoff: string;
  retentionDays: number;
};

export type CleanupRankCheckRawPurgeProgressActivityInput = {
  progressId: string;
};

function rawPurgeProgressId() {
  const info = Context.current().info;
  const execution = info.workflowExecution;
  if (!execution) {
    throw new Error("Rank-check raw purge requires a workflow activity execution.");
  }
  return createHash("sha256")
    .update("rank-check-raw-purge\0")
    .update(execution.runId)
    .update("\0")
    .update(info.activityId)
    .digest("hex");
}

/** RANK_CHECK_RAW_RETENTION_DAYS controls the purge window. */
export async function purgeRankCheckRawPayloadsActivity(
  input?: PurgeRankCheckRawPayloadsActivityInput,
): Promise<PurgeRankCheckRawPayloadsActivityExecutionResult> {
  const context = Context.current();
  const progressId = rawPurgeProgressId();
  const summary = await purgeRankCheckRawPayloads({
    cutoff: input?.cutoff ? new Date(input.cutoff) : undefined,
    maxBatches: RANK_CHECK_RAW_PURGE_MAX_BATCHES_PER_ACTIVITY,
    onBatchCompleted: async (progress) => {
      context.heartbeat({ ...progress, cutoff: progress.cutoff.toISOString() });
      if (context.cancellationSignal.aborted) await context.cancelled;
    },
    progressId,
    retentionDays: input?.retentionDays,
  });
  if (summary.cutoff !== null && summary.retentionDays !== null) {
    context.heartbeat({ ...summary, cutoff: summary.cutoff.toISOString() });
  }
  return {
    ...summary,
    cutoff: summary.cutoff?.toISOString() ?? null,
    progressId,
  };
}

/**
 * Clears the recorded result only after Temporal has committed the purge result
 * to workflow history. The terminal hash row stays as a retry fence.
 */
export async function cleanupRankCheckRawPurgeProgressActivity({
  progressId,
}: CleanupRankCheckRawPurgeProgressActivityInput) {
  return cleanupRankCheckRawPurgeProgress(progressId);
}

export type SweepRankCheckRawPurgeProgressActivityResult = {
  cutoff: string;
  deleted: number;
  deletePages: number;
  fenceRetentionDays: number;
  hasMore: boolean;
  pageSize: number;
  scrubbed: number;
  scrubPages: number;
};

/**
 * Independently scrubs and reclaims terminal retry fences on the daily purge path.
 */
export async function sweepRankCheckRawPurgeProgressActivity(): Promise<SweepRankCheckRawPurgeProgressActivityResult> {
  const summary = await sweepRankCheckRawPurgeProgress();
  return { ...summary, cutoff: summary.cutoff.toISOString() };
}

export type PurgeExpiredSessionsActivityResult = {
  cutoff: string;
  sessionsDeleted: number;
  verificationsDeleted: number;
};

export type PurgeQueuedRankCheckBatchesActivityResult = Awaited<
  ReturnType<typeof purgeExpiredQueuedRankCheckBatches>
>;

export async function purgeQueuedRankCheckBatchesActivity(): Promise<PurgeQueuedRankCheckBatchesActivityResult> {
  return purgeExpiredQueuedRankCheckBatches(new Date());
}

/**
 * Side-effecting unit of work for the session purge workflow: delete expired
 * sessions and verification rows and return a serializable summary.
 */
export async function purgeExpiredSessionsActivity(): Promise<PurgeExpiredSessionsActivityResult> {
  const summary = await purgeExpiredSessions();
  return {
    cutoff: summary.cutoff.toISOString(),
    sessionsDeleted: summary.sessionsDeleted,
    verificationsDeleted: summary.verificationsDeleted,
  };
}

export type MarkStaleRunningChecksActivityResult = {
  cutoff: string;
  failed: number;
  olderThanMinutes: number;
  queuedBatches: number;
  queuedFailed: number;
  queuedFailureBatchIds: string[];
  queuedHasMore: boolean;
  queuedNextCursor: SerializedQueuedDeadlineMaintenanceCursor | null;
  queuedPending: number;
  queuedSweepAt: string;
  queuedTerminal: number;
};

export type SerializedQueuedDeadlineMaintenanceCursor = {
  id: string;
  queueDeadlineAt: string;
};

export type MarkStaleRunningChecksActivityInput = {
  queuedCursor?: SerializedQueuedDeadlineMaintenanceCursor;
  queuedSweepAt?: string;
};

function deserializeQueuedCursor(
  cursor?: SerializedQueuedDeadlineMaintenanceCursor,
): QueuedDeadlineMaintenanceCursor | undefined {
  return cursor
    ? {
        id: cursor.id,
        queueDeadlineAt: new Date(cursor.queueDeadlineAt),
      }
    : undefined;
}

export async function markStaleRunningChecksActivity(
  input: MarkStaleRunningChecksActivityInput = {},
): Promise<MarkStaleRunningChecksActivityResult> {
  const summary = await markStaleRunningChecks({
    now: input.queuedSweepAt ? new Date(input.queuedSweepAt) : undefined,
    queuedCursor: deserializeQueuedCursor(input.queuedCursor),
  });
  return {
    ...summary,
    cutoff: summary.cutoff.toISOString(),
    queuedNextCursor: summary.queuedNextCursor
      ? {
          id: summary.queuedNextCursor.id,
          queueDeadlineAt: summary.queuedNextCursor.queueDeadlineAt.toISOString(),
        }
      : null,
    queuedSweepAt: summary.queuedSweepAt.toISOString(),
  };
}

export type MarkStaleImportJobsActivityResult = {
  failed: number;
};

export async function markStaleImportJobsActivity(): Promise<MarkStaleImportJobsActivityResult> {
  const failed = await markStaleImportJobs();
  return { failed };
}

export type ReleaseExpiredMigrationHoldsActivityResult = {
  released: number;
};

export async function releaseExpiredMigrationHoldsActivity(): Promise<ReleaseExpiredMigrationHoldsActivityResult> {
  const released = await releaseExpiredMigrationHolds();
  return { released };
}

export type SendWeeklyReportDigestActivityResult = {
  projects: number;
  sent: number;
  skipped: number;
};

export async function sendWeeklyReportDigestForAllProjects(
  now: Date,
): Promise<SendWeeklyReportDigestActivityResult> {
  const projects = await prisma.project.findMany({ select: { id: true } });
  let sent = 0;
  let skipped = 0;

  for (const project of projects) {
    try {
      const result = await sendWeeklyDigestForProject(project.id, now);
      if (result.status === "sent") {
        sent += 1;
      } else {
        skipped += 1;
      }
    } catch (error) {
      skipped += 1;
      console.error("[reports] weekly digest failed", { error, projectId: project.id });
    }
  }

  return { projects: projects.length, sent, skipped };
}

export async function sendWeeklyReportDigestActivity(): Promise<SendWeeklyReportDigestActivityResult> {
  return sendWeeklyReportDigestForAllProjects(new Date());
}

export type SyncSitemapsActivityResult = Awaited<ReturnType<typeof syncSitemapForAllProjects>>;

export async function syncSitemapsActivity(): Promise<SyncSitemapsActivityResult> {
  return syncSitemapForAllProjects(new Date());
}

export type SyncPresenceActivityResult = Awaited<ReturnType<typeof syncPresenceForAllProjects>>;

export async function syncPresenceActivity(): Promise<SyncPresenceActivityResult> {
  return syncPresenceForAllProjects(new Date());
}
