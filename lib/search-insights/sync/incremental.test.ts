import {
  runIncrementalForAllProjects,
  runIncrementalSync,
} from "@/lib/search-insights/sync/incremental";
import { dateFromFrozenNow } from "@/tests/clock";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countCappedDays: vi.fn(),
  cacheKeyEvents: vi.fn(),
  cacheKeyEventsForAll: vi.fn(),
  createSession: vi.fn(),
  ensureImport: vi.fn(),
  isUserPaused: vi.fn(),
  fetchAggregateRange: vi.fn(),
  probeFreshness: vi.fn(),
  prisma: {
    project: { findMany: vi.fn() },
    searchAnalyticsImport: {
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
  recordImportFailure: vi.fn(),
  readImportObservability: vi.fn(),
  refreshWindowFacts: vi.fn(),
  resolveConnection: vi.fn(),
  resolveSessionsConnection: vi.fn(),
  sessionsForAll: vi.fn(),
  sessionsSync: vi.fn(),
  syncCompleteDay: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/providers/analytics/gsc-search-analytics", () => ({
  createGscSearchAnalyticsSession: mocks.createSession,
}));
vi.mock("@/lib/search-insights/sync/aggregate", () => ({
  fetchAggregateRange: mocks.fetchAggregateRange,
  probeFreshness: mocks.probeFreshness,
}));
vi.mock("@/lib/search-insights/sync/credentials", () => ({
  resolveSearchInsightsConnection: mocks.resolveConnection,
  SEARCH_INSIGHTS_SOURCE: "gsc",
}));
vi.mock("@/lib/search-insights/sync/ensure-import", () => ({
  ensureSearchInsightsImport: mocks.ensureImport,
}));
vi.mock("@/lib/search-insights/sync/import-state", () => ({
  recordImportFailure: mocks.recordImportFailure,
}));
vi.mock("@/lib/search-insights/sync/user-pause", () => ({
  isImportUserPaused: mocks.isUserPaused,
  userPauseGuard: (id: string) => ({ id }),
}));
vi.mock("@/lib/search-insights/sync/day-sync", () => ({
  syncCompleteGscDay: mocks.syncCompleteDay,
}));
vi.mock("@/lib/search-insights/sync/partitions", () => ({
  countCappedDays: mocks.countCappedDays,
}));
vi.mock("@/lib/search-insights/queries/import-observability-db", () => ({
  readImportObservability: mocks.readImportObservability,
}));
vi.mock("@/lib/search-insights/queries/window-facts-compute", () => ({
  refreshWindowFacts: mocks.refreshWindowFacts,
}));
vi.mock("@/lib/search-insights/sync/ga4-key-events", () => ({
  cacheGa4KeyEventsConfiguration: mocks.cacheKeyEvents,
  cacheGa4KeyEventsConfigurationsForAllProjects: mocks.cacheKeyEventsForAll,
}));
vi.mock("@/lib/search-insights/sync/sessions-incremental", () => ({
  runOrganicSessionsIncrementalForAllProjects: mocks.sessionsForAll,
  runOrganicSessionsIncrementalSync: mocks.sessionsSync,
}));
vi.mock("@/lib/search-insights/sync/sessions-credentials", () => ({
  resolveOrganicSessionsConnection: mocks.resolveSessionsConnection,
}));
const property = "sc-domain:example.com";
const connection = {
  connectionId: "conn_1",
  credentials: { apiKey: "refresh_token", login: property },
  property,
};
// The batch opens one session and every request rides it, so the token endpoint is hit
// once rather than once per fetch.
const session = { fetchEnvelope: vi.fn(), property };
const probedAt = new Date("2026-07-08T12:40:00.000Z");
const now = dateFromFrozenNow({ days: -2 });

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    cursorDate: new Date("2026-01-15T00:00:00.000Z"),
    earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
    finalizedThroughDate: new Date("2026-07-05T00:00:00.000Z"),
    id: "imp_1",
    pausedReason: null,
    projectId: "project_1",
    property,
    state: "running",
    ...overrides,
  };
}

