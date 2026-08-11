import { existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  AUDIT_PURGE_SCHEDULE_ID,
  ensureAuditPurgeSchedule,
  ensureMigrationHoldReleaseSchedule,
  ensureQueuedRankCheckRetentionSchedule,
  ensureRankCheckRawPurgeSchedule,
  ensureSessionPurgeSchedule,
  ensureStaleChecksSchedule,
  ensureWeeklyDigestSchedule,
  isScheduledMaintenanceEnabled,
  MIGRATION_HOLD_RELEASE_SCHEDULE_ID,
  QUEUED_RANK_CHECK_RETENTION_SCHEDULE_ID,
  RANK_CHECK_RAW_PURGE_SCHEDULE_ID,
  SESSION_PURGE_SCHEDULE_ID,
  STALE_CHECKS_SCHEDULE_ID,
  WEEKLY_DIGEST_SCHEDULE_ID,
} from "@/lib/temporal/maintenance-schedule-bootstrap";
import { ScheduleAlreadyRunning } from "@temporalio/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function clientMock() {
  return { create: vi.fn() };
}

const retiredHttpCronRoutes = [
  "purge-audit",
  "purge-sessions",
  "sitemap-sync",
  "presence-sync",
  "weekly-digest",
];

describe("maintenance schedule ownership", () => {
  it("keeps scheduled maintenance worker-owned without HTTP cron fallbacks", () => {
    for (const route of retiredHttpCronRoutes) {
      expect(existsSync(resolve(process.cwd(), `app/api/cron/${route}/route.ts`))).toBe(false);
    }
  });
});

describe("scheduled maintenance gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to the reconciler flag when SCHEDULED_MAINTENANCE_ENABLED is unset", () => {
    expect(isScheduledMaintenanceEnabled()).toBe(true);

    vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "false");
    expect(isScheduledMaintenanceEnabled()).toBe(false);
  });

  it("can be toggled independently of the reconciler flag", () => {
    vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "false");
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
    expect(isScheduledMaintenanceEnabled()).toBe(true);

    vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "1");
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "off");
    expect(isScheduledMaintenanceEnabled()).toBe(false);
  });
});

