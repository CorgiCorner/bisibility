import { resolveSearchSyncControl } from "@/lib/search-insights/sync/control-model";
import { loadSearchSyncMetrics } from "@/lib/settings/search-sync-metrics";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  compareIdentity: vi.fn(),
  count: vi.fn(),
  deploymentConfig: vi.fn(),
  findUnique: vi.fn(),
  liveness: vi.fn(),
  observability: vi.fn(),
  queue: vi.fn(),
  workflow: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    searchAnalyticsImport: { findUnique: mocks.findUnique },
    searchAnalyticsRequestUsage: { count: mocks.count },
  },
}));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/ops/worker-temporal-identity", () => ({
  compareWorkerTemporalIdentity: mocks.compareIdentity,
}));
vi.mock("@/lib/queries/_auth", () => ({ requireReadableProject: vi.fn() }));
vi.mock("@/lib/search-insights/queries/import-observability-db", () => ({
  readImportObservability: mocks.observability,
}));
vi.mock("@/lib/search-insights/queries/import-queue", () => ({
  readSearchImportQueueFacts: mocks.queue,
}));
vi.mock("@/lib/temporal/deployment-config", () => ({
  temporalDeploymentConfig: mocks.deploymentConfig,
}));
vi.mock("@/lib/temporal/search-insights-status", () => ({
  describeSearchInsightsBackfillStatus: mocks.workflow,
}));

const settings = { pace: "normal" as const, retentionMonths: 16 as const };
const property = "sc-domain:example.com";
const facts = {
  consecutiveDays: 7,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: "2026-08-28T15:50:00.000Z",
  lastProbeAt: "2026-08-28T15:55:00.000Z",
  qualifyingDays: 7,
  readyThrough: {
    d7: { current: true, previous: true },
    d28: { current: false, previous: false },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 30 * 60_000,
    expectedDayMs: 3 * 60_000,
    nextRequestInMs: 10 * 60_000,
    silenceMs: 5 * 60_000,
    thresholdMs: 45 * 60_000,
  },
  targetDays: 28,
} as const;
const row = {
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  daysDone: 7,
  daysTotal: 488,
  earliestTargetDate: new Date("2025-03-01T00:00:00.000Z"),
  id: "imp_1",
  lastError: null,
  lastProbeAt: new Date("2026-08-28T15:55:00.000Z"),
  lastQuotaPausedAt: null,
  newestFinalizedDate: new Date("2026-08-28T00:00:00.000Z"),
  pauseStartedAt: null,
  pausedReason: null,
  state: "running",
  updatedAt: new Date("2026-08-28T15:50:00.000Z"),
};

describe("loadSearchSyncMetrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compareIdentity.mockReturnValue({ detail: "identities match", status: "match" });
    mocks.count.mockResolvedValue(3);
    mocks.deploymentConfig.mockReturnValue({
      alertDeliveryTaskQueue: "alert-deliveries",
      namespace: "default",
      taskQueue: "rank-checks",
    });
    mocks.findUnique.mockResolvedValue(row);
    mocks.liveness.mockResolvedValue({
      alertDeliveryTaskQueue: "alert-deliveries",
      namespace: "default",
      status: "ok",
      taskQueue: "rank-checks",
    });
    mocks.observability.mockResolvedValue(facts);
    mocks.queue.mockResolvedValue({});
    mocks.workflow.mockResolvedValue("running");
  });

  it("counts the request ledger inside the Pacific quota day", async () => {
    await expect(
      loadSearchSyncMetrics("prj_1", property, settings, new Date("2026-08-28T16:00:00Z")),
    ).resolves.toMatchObject({ requestsToday: 3 });
    expect(mocks.count).toHaveBeenCalledWith({
      where: {
        attemptedAt: {
          gte: new Date("2026-08-28T07:00:00Z"),
          lt: new Date("2026-08-29T07:00:00Z"),
        },
        projectId: "prj_1",
        property,
      },
    });
  });

  it("returns selector facts that resolve a healthy import to Running with Pause", async () => {
    const metrics = await loadSearchSyncMetrics("prj_1", property, settings);

    expect(mocks.observability).toHaveBeenCalledWith(
      expect.objectContaining({
        plannedRetentionMonths: 16,
        projectId: "prj_1",
        property,
        requestSetsPerHour: 42,
      }),
    );
    expect(mocks.queue).toHaveBeenCalledWith({
      createdAt: row.createdAt,
      id: "imp_1",
      projectId: "prj_1",
      state: "running",
    });
    expect(metrics).toMatchObject({
      observability: facts,
      queue: {},
      runtime: {
        workerStatus: { status: "ok", temporalIdentityComparison: { status: "match" } },
        workflowStatus: "running",
      },
    });
    expect(
      resolveSearchSyncControl({
        observability: metrics.observability,
        queue: metrics.queue,
        runtime: metrics.runtime,
        state: metrics.state,
      }),
    ).toMatchObject({ action: "pause", status: "Running" });
  });

  it("keeps a completed import complete when finalized coverage is available", async () => {
    mocks.findUnique.mockResolvedValue({ ...row, state: "completed" });
    mocks.observability.mockResolvedValue({
      ...facts,
      readyThrough: { ...facts.readyThrough, d28: { current: true, previous: true } },
    });
    mocks.workflow.mockResolvedValue("completed");

    const metrics = await loadSearchSyncMetrics("prj_1", property, settings);

    expect(
      resolveSearchSyncControl({
        observability: metrics.observability,
        queue: metrics.queue,
        runtime: metrics.runtime,
        state: metrics.state,
      }),
    ).toMatchObject({ action: null, status: "Complete" });
  });
});