describe("runIncrementalSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isUserPaused.mockResolvedValue(false);
    mocks.resolveConnection.mockResolvedValue(connection);
    mocks.createSession.mockResolvedValue(session);
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(importRow());
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
    mocks.syncCompleteDay.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      returnedRows: 10,
    });
    mocks.sessionsForAll.mockResolvedValue(undefined);
    mocks.fetchAggregateRange.mockResolvedValue({ kind: "no_data", returnedDays: 0 });
    mocks.recordImportFailure.mockResolvedValue("error");
    mocks.readImportObservability.mockResolvedValue({
      readyThrough: {
        d1: { current: true, previous: true },
        d7: { current: false, previous: false },
        d28: { current: true, previous: true },
        d90: { current: false, previous: false },
      },
    });
    mocks.refreshWindowFacts.mockResolvedValue({ failed: [], written: [28] });
    mocks.resolveSessionsConnection.mockResolvedValue(null);
  });

  it("reports an empty state instead of an error when nothing is connected", async () => {
    mocks.resolveConnection.mockResolvedValue(null);

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toEqual({
      daysProcessed: 0,
      projectId: "project_1",
      status: "not_connected",
    });
    expect(mocks.prisma.searchAnalyticsImport.upsert).not.toHaveBeenCalled();
  });

  it("still refreshes organic sessions when only the sessions provider is connected", async () => {
    mocks.resolveConnection.mockResolvedValue(null);
    mocks.resolveSessionsConnection.mockResolvedValue({
      connectionId: "conn_ga4",
      credentials: { apiKey: "refresh_token", login: "123456789" },
      property: "123456789",
    });

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toEqual({
      daysProcessed: 0,
      projectId: "project_1",
      status: "not_connected",
    });
    expect(mocks.sessionsSync).toHaveBeenCalledTimes(1);
    expect(mocks.sessionsSync).toHaveBeenCalledWith({
      now,
      projectId: "project_1",
      property: "123456789",
    });
    expect(mocks.ensureImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
    expect(mocks.prisma.searchAnalyticsImport.upsert).not.toHaveBeenCalled();
  });

  it("skips every provider request while user-paused", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({ pausedReason: "user", state: "paused" }),
    );
    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toMatchObject({
      daysProcessed: 0,
      status: "user_paused",
    });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.probeFreshness).not.toHaveBeenCalled();
    expect(mocks.sessionsSync).not.toHaveBeenCalled();
  });

  it("uses exactly one aggregate request when waiting for first data", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({
        cursorDate: null,
        earliestTargetDate: null,
        finalizedThroughDate: null,
        newestFinalizedDate: new Date("2026-07-05T00:00:00.000Z"),
        plannedRetentionMonths: 16,
        state: "waiting_for_first_data",
      }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt,
    });
    mocks.fetchAggregateRange.mockResolvedValue({ kind: "no_data", returnedDays: 0 });

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toMatchObject({
      daysProcessed: 0,
      status: "waiting_for_first_data",
    });
    expect(mocks.probeFreshness).not.toHaveBeenCalled();
    expect(mocks.fetchAggregateRange).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAggregateRange).toHaveBeenCalledWith(
      expect.objectContaining({ end: "2026-07-08", start: "2025-03-08" }),
    );
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
  });

  it("queues one clamped backfill when a waiting property gets its first data", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({
        cursorDate: null,
        earliestTargetDate: null,
        finalizedThroughDate: null,
        newestFinalizedDate: new Date("2026-07-05T00:00:00.000Z"),
        plannedRetentionMonths: 16,
        state: "waiting_for_first_data",
      }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt,
    });
    mocks.fetchAggregateRange.mockResolvedValue({
      firstDataDate: "2026-07-07",
      kind: "data_found",
      returnedDays: 1,
    });

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toMatchObject({
      daysProcessed: 0,
      status: "backfill_queued",
    });
    expect(mocks.probeFreshness).not.toHaveBeenCalled();
    expect(mocks.fetchAggregateRange).toHaveBeenCalledTimes(1);
    expect(mocks.fetchAggregateRange).toHaveBeenCalledWith(
      expect.objectContaining({ end: "2026-07-08", start: "2025-03-08" }),
    );
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        cursorDate: null,
        daysTotal: 0,
        earliestTargetDate: null,
        firstDataDate: new Date("2026-07-07T00:00:00.000Z"),
        historyBoundarySource: "first_data",
        state: "queued",
        workflowId: null,
      }),
      where: { id: "imp_1", state: "waiting_for_first_data", workflowId: null },
    });
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
  });

  it.each(["error", "needs_reauth", "rate_limited"] as const)(
    "never maps a failed waiting aggregate to waiting success for %s",
    async (reason) => {
      mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
        importRow({
          cursorDate: null,
          earliestTargetDate: null,
          finalizedThroughDate: null,
          newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
          state: "waiting_for_first_data",
        }),
      );
      mocks.fetchAggregateRange.mockRejectedValue(new Error(reason));
      mocks.recordImportFailure.mockResolvedValue(reason);

      const result = await runIncrementalSync({ now, projectId: "project_1" });

      expect(result.status).not.toBe("waiting_for_first_data");
      expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ state: "waiting_for_first_data" }),
        }),
      );
    },
  );

  it("spends no provider quota when the provider has finalized no new day", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-05",
      probedAt,
    });
    mocks.sessionsForAll.mockResolvedValue(undefined);

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toEqual({
      daysProcessed: 0,
      projectId: "project_1",
      status: "no_new_days",
    });
    expect(mocks.fetchAggregateRange).not.toHaveBeenCalled();
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith({
      data: {
        availabilityBoundarySource: "metadata",
        lastError: null,
        lastProbeAt: probedAt,
        newestFinalizedDate: new Date("2026-07-05T00:00:00.000Z"),
        pausedReason: null,
      },
      where: { id: "imp_1" },
    });
  });

  it("leaves the manual sync cooldown untouched when the scheduled sweep runs", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-05",
      probedAt,
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    expect(mocks.prisma.searchAnalyticsImport.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });

  it("ensures and advances the sessions import when Sync now runs", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-05",
      probedAt,
    });
    mocks.resolveSessionsConnection.mockResolvedValue({
      connectionId: "conn_ga4",
      credentials: { apiKey: "refresh_token", login: "123456789" },
      property: "123456789",
    });
    mocks.prisma.searchAnalyticsImport.findUnique.mockResolvedValue({ id: "imp_ga4" });

    await runIncrementalSync({ now, projectId: "project_1" });

    expect(mocks.ensureImport).toHaveBeenCalledWith({
      projectId: "project_1",
      property: "123456789",
      source: "ga4",
    });
    expect(mocks.sessionsSync).toHaveBeenCalledWith({
      now,
      projectId: "project_1",
      property: "123456789",
    });
    expect(mocks.sessionsSync).toHaveBeenCalledTimes(1);
  });

  it("checks key events once alongside one GA4 sessions sync", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-05",
      probedAt,
    });
    mocks.resolveSessionsConnection.mockResolvedValue({
      connectionId: "conn_ga4",
      credentials: { apiKey: "refresh_token", login: "123456789" },
      property: "123456789",
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    expect(mocks.cacheKeyEvents).toHaveBeenCalledTimes(1);
    expect(mocks.cacheKeyEvents).toHaveBeenCalledWith({
      credentials: { apiKey: "refresh_token", login: "123456789" },
      now,
      projectId: "project_1",
      property: "123456789",
    });
  });

  it("rereads the trailing days before new ones and moves the finalized-through marker", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt,
    });

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toEqual({
      daysProcessed: 4,
      projectId: "project_1",
      status: "synced",
    });

    expect(mocks.fetchAggregateRange).toHaveBeenCalledWith({
      end: "2026-07-07",
      projectId: "project_1",
      property,
      session,
      start: "2026-07-04",
    });
    // The probe, the totals and every day partition ride one access token.
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.syncCompleteDay.mock.calls.map(([call]) => call.date)).toEqual([
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
    ]);
    expect(mocks.prisma.searchAnalyticsImport.update).toHaveBeenCalledWith({
      data: expect.objectContaining({
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        lastError: null,
        lastProbeAt: probedAt,
        pausedReason: null,
      }),
      where: { id: "imp_1" },
    });
    const synced = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(synced).not.toHaveProperty("capHitDays");
    expect(mocks.countCappedDays).not.toHaveBeenCalled();
  });

  it("refreshes only current ready windows after it stores incremental days", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt,
    });
    mocks.prisma.searchAnalyticsImport.update.mockResolvedValue(
      importRow({ newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z") }),
    );

    await runIncrementalSync({ now, projectId: "project_1", syncSessions: false });

    expect(mocks.refreshWindowFacts).toHaveBeenCalledWith({
      finalizedThrough: "2026-07-07",
      importId: "imp_1",
      projectId: "project_1",
      property,
      readyWindowDays: [28],
    });
  });

  it("fetches the newest finalized day for an import that has stored none yet", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({ cursorDate: null, earliestTargetDate: null, finalizedThroughDate: null }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt,
    });

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toEqual({
      daysProcessed: 1,
      projectId: "project_1",
      status: "synced",
    });

    // The backfill starts on this same day, so the two overlap on exactly one day. Each
    // writer replaces the whole day slice, so whichever lands last is authoritative.
    expect(mocks.syncCompleteDay.mock.calls.map(([call]) => call.date)).toEqual(["2026-07-07"]);
  });

  it("stores the capped-day count the partitions report once a day comes back truncated", async () => {
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-06",
      probedAt,
    });
    mocks.syncCompleteDay.mockResolvedValue({
      capHit: true,
      pages: 2,
      requestedRows: 50_000,
      returnedRows: 50_000,
    });
    mocks.countCappedDays.mockResolvedValue(3);

    await runIncrementalSync({ now, projectId: "project_1" });

    expect(mocks.countCappedDays).toHaveBeenCalledWith({ projectId: "project_1", property });
    const data = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data.capHitDays).toBe(3);
  });

  it("lets a successful read end a quota pause without touching the backfill cursor", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({ pausedReason: "rate_limited", state: "paused" }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-06",
      probedAt,
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    const data = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data.state).toBe("running");
    expect(data).not.toHaveProperty("cursorDate");
    expect(data).not.toHaveProperty("workflowId");
  });

  it("clears the backfill id a reconnect made unreachable so the manual sync works again", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({ pausedReason: "needs_reauth", state: "paused" }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-06",
      probedAt,
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    const data = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({ pausedReason: null, state: "running", workflowId: null });
  });

  it("gives a finished import its completed state back after a quota pause", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(
      importRow({ cursorDate: new Date("2025-03-06T00:00:00.000Z"), state: "paused" }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-06",
      probedAt,
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    const data = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data.state).toBe("completed");
    expect(data.pausedReason).toBeNull();
    expect(data).not.toHaveProperty("workflowId");
  });

  it("holds a failed import at paused and drops the id of the execution that gave up", async () => {
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(importRow({ state: "failed" }));
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-06",
      probedAt,
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    // The sweep proves the provider answers again, but the backfill it stopped is not
    // executing until a read path re-arms it, so the row must not claim progress.
    const data = mocks.prisma.searchAnalyticsImport.update.mock.calls[0]?.[0].data;
    expect(data).toMatchObject({
      lastError: null,
      pausedReason: "error",
      state: "paused",
      workflowId: null,
    });
  });

  it("classifies a quota pause without failing the run", async () => {
    mocks.probeFreshness.mockRejectedValue(new Error("rate limited"));
    mocks.recordImportFailure.mockResolvedValue("rate_limited");

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toEqual({
      daysProcessed: 0,
      projectId: "project_1",
      status: "rate_limited",
    });
    expect(mocks.recordImportFailure).toHaveBeenCalledWith(
      expect.objectContaining({ connectionId: "conn_1", importId: "imp_1" }),
    );
  });

  it("runs the independent sessions sync when the Search Console path fails", async () => {
    mocks.probeFreshness.mockRejectedValue(new Error("rate limited"));
    mocks.recordImportFailure.mockResolvedValue("rate_limited");
    mocks.resolveSessionsConnection.mockResolvedValue({
      connectionId: "conn_ga4",
      credentials: { apiKey: "refresh_token", login: "123456789" },
      property: "123456789",
    });

    await runIncrementalSync({ now, projectId: "project_1" });

    expect(mocks.sessionsSync).toHaveBeenCalledWith({
      now,
      projectId: "project_1",
      property: "123456789",
    });
    expect(mocks.sessionsSync).toHaveBeenCalledTimes(1);
  });

  it("maps a lost authorization to a reconnect status", async () => {
    mocks.probeFreshness.mockRejectedValue(new Error("unauthorized"));
    mocks.recordImportFailure.mockResolvedValue("needs_reauth");

    await expect(runIncrementalSync({ now, projectId: "project_1" })).resolves.toMatchObject({
      status: "needs_reauth",
    });
  });
});

