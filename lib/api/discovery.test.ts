import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  migrationReadiness: vi.fn(),
  liveness: vi.fn(),
  queryRaw: vi.fn(),
  temporalSnapshot: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/ops/temporal-snapshot", () => ({ getTemporalSnapshot: mocks.temporalSnapshot }));
vi.mock("@/lib/data-migrations/readiness", () => ({
  readMigrationReadiness: mocks.migrationReadiness,
}));

import { getHealth } from "./discovery";

async function health() {
  const response = await getHealth({ headers: new Headers() });
  return { body: await response.json(), status: response.status };
}

describe("API health worker and Temporal liveness", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    vi.stubEnv("APP_VERSION", "app-build-sha");
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    mocks.migrationReadiness.mockResolvedValue("ready");
    mocks.queryRaw.mockResolvedValue([{ one: 1 }]);
    mocks.liveness.mockResolvedValue({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "worker-production",
      lastSeenAt: "2026-07-21T10:08:44.000Z",
      release: "worker-image-sha",
      schedulerMode: "cutover",
      schemaComparison: "ok",
      status: "ok",
    });
    mocks.temporalSnapshot.mockResolvedValue({
      collectedAt: "2026-07-21T10:08:44.000Z",
      heartbeat: {},
      status: "ok",
    });
  });

  it("reports fresh worker and Temporal heartbeats as healthy", async () => {
    await expect(health()).resolves.toMatchObject({
      body: {
        services: {
          app: "ok",
          appRankCheckSchedulerMode: "cutover",
          appRelease: "app-build-sha",
          database: "ok",
          lastHeartbeatAt: "2026-07-21T10:08:44.000Z",
          migrations: "ready",
          temporal: "ok",
          worker: "ok",
          workerRelease: "worker-image-sha",
          workerRankCheckSchedulerMode: "cutover",
          workerSchema: "ok",
        },
        status: "ok",
      },
      status: 200,
    });
  });

  it("reports stale persisted heartbeats as down", async () => {
    mocks.liveness.mockResolvedValue({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "worker-production",
      lastSeenAt: "2026-07-21T09:53:43.999Z",
      release: "worker-image-sha",
      schedulerMode: "cutover",
      schemaComparison: "ok",
      status: "stale",
    });
    mocks.temporalSnapshot.mockResolvedValue({
      collectedAt: "2026-07-21T09:53:43.999Z",
      heartbeat: {},
      status: "stale",
    });

    await expect(health()).resolves.toMatchObject({
      body: {
        services: {
          lastHeartbeatAt: "2026-07-21T09:53:43.999Z",
          temporal: "down",
          worker: "down",
        },
        status: "degraded",
      },
      status: 503,
    });
  });

  it("keeps worker-less deployments healthy when no liveness signal was ever recorded", async () => {
    mocks.liveness.mockResolvedValue({
      appliedMigration: null,
      bundledMigration: null,
      environment: "unknown",
      lastSeenAt: null,
      release: "unknown",
      schedulerMode: "unknown",
      schemaComparison: "unknown",
      status: "unknown",
    });
    mocks.temporalSnapshot.mockResolvedValue(null);

    await expect(health()).resolves.toMatchObject({
      body: {
        services: {
          lastHeartbeatAt: null,
          temporal: "unknown",
          worker: "unknown",
          workerRelease: "unknown",
          workerRankCheckSchedulerMode: "unknown",
          workerSchema: "unknown",
        },
        status: "ok",
      },
      status: 200,
    });
  });

  it("degrades health when the reported worker schema has drifted", async () => {
    mocks.liveness.mockResolvedValue({
      appliedMigration: "20260725010000_newer_database",
      bundledMigration: "20260724220000_worker_bundle",
      environment: "worker-production",
      lastSeenAt: "2026-07-21T10:08:44.000Z",
      release: "worker-image-sha",
      schedulerMode: "cutover",
      schemaComparison: "worker-behind",
      status: "ok",
    });

    await expect(health()).resolves.toMatchObject({
      body: {
        services: {
          worker: "ok",
          workerRelease: "worker-image-sha",
          workerSchema: "drift",
        },
        status: "degraded",
      },
      status: 503,
    });
  });

  it("preserves database degradation while reporting worker state", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("database unavailable"));
    await expect(health()).resolves.toMatchObject({
      body: {
        services: { database: "degraded", temporal: "ok", worker: "ok" },
        status: "degraded",
      },
      status: 503,
    });
  });

  it("fails readiness when a blocking data migration is incomplete", async () => {
    mocks.migrationReadiness.mockResolvedValue("incomplete");

    await expect(health()).resolves.toMatchObject({
      body: {
        services: { database: "ok", migrations: "incomplete" },
        status: "degraded",
      },
      status: 503,
    });
  });

  it("fails readiness when blocking data migration state cannot be read", async () => {
    mocks.migrationReadiness.mockRejectedValue(new Error("migration table unavailable"));

    await expect(health()).resolves.toMatchObject({
      body: {
        services: { database: "degraded", migrations: "unknown" },
        status: "degraded",
      },
      status: 503,
    });
  });
});
