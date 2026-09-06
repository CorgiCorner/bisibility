import { SYNC_NOW_COOLDOWN_MS } from "@/lib/search-insights/constants";
import { requestSearchInsightsSync } from "@/lib/search-insights/sync/sync-now";
import { dateFromFrozenNow, FROZEN_NOW } from "@/tests/clock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  loadImportRow: vi.fn(),
  publishWorkerIntent: vi.fn(),
  prisma: {
    project: { findUnique: vi.fn() },
    searchAnalyticsImport: { upsert: vi.fn() },
  },
  resolveConnection: vi.fn(),
}));

vi.mock("@/lib/auth/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  resolveSearchInsightsConnection: mocks.resolveConnection,
  SEARCH_INSIGHTS_SOURCE: "gsc",
}));
vi.mock("@/lib/search-insights/sync/import-state", () => ({
  loadImportRow: mocks.loadImportRow,
}));
vi.mock("@/lib/worker-intents/realtime", () => ({
  publishWorkerIntent: mocks.publishWorkerIntent,
}));
const property = "sc-domain:example.com";
// The action layer authorizes first and hands over the internal id it resolved.
const input = { actorId: "usr_1", projectId: "project_1" };

describe("requestSearchInsightsSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.project.findUnique.mockResolvedValue({
      id: "project_1",
      publicId: "prj_abcdefghijklmnopqrstuvwx",
    });
    mocks.resolveConnection.mockResolvedValue({
      connectionId: "conn_1",
      credentials: { apiKey: "refresh_token", login: property },
      property,
    });
    mocks.loadImportRow.mockResolvedValue(null);
    mocks.publishWorkerIntent.mockResolvedValue({ mode: "redis", ok: true });
    vi.stubEnv("SCHEDULER_DRIVER", "worker");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("reports an empty state when the project has no readable property", async () => {
    mocks.resolveConnection.mockResolvedValue(null);

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "no_connection" });
  });

  it("queues a fresh import for backfill and audits it against the project", async () => {
    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });

    expect(mocks.prisma.searchAnalyticsImport.upsert).toHaveBeenCalledWith({
      create: {
        lastSyncStartedAt: FROZEN_NOW,
        projectId: "project_1",
        property,
        source: "gsc",
        state: "queued",
      },
      update: {
        lastSyncStartedAt: FROZEN_NOW,
        syncRequestedAt: null,
      },
      where: {
        projectId_property_source: { projectId: "project_1", property, source: "gsc" },
      },
    });
    expect(mocks.audit).toHaveBeenCalledWith({
      action: "search_insights.sync_now",
      actorId: "usr_1",
      after: { property },
      projectId: "project_1",
      targetId: "prj_abcdefghijklmnopqrstuvwx",
      targetType: "project",
    });
  });

  it("creates the import row without incremental intent so the backfill worker owns the first run", async () => {
    mocks.loadImportRow.mockResolvedValue(null);

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });

    const upsert = mocks.prisma.searchAnalyticsImport.upsert.mock.calls[0]?.[0];
    expect(upsert.create).toMatchObject({
      lastSyncStartedAt: FROZEN_NOW,
      state: "queued",
    });
    expect(upsert.create).not.toHaveProperty("syncRequestedAt");
    expect(upsert.update).toEqual({ lastSyncStartedAt: FROZEN_NOW, syncRequestedAt: null });
  });

  it("refuses a second run inside the cooldown and says when the next one is allowed", async () => {
    const lastSyncStartedAt = dateFromFrozenNow({ minutes: -1 });
    mocks.loadImportRow.mockResolvedValue({ lastSyncStartedAt, state: "running" });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({
      nextAllowedAt: new Date(lastSyncStartedAt.getTime() + SYNC_NOW_COOLDOWN_MS).toISOString(),
      status: "cooldown",
    });
  });

  it("allows a run once the cooldown has elapsed", async () => {
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
      state: "completed",
      workflowId: null,
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
    expect(mocks.prisma.searchAnalyticsImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          lastSyncStartedAt: FROZEN_NOW,
          syncRequestedAt: FROZEN_NOW,
          syncStartedAt: null,
        },
      }),
    );
    expect(mocks.publishWorkerIntent).toHaveBeenCalledWith("search_insights_sync");
  });

  it("stamps incremental intent for an import waiting for its first data", async () => {
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
      state: "waiting_for_first_data",
      workflowId: null,
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
    expect(mocks.prisma.searchAnalyticsImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          lastSyncStartedAt: FROZEN_NOW,
          syncRequestedAt: FROZEN_NOW,
          syncStartedAt: null,
        },
      }),
    );
  });

  it("still queues for a completed import that kept its backfill workflow id", async () => {
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
      state: "completed",
      workflowId: "search-insights-backfill:project_1:abcdef0123456789",
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
  });

  it("joins a running backfill rather than spending the same quota twice", async () => {
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
      state: "running",
      workflowId: "search-insights-backfill:project_1:abcdef0123456789",
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "already_running" });
  });

  it.each(["user", "rate_limited"])(
    "does not bypass a %s pause after its workflow id was released",
    async (pausedReason) => {
      mocks.loadImportRow.mockResolvedValue({
        lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
        pausedReason,
        state: "paused",
        workflowId: null,
      });

      await expect(requestSearchInsightsSync(input)).resolves.toEqual({
        status: "already_running",
      });
    },
  );

  it("queues for an import left queued after a backfill could not plan anything", async () => {
    // The first batch found no finalized day, closed, and released its id; the row is still
    // "queued" and must not answer the manual sync with "already_running" forever.
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: null,
      state: "queued",
      workflowId: null,
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
  });

  it("queues again for a reconnected import whose closed backfill id was cleared", async () => {
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
      state: "running",
      workflowId: null,
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
  });

  it("requeues a failed import for backfill instead of stamping incremental intent", async () => {
    mocks.loadImportRow.mockResolvedValue({
      lastSyncStartedAt: dateFromFrozenNow({ minutes: -6 }),
      state: "failed",
      workflowId: null,
    });

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });
    expect(mocks.prisma.searchAnalyticsImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          lastSyncStartedAt: FROZEN_NOW,
          pausedReason: null,
          state: "queued",
          syncRequestedAt: null,
          syncStartedAt: null,
          workflowId: null,
        },
      }),
    );
  });

  it("keeps reporting a queued sync when only the audit record could not be written", async () => {
    mocks.audit.mockRejectedValue(new Error("audit unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // The intent is durable and the cooldown is stamped: calling this unavailable would
    // invite a retry that can only answer "cooldown".
    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "queued" });

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("reports unavailable on a deployment with no scheduler", async () => {
    vi.stubEnv("SCHEDULER_DRIVER", "none");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "unavailable" });

    expect(mocks.audit).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.upsert).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("cannot return unavailable under the worker driver", async () => {
    const result = await requestSearchInsightsSync(input);

    expect(result).toEqual({ status: "queued" });
    expect(result.status).not.toBe("unavailable");
  });

  it("looks the project up by its internal id and stops when nothing answers", async () => {
    mocks.prisma.project.findUnique.mockResolvedValue(null);

    await expect(requestSearchInsightsSync(input)).resolves.toEqual({ status: "no_connection" });
    expect(mocks.prisma.project.findUnique).toHaveBeenCalledWith({
      select: { id: true, publicId: true },
      where: { id: "project_1" },
    });
    expect(mocks.resolveConnection).not.toHaveBeenCalled();
  });
});
