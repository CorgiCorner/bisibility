import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appRevision: vi.fn(),
  liveness: vi.fn(),
  migrationReadiness: vi.fn(),
  queryRaw: vi.fn(),
  temporalSnapshot: vi.fn(),
}));

vi.mock("@/lib/data-migrations/readiness", () => ({
  readMigrationReadiness: mocks.migrationReadiness,
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));
vi.mock("@/lib/deployment/runtime-env.generated", () => ({
  getBakedAppRevision: mocks.appRevision,
}));
vi.mock("@/lib/ops/liveness", () => ({ getWorkerLivenessDetails: mocks.liveness }));
vi.mock("@/lib/ops/temporal-snapshot", () => ({ getTemporalSnapshot: mocks.temporalSnapshot }));

import { getHealth } from "./discovery";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RANK_CHECK_RECONCILER_ENABLED", "false");
  vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "legacy");
  vi.stubEnv("SCHEDULED_MAINTENANCE_ENABLED", "");
  vi.stubEnv("SCHEDULER_DRIVER", "worker");
  mocks.appRevision.mockReturnValue("app-public-revision");
  mocks.liveness.mockResolvedValue({
    appliedMigration: "20260724220000_instance_settings",
    bundledMigration: "20260724220000_instance_settings",
    environment: "worker-production",
    lastSeenAt: "2026-07-21T10:08:44.000Z",
    release: "worker-image-sha",
    revision: "worker-public-revision",
    schedulerDriver: "temporal",
    schedulerMode: "legacy",
    schemaComparison: "ok",
    status: "ok",
  });
  mocks.migrationReadiness.mockResolvedValue("ready");
  mocks.queryRaw.mockResolvedValue([{ one: 1 }]);
  mocks.temporalSnapshot.mockResolvedValue({
    collectedAt: "2026-07-21T10:08:44.000Z",
    heartbeat: {},
    status: "ok",
  });
});

afterEach(() => vi.unstubAllEnvs());

it("does not infer worker maintenance health from the app environment", async () => {
  const response = await getHealth({ headers: new Headers() }, true);

  await expect(response.json()).resolves.toMatchObject({
    services: {
      schedulerConfiguration: "ok",
      worker: "ok",
    },
    status: "ok",
  });
  expect(response.status).toBe(200);
});
