// Temporal sandbox module: no Prisma, client, Node built-ins, or side effects.
// Only `@temporalio/workflow` and type-only activity imports are allowed.
import { continueAsNew, proxyActivities } from "@temporalio/workflow";
import type {
  AlertHealthActivityResult,
  alertHealthActivity as alertHealthActivityImplementation,
} from "./alert-health-activities";
import type {
  CleanupRankCheckRawPurgeProgressActivityInput,
  MarkStaleImportJobsActivityResult,
  MarkStaleRunningChecksActivityInput,
  MarkStaleRunningChecksActivityResult,
  PurgeAuditLogsActivityResult,
  PurgeExpiredSessionsActivityResult,
  PurgeQueuedRankCheckBatchesActivityResult,
  PurgeRankCheckRawPayloadsActivityInput,
  PurgeRankCheckRawPayloadsActivityResult,
  ReleaseExpiredMigrationHoldsActivityResult,
  SendWeeklyReportDigestActivityResult,
  SerializedQueuedDeadlineMaintenanceCursor,
  SweepRankCheckRawPurgeProgressActivityResult,
  SyncPresenceActivityResult,
  SyncSitemapsActivityResult,
} from "./maintenance-activities";

type MaintenanceActivities = {
  alertHealthActivity(): Promise<AlertHealthActivityResult>;
  markStaleImportJobsActivity(): Promise<MarkStaleImportJobsActivityResult>;
  markStaleRunningChecksActivity(
    input?: MarkStaleRunningChecksActivityInput,
  ): Promise<MarkStaleRunningChecksActivityResult>;
  purgeAuditLogsActivity(): Promise<PurgeAuditLogsActivityResult>;
  purgeRankCheckRawPayloadsActivity(input?: PurgeRankCheckRawPayloadsActivityInput): Promise<
    PurgeRankCheckRawPayloadsActivityResult & {
      progressId: string;
    }
  >;
  cleanupRankCheckRawPurgeProgressActivity(
    input: CleanupRankCheckRawPurgeProgressActivityInput,
  ): Promise<{ cleared: number }>;
  purgeExpiredSessionsActivity(): Promise<PurgeExpiredSessionsActivityResult>;
  purgeQueuedRankCheckBatchesActivity(): Promise<PurgeQueuedRankCheckBatchesActivityResult>;
  releaseExpiredMigrationHoldsActivity(): Promise<ReleaseExpiredMigrationHoldsActivityResult>;
  sendWeeklyReportDigestActivity(): Promise<SendWeeklyReportDigestActivityResult>;
  sweepRankCheckRawPurgeProgressActivity(): Promise<SweepRankCheckRawPurgeProgressActivityResult>;
  syncPresenceActivity(): Promise<SyncPresenceActivityResult>;
  syncSitemapsActivity(): Promise<SyncSitemapsActivityResult>;
};

const { alertHealthActivity } = proxyActivities<{
  alertHealthActivity: typeof alertHealthActivityImplementation;
}>({
  retry: { initialInterval: "5 seconds", maximumAttempts: 3 },
  startToCloseTimeout: "30 seconds",
});

type PurgeAndSweepActivities = Pick<
  MaintenanceActivities,
  | "markStaleImportJobsActivity"
  | "markStaleRunningChecksActivity"
  | "purgeAuditLogsActivity"
  | "purgeExpiredSessionsActivity"
  | "purgeQueuedRankCheckBatchesActivity"
  | "releaseExpiredMigrationHoldsActivity"
>;

type LongMaintenanceActivities = Pick<
  MaintenanceActivities,
  "sendWeeklyReportDigestActivity" | "syncPresenceActivity" | "syncSitemapsActivity"
>;

const {
  markStaleImportJobsActivity,
  markStaleRunningChecksActivity,
  purgeAuditLogsActivity,
  purgeExpiredSessionsActivity,
  purgeQueuedRankCheckBatchesActivity,
  releaseExpiredMigrationHoldsActivity,
} = proxyActivities<PurgeAndSweepActivities>({
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "5 minutes",
});

