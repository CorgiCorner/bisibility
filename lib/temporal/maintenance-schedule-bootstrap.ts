import "server-only";

import {
  type BootstrapScheduleClient,
  calendarSpec,
  type EnsureScheduleResult,
  ensureSingletonSchedule,
  envValue,
  isFalseyFlag,
  isTruthyFlag,
} from "@/lib/temporal/bootstrap";

// Maintenance schedule ids deliberately use a `maintenance-` prefix (NOT
// `rank-check-`) so the reconciler's `rank-check-*` prune pass never touches them.
export const AUDIT_PURGE_SCHEDULE_ID = "maintenance-audit-purge";
export const RANK_CHECK_RAW_PURGE_SCHEDULE_ID = "maintenance-rank-check-raw-purge";
export const QUEUED_RANK_CHECK_RETENTION_SCHEDULE_ID = "maintenance-queued-rank-check-retention";
export const SESSION_PURGE_SCHEDULE_ID = "maintenance-session-purge";
export const STALE_CHECKS_SCHEDULE_ID = "maintenance-stale-checks";
export const STALE_IMPORT_JOBS_SCHEDULE_ID = "maintenance-stale-import-jobs";
export const MIGRATION_HOLD_RELEASE_SCHEDULE_ID = "maintenance-migration-hold-release";
export const WEEKLY_DIGEST_SCHEDULE_ID = "maintenance-weekly-digest";
export const SITEMAP_SYNC_SCHEDULE_ID = "maintenance-sitemap-sync";
export const PRESENCE_SYNC_SCHEDULE_ID = "maintenance-presence-sync";
export const ALERT_DIGEST_FLUSH_SCHEDULE_ID = "maintenance-alert-digest-flush";
export const ALERT_HEALTH_SCHEDULE_ID = "maintenance-alert-health";

export const AUDIT_PURGE_WORKFLOW_TYPE = "purgeAuditLogsWorkflow";
export const RANK_CHECK_RAW_PURGE_WORKFLOW_TYPE = "purgeRankCheckRawPayloadsWorkflow";
export const QUEUED_RANK_CHECK_RETENTION_WORKFLOW_TYPE = "purgeQueuedRankCheckBatchesWorkflow";
export const SESSION_PURGE_WORKFLOW_TYPE = "purgeExpiredSessionsWorkflow";
export const STALE_CHECKS_WORKFLOW_TYPE = "markStaleRunningChecksWorkflow";
export const STALE_IMPORT_JOBS_WORKFLOW_TYPE = "markStaleImportJobsWorkflow";
export const MIGRATION_HOLD_RELEASE_WORKFLOW_TYPE = "releaseExpiredMigrationHoldsWorkflow";
export const WEEKLY_DIGEST_WORKFLOW_TYPE = "sendWeeklyReportDigestWorkflow";
export const SITEMAP_SYNC_WORKFLOW_TYPE = "syncSitemapsWorkflow";
export const PRESENCE_SYNC_WORKFLOW_TYPE = "syncPresenceWorkflow";
export const ALERT_DIGEST_FLUSH_WORKFLOW_TYPE = "flushAlertDigestsWorkflow";
export const ALERT_HEALTH_WORKFLOW_TYPE = "alertHealthWorkflow";

const DEFAULT_STALE_CHECKS_INTERVAL = "10 minutes";
const DEFAULT_STALE_IMPORT_JOBS_INTERVAL = "10 minutes";
const DEFAULT_MIGRATION_HOLD_RELEASE_INTERVAL = "1 hour";
const DEFAULT_ALERT_DIGEST_FLUSH_INTERVAL = "5 minutes";
const DEFAULT_ALERT_HEALTH_INTERVAL = "1 hour";

// Omitted CalendarSpec fields default to 0 for second, so these UTC calendar
// specs fire once per day/week at the given minute.
const DEFAULT_AUDIT_PURGE = { hour: 3, minute: 17 };
const DEFAULT_RANK_CHECK_RAW_PURGE = { hour: 3, minute: 29 };
const DEFAULT_QUEUED_RANK_CHECK_RETENTION = { hour: 3, minute: 41 };
const DEFAULT_SESSION_PURGE = { hour: 4, minute: 33 };
const DEFAULT_WEEKLY_DIGEST = { dayOfWeek: "MONDAY" as const, hour: 6, minute: 15 };
const DEFAULT_SITEMAP_SYNC = { hour: 4, minute: 45 };
const DEFAULT_PRESENCE_SYNC = { hour: 3, minute: 45 };

/**
 * Maintenance defaults to the reconciler gate but can be overridden independently.
 */
export function isScheduledMaintenanceEnabled() {
  const raw = process.env.SCHEDULED_MAINTENANCE_ENABLED?.trim();
  if (raw === undefined || raw.length === 0) {
    return !isFalseyFlag(process.env.RANK_CHECK_RECONCILER_ENABLED);
  }
  return isTruthyFlag(raw);
}

export function isSitemapSyncEnabled() {
  return isTruthyFlag(process.env.SITEMAP_SYNC_ENABLED);
}

export function isPresenceSyncEnabled() {
  return isTruthyFlag(process.env.PRESENCE_SYNC_ENABLED);
}

export function isAlertDigestFlushEnabled() {
  return !isFalseyFlag(process.env.ALERT_DIGEST_FLUSH_ENABLED);
}