describe("runIncrementalForAllProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveConnection.mockResolvedValue(connection);
    mocks.createSession.mockResolvedValue(session);
    mocks.prisma.searchAnalyticsImport.upsert.mockResolvedValue(importRow());
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-05",
      probedAt,
    });
  });

  it("selects only projects with an enabled, connected analytics integration", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([]);

    await expect(runIncrementalForAllProjects(now)).resolves.toEqual({ projects: [] });
    expect(mocks.prisma.project.findMany).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        providerConnections: {
          some: { enabled: true, kind: "analytics", provider: "gsc", status: "connected" },
        },
      },
    });
  });

  it("isolates each project so one failure cannot stop the rest", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_1" }, { id: "project_2" }]);
    mocks.resolveConnection
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValueOnce(connection);
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runIncrementalForAllProjects(now)).resolves.toEqual({
      projects: [
        { daysProcessed: 0, projectId: "project_1", status: "failed" },
        { daysProcessed: 0, projectId: "project_2", status: "no_new_days" },
      ],
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("hands mixed connections to one sessions sweep, including GA4-only projects", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([{ id: "project_both" }]);

    await runIncrementalForAllProjects(now);

    // Search Console projects skip their trailing call here; the GA4 sweep owns both this
    // project and GA4-only projects, so neither can be refreshed twice.
    expect(mocks.sessionsSync).not.toHaveBeenCalled();
    expect(mocks.sessionsForAll).toHaveBeenCalledTimes(1);
    expect(mocks.sessionsForAll).toHaveBeenCalledWith(now);
    expect(mocks.cacheKeyEventsForAll).toHaveBeenCalledTimes(1);
    expect(mocks.cacheKeyEventsForAll).toHaveBeenCalledWith(now);
  });

  it("returns the Search Console results when the appended sessions sweep throws", async () => {
    mocks.prisma.project.findMany.mockResolvedValue([]);
    mocks.sessionsForAll.mockRejectedValue(new Error("sessions unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(runIncrementalForAllProjects(now)).resolves.toEqual({ projects: [] });

    expect(consoleError).toHaveBeenCalledWith(
      "[search-insights] sessions sweep failed",
      expect.objectContaining({ error: expect.any(Error) }),
    );
    consoleError.mockRestore();
  });
});