export const RANK_CHECK_RAW_PURGE_ACTIVITY_OPTIONS = {
  heartbeatTimeout: "1 minute",
  retry: {
    backoffCoefficient: 2,
    initialInterval: "5 seconds",
    maximumAttempts: 3,
    maximumInterval: "30 seconds",
  },
  startToCloseTimeout: "5 minutes",
} as const;

const {
  cleanupRankCheckRawPurgeProgressActivity,
  purgeRankCheckRawPayloadsActivity,
  sweepRankCheckRawPurgeProgressActivity,
} = proxyActivities<
  Pick<
    MaintenanceActivities,
    | "cleanupRankCheckRawPurgeProgressActivity"
    | "purgeRankCheckRawPayloadsActivity"
    | "sweepRankCheckRawPurgeProgressActivity"
  >
>(RANK_CHECK_RAW_PURGE_ACTIVITY_OPTIONS);

const { sendWeeklyReportDigestActivity, syncPresenceActivity, syncSitemapsActivity } =
  proxyActivities<LongMaintenanceActivities>({
    retry: {
      backoffCoefficient: 2,
      initialInterval: "5 seconds",
      maximumAttempts: 3,
      maximumInterval: "30 seconds",
    },
    // These jobs fan out over all projects, so keep a wider activity window.
    startToCloseTimeout: "30 minutes",
  });

export type {
  AlertHealthActivityResult,
  MarkStaleImportJobsActivityResult,
  MarkStaleRunningChecksActivityResult,
  PurgeAuditLogsActivityResult,
  PurgeExpiredSessionsActivityResult,
  PurgeQueuedRankCheckBatchesActivityResult,
  PurgeRankCheckRawPayloadsActivityResult,
  ReleaseExpiredMigrationHoldsActivityResult,
  SendWeeklyReportDigestActivityResult,
  SweepRankCheckRawPurgeProgressActivityResult,
  SyncPresenceActivityResult,
  SyncSitemapsActivityResult,
};

export async function alertHealthWorkflow(): Promise<AlertHealthActivityResult> {
  return alertHealthActivity();
}

/**
 * Tombstone lets upgraded workers complete executions from the retired DB queue schedule.
 */
export async function processQueuedJobsWorkflow(): Promise<void> {
  return undefined;
}

/**
 * Singleton daily audit purge: delegates the side-effecting delete to one
 * activity so the workflow body stays deterministic and sandbox-pure.
 */
export async function purgeAuditLogsWorkflow(): Promise<PurgeAuditLogsActivityResult> {
  return purgeAuditLogsActivity();
}

export type PurgeRankCheckRawPayloadsWorkflowState = {
  batchCount: number;
  cutoff: string;
  retentionDays: number;
  updated: number;
};

export async function purgeRankCheckRawPayloadsWorkflow(
  state?: PurgeRankCheckRawPayloadsWorkflowState,
): Promise<PurgeRankCheckRawPayloadsActivityResult> {
  await sweepRankCheckRawPurgeProgressActivity();
  const execution = await purgeRankCheckRawPayloadsActivity(
    state ? { cutoff: state.cutoff, retentionDays: state.retentionDays } : undefined,
  );
  const { progressId, ...chunk } = execution;
  await cleanupRankCheckRawPurgeProgressActivity({ progressId });
  const total = {
    ...chunk,
    batchCount: (state?.batchCount ?? 0) + chunk.batchCount,
    updated: (state?.updated ?? 0) + chunk.updated,
  };
  if (chunk.hasMore && chunk.cutoff !== null && chunk.retentionDays !== null) {
    return continueAsNew<typeof purgeRankCheckRawPayloadsWorkflow>({
      batchCount: total.batchCount,
      cutoff: chunk.cutoff,
      retentionDays: chunk.retentionDays,
      updated: total.updated,
    });
  }
  return total;
}

/**
 * Singleton daily session purge: delegates the side-effecting delete to one
 * activity so the workflow body stays deterministic and sandbox-pure.
 */
export async function purgeExpiredSessionsWorkflow(): Promise<PurgeExpiredSessionsActivityResult> {
  return purgeExpiredSessionsActivity();
}

