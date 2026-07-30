import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ALERT_DIGEST_FLUSH_SCHEDULE_ID,
  ALERT_HEALTH_SCHEDULE_ID,
  ensureAlertDigestFlushSchedule,
  ensureAlertHealthSchedule,
  ensurePresenceSyncSchedule,
  ensureSitemapSyncSchedule,
  isPresenceSyncEnabled,
  isSitemapSyncEnabled,
  PRESENCE_SYNC_SCHEDULE_ID,
  SITEMAP_SYNC_SCHEDULE_ID,
} from "./maintenance-schedule-bootstrap";

function clientMock() {
  return { create: vi.fn() };
}

describe("optional sync schedule gates", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults sitemap sync off and enables it explicitly", () => {
    expect(isSitemapSyncEnabled()).toBe(false);
    vi.stubEnv("SITEMAP_SYNC_ENABLED", "true");
    expect(isSitemapSyncEnabled()).toBe(true);
  });

  it("defaults presence sync off and enables it explicitly", () => {
    expect(isPresenceSyncEnabled()).toBe(false);
    vi.stubEnv("PRESENCE_SYNC_ENABLED", "true");
    expect(isPresenceSyncEnabled()).toBe(true);
  });
});

describe("alert and optional sync schedules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("digest flush schedule stays enabled when scheduled maintenance is disabled", async () => {
    vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "0");
    const client = clientMock();
    await expect(ensureAlertDigestFlushSchedule(client)).resolves.toEqual({
      scheduleId: ALERT_DIGEST_FLUSH_SCHEDULE_ID,
      status: "created",
    });

    vi.stubEnv("ALERT_DIGEST_FLUSH_ENABLED", "0");
    await expect(ensureAlertDigestFlushSchedule(client)).resolves.toEqual({
      scheduleId: ALERT_DIGEST_FLUSH_SCHEDULE_ID,
      status: "disabled",
    });
  });

  it("keeps optional sync schedules gated off by default", async () => {
    const client = clientMock();
    await expect(ensureSitemapSyncSchedule(client)).resolves.toEqual({
      scheduleId: SITEMAP_SYNC_SCHEDULE_ID,
      status: "disabled",
    });
    await expect(ensurePresenceSyncSchedule(client)).resolves.toEqual({
      scheduleId: PRESENCE_SYNC_SCHEDULE_ID,
      status: "disabled",
    });
  });

  it("creates the alert digest flush schedule with the default interval", async () => {
    const client = clientMock();
    await ensureAlertDigestFlushSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "flushAlertDigestsWorkflow" }),
        scheduleId: ALERT_DIGEST_FLUSH_SCHEDULE_ID,
        spec: { intervals: [{ every: "5 minutes" }] },
      }),
    );
  });

  it("creates the alert health schedule with the default interval", async () => {
    const client = clientMock();
    await ensureAlertHealthSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: expect.objectContaining({ workflowType: "alertHealthWorkflow" }),
        scheduleId: ALERT_HEALTH_SCHEDULE_ID,
        spec: { intervals: [{ every: "1 hour" }] },
      }),
    );
  });

  it("creates the daily sitemap sync schedule with a calendar spec", async () => {
    vi.stubEnv("SITEMAP_SYNC_ENABLED", "1");
    const client = clientMock();
    await ensureSitemapSyncSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: SITEMAP_SYNC_SCHEDULE_ID,
        spec: { calendars: [{ hour: 4, minute: 45 }] },
      }),
    );
  });

  it("creates the daily presence sync schedule with a calendar spec", async () => {
    vi.stubEnv("PRESENCE_SYNC_ENABLED", "1");
    const client = clientMock();
    await ensurePresenceSyncSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({
        scheduleId: PRESENCE_SYNC_SCHEDULE_ID,
        spec: { calendars: [{ hour: 3, minute: 45 }] },
      }),
    );
  });

  it("honors an interval override for the alert digest flush", async () => {
    vi.stubEnv("ALERT_DIGEST_FLUSH_INTERVAL", "2 minutes");
    const client = clientMock();
    await ensureAlertDigestFlushSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { intervals: [{ every: "2 minutes" }] } }),
    );
  });

  it("honors an interval override for alert health", async () => {
    vi.stubEnv("ALERT_HEALTH_INTERVAL", "30 minutes");
    const client = clientMock();
    await ensureAlertHealthSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { intervals: [{ every: "30 minutes" }] } }),
    );
  });

  it("honors a cron override for the sitemap sync schedule", async () => {
    vi.stubEnv("SITEMAP_SYNC_ENABLED", "1");
    vi.stubEnv("SITEMAP_SYNC_CRON", "45 4 * * *");
    const client = clientMock();
    await ensureSitemapSyncSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { cronExpressions: ["45 4 * * *"] } }),
    );
  });

  it("honors a cron override for the presence sync schedule", async () => {
    vi.stubEnv("PRESENCE_SYNC_ENABLED", "1");
    vi.stubEnv("PRESENCE_SYNC_CRON", "45 3 * * *");
    const client = clientMock();
    await ensurePresenceSyncSchedule(client);
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ spec: { cronExpressions: ["45 3 * * *"] } }),
    );
  });
});
