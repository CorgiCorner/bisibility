import { beforeEach, describe, expect, it, vi } from "vitest";
import { readActiveSearchImportSnapshot } from "./operation-snapshot";

const mocks = vi.hoisted(() => ({
  decrypt: vi.fn(),
  defaults: vi.fn(),
  searchAnalyticsImport: { findUnique: vi.fn() },
  liveness: vi.fn(),
  observability: vi.fn(),
  providerConnection: { findUnique: vi.fn() },
  readCredentials: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks }));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/providers/crypto", () => ({ decryptProviderCredentials: mocks.decrypt }));
vi.mock("@/lib/providers/analytics/gsc-credentials", () => ({
  readGscCredentials: mocks.readCredentials,
}));
vi.mock("@/lib/queries/workspace-request-data", () => ({
  getRequestProjectDefaults: mocks.defaults,
}));
vi.mock("@/lib/search-insights/queries/import-observability-db", () => ({
  readImportObservability: mocks.observability,
}));
vi.mock("@/lib/settings/search-sync-config", () => ({
  resolveSearchSyncSettings: () => ({ pace: "normal", retentionMonths: 16 }),
}));
vi.mock("@/lib/search-insights/sync/plan", () => ({
  searchSyncRequestSetsPerHour: () => 60,
}));
vi.mock("@/lib/temporal/deployment-config", () => ({
  temporalDeploymentConfig: () => ({
    alertDeliveryTaskQueue: "alerts",
    namespace: "default",
    taskQueue: "rank-checks",
  }),
}));

const property = "sc-domain:b.example.com";
const importRow = {
  daysTotal: 488,
  earliestTargetDate: new Date("2025-05-01"),
  id: "import_b",
  lastError: null,
  lastProbeAt: new Date("2026-09-01"),
  newestFinalizedDate: new Date("2026-09-01"),
  pauseStartedAt: null,
  pausedReason: null,
  plannedRetentionMonths: 16,
  property,
  state: "running",
};
const observability = {
  importCoverage: { completed: 56, total: 488 },
  consecutiveDays: 28,
  deepHistoryMonths: { completed: 0, target: 16 },
  lastActivityAt: "2026-09-01T10:00:00.000Z",
  lastProbeAt: "2026-09-01T10:00:00.000Z",
  qualifyingDays: 28,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: true, previous: true },
    d90: { current: false, previous: false },
  },
  stall: {
    expectedBatchMs: 20 * 60_000,
    expectedDayMs: 3 * 60_000,
    nextRequestInMs: 0,
    silenceMs: 10 * 60_000,
    thresholdMs: 30 * 60_000,
  },
  targetDays: 28,
} as const;

describe("readActiveSearchImportSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted",
      enabled: true,
      status: "connected",
    });
    mocks.decrypt.mockReturnValue({ login: property });
    mocks.readCredentials.mockReturnValue({ property });
    mocks.searchAnalyticsImport.findUnique.mockResolvedValue(importRow);
    mocks.defaults.mockResolvedValue({});
    mocks.observability.mockResolvedValue(observability);
    mocks.liveness.mockResolvedValue({
      alertDeliveryTaskQueue: "alerts",
      status: "ok",
      taskQueue: "rank-checks",
      namespace: "default",
    });
  });

  it("projects active property B from qualifying coverage instead of archived A or raw counters", async () => {
    await expect(readActiveSearchImportSnapshot("project_1")).resolves.toMatchObject({
      capabilities: { pause: true, resume: false, retry: false },
      id: "import_b",
      presentation: { title: "Importing" },
      progress: { done: 56, total: 488 },
      property,
    });
    expect(mocks.searchAnalyticsImport.findUnique).toHaveBeenCalledWith({
      where: { projectId_property_source: { projectId: "project_1", property, source: "gsc" } },
    });
    expect(mocks.observability).toHaveBeenCalledOnce();
  });

  it("keeps unknown totals indeterminate without a 0/0 progress claim", async () => {
    mocks.observability.mockResolvedValue({
      ...observability,
      importCoverage: { completed: 56, total: 0 },
    });

    await expect(readActiveSearchImportSnapshot("project_1")).resolves.toMatchObject({
      progress: { done: 56, total: null },
    });
  });

  it("keeps a paused current import in the active tray with only resume capability", async () => {
    mocks.searchAnalyticsImport.findUnique.mockResolvedValue({
      ...importRow,
      pausedReason: "user",
      state: "paused",
    });

    await expect(readActiveSearchImportSnapshot("project_1")).resolves.toMatchObject({
      capabilities: { pause: false, resume: true, retry: false },
      presentation: { title: "Paused" },
    });
  });

  it("keeps reconnect as a navigation presentation without an import transition capability", async () => {
    mocks.providerConnection.findUnique.mockResolvedValue({
      credentialsEncrypted: "encrypted",
      enabled: true,
      status: "needs_reauth",
    });
    mocks.searchAnalyticsImport.findUnique.mockResolvedValue({
      ...importRow,
      pausedReason: "needs_reauth",
      state: "paused",
    });

    await expect(readActiveSearchImportSnapshot("project_1")).resolves.toMatchObject({
      capabilities: { pause: false, resume: false, retry: false },
      presentation: { action: "reconnect", title: "Reconnect required" },
      property,
    });
  });

  it("does not keep a terminal import in the active tray", async () => {
    mocks.searchAnalyticsImport.findUnique.mockResolvedValue({ ...importRow, state: "completed" });

    await expect(readActiveSearchImportSnapshot("project_1")).resolves.toBeNull();
    expect(mocks.observability).not.toHaveBeenCalled();
  });
});