function staleChecksInterval() {
  return envValue(process.env.STALE_CHECKS_INTERVAL) ?? DEFAULT_STALE_CHECKS_INTERVAL;
}

function staleImportJobsInterval() {
  return envValue(process.env.STALE_IMPORT_JOBS_INTERVAL) ?? DEFAULT_STALE_IMPORT_JOBS_INTERVAL;
}

function alertDigestFlushInterval() {
  return envValue(process.env.ALERT_DIGEST_FLUSH_INTERVAL) ?? DEFAULT_ALERT_DIGEST_FLUSH_INTERVAL;
}

function alertHealthInterval() {
  return envValue(process.env.ALERT_HEALTH_INTERVAL) ?? DEFAULT_ALERT_HEALTH_INTERVAL;
}

export async function ensureAlertHealthSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-alert-health" },
      note: "Alert delivery and fire-rate health",
      scheduleId: ALERT_HEALTH_SCHEDULE_ID,
      spec: { intervals: [{ every: alertHealthInterval() }] },
      workflowType: ALERT_HEALTH_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureAlertDigestFlushSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isAlertDigestFlushEnabled(),
      memo: { kind: "maintenance-alert-digest-flush" },
      note: "Pending alert digest flush",
      scheduleId: ALERT_DIGEST_FLUSH_SCHEDULE_ID,
      spec: { intervals: [{ every: alertDigestFlushInterval() }] },
      workflowType: ALERT_DIGEST_FLUSH_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureAuditPurgeSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-audit-purge" },
      note: "Audit log retention purge",
      scheduleId: AUDIT_PURGE_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_AUDIT_PURGE, process.env.AUDIT_PURGE_CRON),
      workflowType: AUDIT_PURGE_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureRankCheckRawPurgeSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-rank-check-raw-purge" },
      note: "Rank-check raw payload retention purge",
      scheduleId: RANK_CHECK_RAW_PURGE_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_RANK_CHECK_RAW_PURGE, process.env.RANK_CHECK_RAW_PURGE_CRON),
      workflowType: RANK_CHECK_RAW_PURGE_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureQueuedRankCheckRetentionSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-queued-rank-check-retention" },
      note: "Queued rank-check ledger retention purge",
      scheduleId: QUEUED_RANK_CHECK_RETENTION_SCHEDULE_ID,
      spec: calendarSpec(
        DEFAULT_QUEUED_RANK_CHECK_RETENTION,
        process.env.QUEUED_RANK_CHECK_RETENTION_CRON,
      ),
      workflowType: QUEUED_RANK_CHECK_RETENTION_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureSessionPurgeSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-session-purge" },
      note: "Expired session and verification purge",
      scheduleId: SESSION_PURGE_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_SESSION_PURGE, process.env.SESSION_PURGE_CRON),
      workflowType: SESSION_PURGE_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureStaleChecksSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-stale-checks" },
      note: "Stale running rank-check sweep",
      scheduleId: STALE_CHECKS_SCHEDULE_ID,
      spec: { intervals: [{ every: staleChecksInterval() }] },
      workflowType: STALE_CHECKS_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureStaleImportJobsSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-stale-import-jobs" },
      note: "Stale import job sweep",
      scheduleId: STALE_IMPORT_JOBS_SCHEDULE_ID,
      spec: { intervals: [{ every: staleImportJobsInterval() }] },
      workflowType: STALE_IMPORT_JOBS_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureMigrationHoldReleaseSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      convergeSpec: true,
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-migration-hold-release" },
      note: "Expired migration hold release",
      scheduleId: MIGRATION_HOLD_RELEASE_SCHEDULE_ID,
      spec: { intervals: [{ every: DEFAULT_MIGRATION_HOLD_RELEASE_INTERVAL }] },
      workflowType: MIGRATION_HOLD_RELEASE_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureWeeklyDigestSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isScheduledMaintenanceEnabled(),
      memo: { kind: "maintenance-weekly-digest" },
      note: "Weekly report digest",
      scheduleId: WEEKLY_DIGEST_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_WEEKLY_DIGEST, process.env.WEEKLY_DIGEST_CRON),
      workflowType: WEEKLY_DIGEST_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensureSitemapSyncSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isSitemapSyncEnabled(),
      memo: { kind: "maintenance-sitemap-sync" },
      note: "Sitemap snapshot sync",
      scheduleId: SITEMAP_SYNC_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_SITEMAP_SYNC, process.env.SITEMAP_SYNC_CRON),
      workflowType: SITEMAP_SYNC_WORKFLOW_TYPE,
    },
    client,
  );
}

export async function ensurePresenceSyncSchedule(
  client?: BootstrapScheduleClient,
): Promise<EnsureScheduleResult> {
  return ensureSingletonSchedule(
    {
      enabled: isPresenceSyncEnabled(),
      memo: { kind: "maintenance-presence-sync" },
      note: "URL presence sync",
      scheduleId: PRESENCE_SYNC_SCHEDULE_ID,
      spec: calendarSpec(DEFAULT_PRESENCE_SYNC, process.env.PRESENCE_SYNC_CRON),
      workflowType: PRESENCE_SYNC_WORKFLOW_TYPE,
    },
    client,
  );
}
