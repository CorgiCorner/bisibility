import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appRevision: vi.fn(),
  migrationReadiness: vi.fn(),
  liveness: vi.fn(),
  queryRaw: vi.fn(),
  temporalSnapshot: vi.fn(),
}));

vi.mock("@/lib/deployment/runtime-env.generated", () => ({
  getBakedAppRevision: mocks.appRevision,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/ops/temporal-snapshot", () => ({ getTemporalSnapshot: mocks.temporalSnapshot }));
vi.mock("@/lib/data-migrations/readiness", () => ({
  readMigrationReadiness: mocks.migrationReadiness,
}));

import { getHealth, getLiveness, getReadiness } from "./discovery";

async function result(response: Response | Promise<Response>) {
  const resolved = await response;
  return { body: await resolved.json(), status: resolved.status };
}

async function health() {
  const response = getHealth({ headers: new Headers() });
  return result(response);
}

async function liveness() {
  const response = getLiveness({ headers: new Headers() });
  return result(response);
}

async function readiness() {
  const response = getReadiness({ headers: new Headers() });
  return result(response);
}

describe("API health worker and Temporal liveness", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.appRevision.mockReturnValue("app-public-revision");
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
      revision: "worker-public-revision",
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
          appRevision: "app-public-revision",
          database: "ok",
          lastHeartbeatAt: "2026-07-21T10:08:44.000Z",
          migrations: "ready",
          temporal: "ok",
          worker: "ok",
          workerRelease: "worker-image-sha",
          workerRevision: "worker-public-revision",
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

  it("fails readiness when an active data migration is incomplete", async () => {
    mocks.migrationReadiness.mockResolvedValue("incomplete");

    await expect(readiness()).resolves.toMatchObject({
      body: {
        services: { database: "ok", migrations: "incomplete" },
        status: "degraded",
      },
      status: 503,
    });
  });

  it("fails readiness when active data migration state cannot be read", async () => {
    mocks.migrationReadiness.mockRejectedValue(new Error("migration table unavailable"));

    await expect(readiness()).resolves.toMatchObject({
      body: {
        services: { database: "degraded", migrations: "unknown" },
        status: "degraded",
      },
      status: 503,
    });
  });

  it("keeps liveness healthy when blocking data migrations are incomplete", async () => {
    mocks.migrationReadiness.mockResolvedValue("incomplete");

    await expect(liveness()).resolves.toMatchObject({
      body: {
        services: {
          app: "ok",
          appRelease: "app-build-sha",
          appRevision: "app-public-revision",
        },
        status: "ok",
      },
      status: 200,
    });
    expect(mocks.migrationReadiness).not.toHaveBeenCalled();
    expect(mocks.queryRaw).not.toHaveBeenCalled();
    expect(mocks.liveness).not.toHaveBeenCalled();
    expect(mocks.temporalSnapshot).not.toHaveBeenCalled();
  });

  it("keeps web readiness healthy when the worker and Temporal are down", async () => {
    mocks.liveness.mockResolvedValue({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "worker-production",
      lastSeenAt: "2026-07-21T09:53:43.999Z",
      release: "worker-image-sha",
      revision: "worker-public-revision",
      schedulerMode: "cutover",
      schemaComparison: "ok",
      status: "stale",
    });
    mocks.temporalSnapshot.mockResolvedValue({
      collectedAt: "2026-07-21T09:53:43.999Z",
      heartbeat: {},
      status: "stale",
    });

    await expect(readiness()).resolves.toMatchObject({
      body: {
        services: {
          database: "ok",
          migrations: "ready",
        },
        status: "ok",
      },
      status: 200,
    });
    expect(mocks.liveness).not.toHaveBeenCalled();
    expect(mocks.temporalSnapshot).not.toHaveBeenCalled();
  });

  it("reports unknown revisions when the build did not bake them", async () => {
    mocks.appRevision.mockReturnValue("unknown");
    mocks.liveness.mockResolvedValue({
      appliedMigration: null,
      bundledMigration: null,
      environment: "unknown",
      lastSeenAt: null,
      release: "unknown",
      revision: "unknown",
      schedulerMode: "unknown",
      schemaComparison: "unknown",
      status: "unknown",
    });

    await expect(health()).resolves.toMatchObject({
      body: {
        services: {
          appRevision: "unknown",
          workerRevision: "unknown",
        },
      },
    });
  });
});