export type PurgeQueuedRankCheckBatchesWorkflowState = {
  deleted: number;
};

export async function purgeQueuedRankCheckBatchesWorkflow(
  state?: PurgeQueuedRankCheckBatchesWorkflowState,
): Promise<PurgeQueuedRankCheckBatchesActivityResult> {
  const chunk = await purgeQueuedRankCheckBatchesActivity();
  const total = { ...chunk, deleted: (state?.deleted ?? 0) + chunk.deleted };
  if (chunk.hasMore) {
    return continueAsNew<typeof purgeQueuedRankCheckBatchesWorkflow>({
      deleted: total.deleted,
    });
  }
  return total;
}

/**
 * Singleton running-check sweep: marks orphaned running rows as failed after the
 * workflow timeout window has passed.
 */
export type MarkStaleRunningChecksWorkflowState = {
  failed: number;
  queuedBatches: number;
  queuedCursor: SerializedQueuedDeadlineMaintenanceCursor;
  queuedFailed: number;
  queuedFailureBatchIdSample: string[];
  queuedPending: number;
  queuedSweepAt: string;
  queuedTerminal: number;
};

export const QUEUED_FAILURE_BATCH_ID_SAMPLE_LIMIT = 10;

export type MarkStaleRunningChecksWorkflowResult = Omit<
  MarkStaleRunningChecksActivityResult,
  "queuedFailureBatchIds"
> & {
  queuedFailureBatchIdSample: string[];
};

export async function markStaleRunningChecksWorkflow(
  state?: MarkStaleRunningChecksWorkflowState,
): Promise<MarkStaleRunningChecksWorkflowResult> {
  const chunk = await markStaleRunningChecksActivity(
    state
      ? {
          queuedCursor: state.queuedCursor,
          queuedSweepAt: state.queuedSweepAt,
        }
      : undefined,
  );
  const { queuedFailureBatchIds, ...chunkSummary } = chunk;
  const total = {
    ...chunkSummary,
    failed: (state?.failed ?? 0) + chunk.failed,
    queuedBatches: (state?.queuedBatches ?? 0) + chunk.queuedBatches,
    queuedFailed: (state?.queuedFailed ?? 0) + chunk.queuedFailed,
    queuedFailureBatchIdSample: [
      ...(state?.queuedFailureBatchIdSample ?? []),
      ...queuedFailureBatchIds,
    ].slice(0, QUEUED_FAILURE_BATCH_ID_SAMPLE_LIMIT),
    queuedPending: (state?.queuedPending ?? 0) + chunk.queuedPending,
    queuedTerminal: (state?.queuedTerminal ?? 0) + chunk.queuedTerminal,
  };
  if (chunk.queuedHasMore && chunk.queuedNextCursor) {
    return continueAsNew<typeof markStaleRunningChecksWorkflow>({
      failed: total.failed,
      queuedBatches: total.queuedBatches,
      queuedCursor: chunk.queuedNextCursor,
      queuedFailed: total.queuedFailed,
      queuedFailureBatchIdSample: total.queuedFailureBatchIdSample,
      queuedPending: total.queuedPending,
      queuedSweepAt: chunk.queuedSweepAt,
      queuedTerminal: total.queuedTerminal,
    });
  }
  return total;
}

export async function markStaleImportJobsWorkflow(): Promise<MarkStaleImportJobsActivityResult> {
  return markStaleImportJobsActivity();
}

export async function releaseExpiredMigrationHoldsWorkflow(): Promise<ReleaseExpiredMigrationHoldsActivityResult> {
  return releaseExpiredMigrationHoldsActivity();
}

export async function sendWeeklyReportDigestWorkflow(): Promise<SendWeeklyReportDigestActivityResult> {
  return sendWeeklyReportDigestActivity();
}

export async function syncSitemapsWorkflow(): Promise<SyncSitemapsActivityResult> {
  return syncSitemapsActivity();
}

export async function syncPresenceWorkflow(): Promise<SyncPresenceActivityResult> {
  return syncPresenceActivity();
}