describe("maintenance schedule bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is gated off unless maintenance is enabled", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "false");
    vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "false");
    const client = clientMock();

    await expect(ensureAuditPurgeSchedule(client)).resolves.toEqual({
      scheduleId: AUDIT_PURGE_SCHEDULE_ID,
      status: "disabled",
    });
    await expect(ensureRankCheckRawPurgeSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_RAW_PURGE_SCHEDULE_ID,
      status: "disabled",
    });
    await expect(ensureQueuedRankCheckRetentionSchedule(client)).resolves.toEqual({
      scheduleId: QUEUED_RANK_CHECK_RETENTION_SCHEDULE_ID,
      status: "disabled",
    });
    await expect(ensureWeeklyDigestSchedule(client)).resolves.toEqual({
      scheduleId: WEEKLY_DIGEST_SCHEDULE_ID,
      status: "disabled",
    });
    expect(client.create).not.toHaveBeenCalled();
  });

  it("creates the daily rank-check raw purge schedule without time collisions", async () => {
    const client = clientMock();

    await expect(ensureRankCheckRawPurgeSchedule(client)).resolves.toEqual({
      scheduleId: RANK_CHECK_RAW_PURGE_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "purgeRankCheckRawPayloadsWorkflow" }),
        scheduleId: RANK_CHECK_RAW_PURGE_SCHEDULE_ID,
        spec: { calendars: [{ hour: 3, minute: 29 }] },
      }),
    );
  });

  it("creates queued-ledger retention with maintenance on and the queue gate off", async () => {
    vi.stubEnv("DATAFORSEO_QUEUED_RANK_CHECKS_ENABLED", "0");
    const client = clientMock();

    await expect(ensureQueuedRankCheckRetentionSchedule(client)).resolves.toEqual({
      scheduleId: QUEUED_RANK_CHECK_RETENTION_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "purgeQueuedRankCheckBatchesWorkflow" }),
        scheduleId: QUEUED_RANK_CHECK_RETENTION_SCHEDULE_ID,
        spec: { calendars: [{ hour: 3, minute: 41 }] },
      }),
    );
  });

  it("creates the daily audit purge schedule with a calendar spec", async () => {
    const client = clientMock();

    await expect(ensureAuditPurgeSchedule(client)).resolves.toEqual({
      scheduleId: AUDIT_PURGE_SCHEDULE_ID,
      status: "created",
    });
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "purgeAuditLogsWorkflow" }),
        scheduleId: AUDIT_PURGE_SCHEDULE_ID,
        spec: { calendars: [{ hour: 3, minute: 17 }] },
      }),
    );
  });

  it("creates the daily session purge schedule with a calendar spec", async () => {
    const client = clientMock();

    await ensureSessionPurgeSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "purgeExpiredSessionsWorkflow" }),
        scheduleId: SESSION_PURGE_SCHEDULE_ID,
        spec: { calendars: [{ hour: 4, minute: 33 }] },
      }),
    );
  });

  it("creates the stale running-check sweep schedule with an interval spec", async () => {
    const client = clientMock();

    await ensureStaleChecksSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "markStaleRunningChecksWorkflow" }),
        scheduleId: STALE_CHECKS_SCHEDULE_ID,
        spec: { intervals: [{ every: "10 minutes" }] },
      }),
    );
  });

  it("sweeps expired migration holds hourly", async () => {
    const client = clientMock();

    await ensureMigrationHoldReleaseSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "releaseExpiredMigrationHoldsWorkflow" }),
        scheduleId: MIGRATION_HOLD_RELEASE_SCHEDULE_ID,
        spec: { intervals: [{ every: "1 hour" }] },
      }),
    );
  });

  it("creates the weekly digest schedule with a Monday calendar spec", async () => {
    const client = clientMock();

    await ensureWeeklyDigestSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "sendWeeklyReportDigestWorkflow" }),
        scheduleId: WEEKLY_DIGEST_SCHEDULE_ID,
        spec: { calendars: [{ dayOfWeek: "MONDAY", hour: 6, minute: 15 }] },
      }),
    );
  });

  it("honors an interval override for the stale running-check sweep", async () => {
    vi.stubEnv("STALE_CHECKS_INTERVAL", "5 minutes");
    const client = clientMock();

    await ensureStaleChecksSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { intervals: [{ every: "5 minutes" }] } }),
    );
  });

  it("honors a cron override for a purge schedule", async () => {
    vi.stubEnv("AUDIT_PURGE_CRON", "0 5 * * *");
    const client = clientMock();

    await ensureAuditPurgeSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { cronExpressions: ["0 5 * * *"] } }),
    );
  });

  it("honors a cron override for the rank-check raw purge schedule", async () => {
    vi.stubEnv("RANK_CHECK_RAW_PURGE_CRON", "12 5 * * *");
    const client = clientMock();

    await ensureRankCheckRawPurgeSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { cronExpressions: ["12 5 * * *"] } }),
    );
  });

  it("honors a cron override for the weekly digest schedule", async () => {
    vi.stubEnv("WEEKLY_DIGEST_CRON", "15 6 * * 1");
    const client = clientMock();

    await ensureWeeklyDigestSchedule(client);

    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { cronExpressions: ["15 6 * * 1"] } }),
    );
  });

  it("treats an already-running schedule as existing", async () => {
    const client = clientMock();
    client.create.mockRejectedValue(
      new ScheduleAlreadyRunning("exists", SESSION_PURGE_SCHEDULE_ID),
    );

    await expect(ensureSessionPurgeSchedule(client)).resolves.toEqual({
      scheduleId: SESSION_PURGE_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("treats an already-running weekly digest schedule as existing", async () => {
    const client = clientMock();
    client.create.mockRejectedValue(
      new ScheduleAlreadyRunning("exists", WEEKLY_DIGEST_SCHEDULE_ID),
    );

    await expect(ensureWeeklyDigestSchedule(client)).resolves.toEqual({
      scheduleId: WEEKLY_DIGEST_SCHEDULE_ID,
      status: "exists",
    });
  });

  it("swallows unexpected errors so the worker still starts", async () => {
    const client = clientMock();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    client.create.mockRejectedValue(new Error("Temporal unavailable"));

    await expect(ensureSessionPurgeSchedule(client)).resolves.toEqual({
      scheduleId: SESSION_PURGE_SCHEDULE_ID,
      status: "failed",
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
