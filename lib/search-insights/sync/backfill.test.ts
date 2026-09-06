import { ProviderRateLimitedError } from "@/lib/providers/rate-limit";
import { runBackfillBatch } from "@/lib/search-insights/sync/backfill";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  countCappedDays: vi.fn(),
  createSession: vi.fn(),
  fetchAggregateRange: vi.fn(),
  isUserPaused: vi.fn(),
  loadImportRow: vi.fn(),
  probeFreshness: vi.fn(),
  prisma: {
    projectDefaults: { findUnique: vi.fn() },
    searchAnalyticsImport: { update: vi.fn(), updateMany: vi.fn() },
  },
  readConnection: vi.fn(),
  recordImportFailure: vi.fn(),
  readImportObservability: vi.fn(),
  refreshWindowFacts: vi.fn(),
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
  readSearchInsightsConnection: mocks.readConnection,
  SEARCH_INSIGHTS_SOURCE: "gsc",
}));
vi.mock("@/lib/search-insights/sync/import-state", () => ({
  loadImportRow: mocks.loadImportRow,
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

const property = "sc-domain:example.com";
const connection = {
  connectionId: "conn_1",
  credentials: { apiKey: "refresh_token", login: property },
  property,
};
const input = { batchSize: 2, projectId: "project_1", property };
// The batch opens one session and every request rides it, so the token endpoint is hit
// once rather than once per fetch.
const session = { fetchEnvelope: vi.fn(), property };

function importRow(overrides: Record<string, unknown> = {}) {
  return {
    cursorDate: null,
    daysTotal: 0,
    earliestTargetDate: null,
    finalizedThroughDate: null,
    id: "imp_1",
    newestFinalizedDate: null,
    projectId: "project_1",
    property,
    state: "queued",
    ...overrides,
  };
}

function updateData(callIndex: number) {
  const calls = [
    ...mocks.prisma.searchAnalyticsImport.update.mock.calls,
    ...mocks.prisma.searchAnalyticsImport.updateMany.mock.calls,
  ];
  return calls[callIndex]?.[0].data;
}

describe("runBackfillBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue(null);
    mocks.isUserPaused.mockResolvedValue(false);
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValue({ count: 1 });
    mocks.readConnection.mockResolvedValue({ connection, problem: null });
    mocks.createSession.mockResolvedValue(session);
    mocks.countCappedDays.mockResolvedValue(0);
    mocks.syncCompleteDay.mockResolvedValue({
      capHit: false,
      pages: 1,
      requestedRows: 25_000,
      returnedRows: 10,
    });
    mocks.fetchAggregateRange.mockResolvedValue({
      firstDataDate: "2025-03-07",
      kind: "data_found",
      returnedDays: 488,
    });
    mocks.readImportObservability.mockResolvedValue({
      readyThrough: {
        d1: { current: true, previous: true },
        d7: { current: true, previous: true },
        d28: { current: false, previous: false },
        d90: { current: true, previous: false },
      },
    });
    mocks.refreshWindowFacts.mockResolvedValue({ failed: [], written: [7, 90] });
  });

  it("probes freshness, plans the window and pulls every total before any day partition", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: false,
      daysProcessed: 2,
      done: false,
      nextCursor: "2026-07-05",
    });

    expect(mocks.fetchAggregateRange).toHaveBeenCalledWith({
      end: "2026-07-07",
      projectId: "project_1",
      property,
      session,
      start: "2025-03-07",
    });
    // The sixteen-month range and every day partition ride one access token.
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(updateData(0)).toMatchObject({
      cursorDate: new Date("2026-07-07T00:00:00.000Z"),
      daysTotal: 488,
      earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
      newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
      state: "running",
    });
    expect(updateData(0)).not.toHaveProperty("lastSyncStartedAt");
  });

  it("retries instead of persisting an initial plan after settings change mid-probe", async () => {
    const settingsUpdatedAt = new Date("2026-07-08T12:39:00.000Z");
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 3,
      searchSyncPace: "normal",
      updatedAt: settingsUpdatedAt,
    });
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });
    mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      daysProcessed: 0,
      done: false,
      importId: "imp_1",
      nextCursor: null,
      requestSets: 0,
    });

    expect(mocks.fetchAggregateRange).toHaveBeenCalledWith(
      expect.objectContaining({ start: "2026-04-07" }),
    );
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ plannedRetentionMonths: 3 }),
      where: expect.objectContaining({
        project: { defaults: { is: { updatedAt: settingsUpdatedAt } } },
      }),
    });
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();

    const replacementUpdatedAt = new Date("2026-07-08T12:41:00.000Z");
    mocks.prisma.projectDefaults.findUnique.mockResolvedValue({
      searchSyncImportMonths: 16,
      searchSyncPace: "normal",
      updatedAt: replacementUpdatedAt,
    });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      daysProcessed: 2,
      done: false,
      nextCursor: "2026-07-05",
    });
    expect(mocks.fetchAggregateRange).toHaveBeenLastCalledWith(
      expect.objectContaining({ start: "2025-03-07" }),
    );
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ plannedRetentionMonths: 16 }),
      where: expect.objectContaining({
        project: { defaults: { is: { updatedAt: replacementUpdatedAt } } },
      }),
    });
  });

  it("clamps a fresh plan to the first day with impressions", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });
    mocks.fetchAggregateRange.mockResolvedValue({
      firstDataDate: "2026-05-12",
      kind: "data_found",
      returnedDays: 57,
    });

    await runBackfillBatch(input);

    expect(updateData(0)).toMatchObject({
      daysTotal: 57,
      earliestTargetDate: new Date("2026-05-12T00:00:00.000Z"),
      firstDataDate: new Date("2026-05-12T00:00:00.000Z"),
      historyBoundarySource: "first_data",
    });
  });

  it("returns to waiting when discovered data is newer than the finalized boundary", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        firstDataDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "queued",
        waitingForFirstDataAt: new Date("2026-07-01T00:00:00.000Z"),
      }),
    );
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "fallback",
      newestFinalizedDate: "2026-07-05",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      daysProcessed: 0,
      waitingForFirstData: true,
    });

    expect(mocks.fetchAggregateRange).not.toHaveBeenCalled();
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
    expect(updateData(0)).toMatchObject({
      daysTotal: 0,
      earliestTargetDate: null,
      firstDataDate: new Date("2026-07-07T00:00:00.000Z"),
      newestFinalizedDate: new Date("2026-07-05T00:00:00.000Z"),
      state: "waiting_for_first_data",
      workflowId: null,
    });
  });

  it("waits for first data without scheduling any dimensional day", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });
    mocks.fetchAggregateRange.mockResolvedValue({ kind: "no_data", returnedDays: 0 });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: false,
      daysProcessed: 0,
      done: false,
      importId: "imp_1",
      nextCursor: null,
      waitingForFirstData: true,
    });
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
    expect(updateData(0)).toMatchObject({
      cursorDate: null,
      daysDone: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      historyBoundarySource: "no_data",
      state: "waiting_for_first_data",
      workflowId: null,
    });
  });

  it("never maps a failed planning request to waiting for first data", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });
    const error = new TypeError("network unavailable");
    mocks.fetchAggregateRange.mockRejectedValue(error);
    mocks.recordImportFailure.mockResolvedValue("error");

    await expect(runBackfillBatch(input)).rejects.toBe(error);
    expect(mocks.prisma.searchAnalyticsImport.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ state: "waiting_for_first_data" }),
      }),
    );
  });

  it("clears the previous pause once a day is stored again", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "paused",
      }),
    );

    await runBackfillBatch(input);

    expect(updateData(0)).toMatchObject({
      lastError: null,
      pausedReason: null,
      state: "running",
    });
  });

  it("counts stored days against the frozen plan so a retried day cannot be counted twice", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );

    await runBackfillBatch(input);

    // Three days of the window are behind the cursor, so the counter reads three then four,
    // whatever a retry re-processed; an increment would drift past the planned total.
    expect(updateData(0)).toMatchObject({ daysDone: 3 });
    expect(updateData(1)).toMatchObject({ daysDone: 4 });
  });

  it("keeps progress inside the plan after a sweep finalizes a newer day", async () => {
    // The nightly sweep advanced the newest finalized day by two while this import was walking
    // the plan it froze at connect time. Measured from the moving day, the bar would claim more
    // days than the plan holds; measured from the earliest target day, it cannot.
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2025-03-07T00:00:00.000Z"),
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-09T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-09T00:00:00.000Z"),
        state: "running",
      }),
    );

    await runBackfillBatch(input);

    expect(updateData(0)).toMatchObject({ daysDone: 488 });
  });

  it("stores the newest days first and advances the cursor one day at a time", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.probeFreshness.mockResolvedValue({
      availabilityBoundarySource: "metadata",
      newestFinalizedDate: "2026-07-07",
      probedAt: new Date("2026-07-08T12:40:00.000Z"),
    });

    await runBackfillBatch(input);

    expect(mocks.syncCompleteDay).toHaveBeenCalledTimes(2);
    expect(mocks.syncCompleteDay.mock.calls.map(([call]) => call.date)).toEqual([
      "2026-07-07",
      "2026-07-06",
    ]);
    expect(updateData(1)).toMatchObject({ cursorDate: new Date("2026-07-06T00:00:00.000Z") });
    expect(updateData(2).finalizedThroughDate).toBeUndefined();
    // The marker moves forward only: the scheduled sweep can finalize a newer day while this
    // batch is in flight, and writing the older day back would age the trust strip.
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledTimes(5);
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: { firstDataDetectedAt: expect.any(Date) },
      where: expect.objectContaining({
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        firstDataDetectedAt: null,
        waitingForFirstDataAt: { not: null },
      }),
    });
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: { finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z") },
      where: {
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        AND: [
          {
            OR: [
              { finalizedThroughDate: null },
              { finalizedThroughDate: { lt: new Date("2026-07-07T00:00:00.000Z") } },
            ],
          },
        ],
        id: "imp_1",
      },
    });
  });

  it("resumes from the stored plan without probing the provider again", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: false,
      daysProcessed: 2,
      done: false,
      nextCursor: "2026-07-03",
    });
    expect(mocks.probeFreshness).not.toHaveBeenCalled();
    expect(mocks.fetchAggregateRange).not.toHaveBeenCalled();
  });

  it("refreshes only the windows the readiness gate calls current after stored days", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );

    await runBackfillBatch(input);

    expect(mocks.refreshWindowFacts).toHaveBeenCalledWith({
      finalizedThrough: "2026-07-07",
      importId: "imp_1",
      projectId: "project_1",
      property,
      readyWindowDays: [7, 90],
    });
  });

  it("keeps stored batch results when a facts refresh throws", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    const error = new Error("facts unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.refreshWindowFacts.mockRejectedValue(error);

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      daysProcessed: 2,
      done: false,
      nextCursor: "2026-07-03",
    });

    expect(consoleError).toHaveBeenCalledWith(
      "[search-insights] window facts refresh failed",
      expect.objectContaining({ error, importId: "imp_1", projectId: "project_1" }),
    );
    consoleError.mockRestore();
  });

  it("completes the import once the cursor passes the earliest target day", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2025-03-07T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: false,
      daysProcessed: 1,
      done: true,
      nextCursor: null,
    });
    expect(updateData(1)).toMatchObject({ pausedReason: null, state: "completed" });
    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ state: "completed" }),
      where: expect.objectContaining({
        daysTotal: 0,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
      }),
    });
  });

  it("stops when a concurrent re-plan rejects the stale progress write", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2025-03-07T00:00:00.000Z"),
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    mocks.syncCompleteDay.mockImplementationOnce(async () => {
      // A settings save re-planned the depth after this request stored its partition.
      mocks.prisma.searchAnalyticsImport.updateMany.mockResolvedValueOnce({ count: 0 });
      return { capHit: false, pages: 1, requestedRows: 25_000, returnedRows: 10 };
    });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      daysProcessed: 0,
      done: false,
      nextCursor: "2025-03-07",
      requestSets: 3,
    });

    expect(mocks.prisma.searchAnalyticsImport.updateMany).toHaveBeenCalledWith({
      data: expect.objectContaining({ cursorDate: new Date("2025-03-06T00:00:00.000Z") }),
      where: expect.objectContaining({
        daysTotal: 488,
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
      }),
    });
    expect(updateData(1)).toBeUndefined();
  });

  it("stores the capped-day count the partitions report, never a running total", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2026-07-05T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    mocks.syncCompleteDay.mockResolvedValue({
      capHit: true,
      pages: 2,
      requestedRows: 50_000,
      returnedRows: 50_000,
    });
    // The sweep already stored this day as capped, so counting it again would claim two.
    mocks.countCappedDays.mockResolvedValue(1);

    await runBackfillBatch(input);

    expect(mocks.countCappedDays).toHaveBeenCalledWith({
      projectId: "project_1",
      property,
    });
    expect(updateData(0)).toMatchObject({ capHitDays: 1 });
  });

  it("leaves the capped-day count untouched for a day that was not truncated", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2026-07-05T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );

    await runBackfillBatch(input);

    expect(mocks.countCappedDays).not.toHaveBeenCalled();
    expect(updateData(0)).not.toHaveProperty("capHitDays");
  });

  it("records the failure and rethrows so the workflow can wait out a quota pause", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-07T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    const rateLimited = new ProviderRateLimitedError("gsc");
    mocks.syncCompleteDay.mockRejectedValue(rateLimited);

    await expect(runBackfillBatch(input)).rejects.toBe(rateLimited);
    expect(mocks.recordImportFailure).toHaveBeenCalledWith({
      connectionId: "conn_1",
      error: rateLimited,
      importId: "imp_1",
      projectId: "project_1",
      stream: "backfill",
    });
  });

  it("rethrows the provider failure even when recording it fails", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-07T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    const rateLimited = new ProviderRateLimitedError("gsc");
    mocks.syncCompleteDay.mockRejectedValue(rateLimited);
    mocks.recordImportFailure.mockRejectedValue(new Error("connection lost"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // The workflow reads the quota pause off this error; a bookkeeping failure that replaced
    // it would end the import as failed instead of waiting the quota out.
    await expect(runBackfillBatch(input)).rejects.toBe(rateLimited);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("pauses for a reconnect when the authorization was lost", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow());
    mocks.readConnection.mockResolvedValue({ connection: null, problem: "needs_reauth" });

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: true,
      daysProcessed: 0,
      done: false,
      nextCursor: null,
    });
    // The execution ends here, so the id it held is released with it.
    expect(updateData(0)).toEqual({
      pausedReason: "needs_reauth",
      state: "paused",
      workflowId: null,
    });
  });

  it.each([["disabled"], ["missing"], ["unreadable"]])(
    "does not ask for a reconnect when the connection is %s",
    async (problem) => {
      mocks.loadImportRow.mockResolvedValue(importRow());
      mocks.readConnection.mockResolvedValue({ connection: null, problem });

      await expect(runBackfillBatch(input)).resolves.toMatchObject({ blocked: true });
      expect(updateData(0)).toEqual({
        pausedReason: "error",
        state: "paused",
        workflowId: null,
      });
    },
  );

  it("stops a batch whose row points at a property the connection has moved off", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-05T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        property: "sc-domain:example.org",
        state: "running",
      }),
    );

    await expect(
      runBackfillBatch({ ...input, property: "sc-domain:example.org" }),
    ).resolves.toMatchObject({
      blocked: true,
      daysProcessed: 0,
      done: false,
      nextCursor: null,
    });
    // Fetching here would store the property the connection now points at under this row's key.
    expect(mocks.probeFreshness).not.toHaveBeenCalled();
    expect(mocks.fetchAggregateRange).not.toHaveBeenCalled();
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
    // The execution ends here, so the id it held against the manual sync is released.
    expect(updateData(0)).toEqual({ workflowId: null });
  });

  it("stops at a day boundary once the attempt is cancelled", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-07T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    const controller = new AbortController();
    mocks.syncCompleteDay.mockImplementation(async () => {
      controller.abort();
      return { capHit: false, pages: 1, requestedRows: 25_000, returnedRows: 10 };
    });

    await expect(runBackfillBatch(input, { signal: controller.signal })).resolves.toMatchObject({
      blocked: false,
      daysProcessed: 1,
      done: false,
      nextCursor: "2026-07-06",
    });
    // The retry the timeout already started owns the rest of the batch; carrying on would
    // interleave two delete-then-insert passes over the same days and count them twice.
    expect(mocks.syncCompleteDay).toHaveBeenCalledTimes(1);
  });

  it("reports a missing import row as blocked rather than as a finished window", async () => {
    mocks.loadImportRow.mockResolvedValue(null);

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: true,
      daysProcessed: 0,
      done: false,
      nextCursor: null,
    });
    expect(mocks.readConnection).not.toHaveBeenCalled();
  });

  it("stops before the next day request-set after a durable user pause", async () => {
    mocks.loadImportRow.mockResolvedValue(
      importRow({
        cursorDate: new Date("2026-07-07T00:00:00.000Z"),
        earliestTargetDate: new Date("2025-03-07T00:00:00.000Z"),
        finalizedThroughDate: new Date("2026-07-07T00:00:00.000Z"),
        newestFinalizedDate: new Date("2026-07-07T00:00:00.000Z"),
        state: "running",
      }),
    );
    mocks.isUserPaused
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    await expect(runBackfillBatch(input)).resolves.toMatchObject({ daysProcessed: 1 });
    expect(mocks.syncCompleteDay).toHaveBeenCalledTimes(1);
  });

  it("issues no request when the durable row is already user-paused", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow({ pausedReason: "user", state: "paused" }));
    await expect(runBackfillBatch(input)).resolves.toMatchObject({ blocked: true });
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(mocks.syncCompleteDay).not.toHaveBeenCalled();
  });

  it("does nothing for an import that is already complete", async () => {
    mocks.loadImportRow.mockResolvedValue(importRow({ state: "completed" }));

    await expect(runBackfillBatch(input)).resolves.toMatchObject({
      blocked: false,
      daysProcessed: 0,
      done: true,
      nextCursor: null,
    });
    expect(mocks.readConnection).not.toHaveBeenCalled();
  });
});
