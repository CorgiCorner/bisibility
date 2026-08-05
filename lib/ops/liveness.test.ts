import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appliedMigrationSummary: vi.fn(),
  bundledMigrationSummary: vi.fn(),
  get: vi.fn(),
  getRedisClient: vi.fn(),
  revision: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/deployment/runtime-env.generated", () => ({
  getBakedAppRevision: mocks.revision,
}));
vi.mock("@/lib/db/migration-state", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/migration-state")>()),
  appliedMigrationSummary: mocks.appliedMigrationSummary,
  bundledMigrationSummary: mocks.bundledMigrationSummary,
}));
vi.mock("@/lib/redis/redis", () => ({ getRedisClient: mocks.getRedisClient }));

import {
  getWorkerLiveness,
  getWorkerLivenessDetails,
  refreshWorkerLiveness,
  WORKER_LAST_SEEN_KEY,
  WORKER_LIVENESS_REFRESH_MS,
  WORKER_STALE_AFTER_MS,
} from "./liveness";

describe("worker liveness", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.revision.mockReturnValue("unknown");
    mocks.appliedMigrationSummary.mockResolvedValue({
      count: 2,
      latest: "20260724220000_instance_settings",
    });
    mocks.bundledMigrationSummary.mockReturnValue({
      count: 2,
      latest: "20260724220000_instance_settings",
    });
    mocks.getRedisClient.mockResolvedValue({ get: mocks.get, set: mocks.set });
  });

  it("keeps liveness independent from Slack configuration", async () => {
    mocks.get.mockResolvedValue("2026-07-16T08:00:00.000Z");

    await refreshWorkerLiveness(new Date("2026-07-16T08:00:00.000Z"));

    expect(mocks.getRedisClient).toHaveBeenCalled();
    await expect(getWorkerLivenessDetails(new Date("2026-07-16T08:10:00.000Z"))).resolves.toEqual({
      appliedMigration: null,
      bundledMigration: null,
      environment: "unknown",
      heartbeatAgeMs: 600_000,
      heartbeatState: "fresh",
      lastSeenAt: "2026-07-16T08:00:00.000Z",
      release: "unknown",
      revision: "unknown",
      schedulerDriver: "unknown",
      schedulerMode: "unknown",
      schemaComparison: "unknown",
      status: "ok",
    });
  });

  it("round-trips the worker identity and migration state", async () => {
    const now = new Date("2026-07-16T08:00:00.000Z");
    let stored: string | null = null;
    mocks.revision.mockReturnValue("worker-public-revision");
    vi.stubEnv("APP_VERSION", "worker-sha");
    vi.stubEnv("DEPLOYMENT_ENV", "production");
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "cutover");
    vi.stubEnv("SCHEDULER_DRIVER", "temporal");
    mocks.set.mockImplementation(async (_key, value) => {
      stored = value;
    });
    mocks.get.mockImplementation(async () => stored);

    await refreshWorkerLiveness(now);

    expect(mocks.set).toHaveBeenCalledWith(WORKER_LAST_SEEN_KEY, expect.any(String));
    expect(JSON.parse(mocks.set.mock.calls[0]?.[1] as string)).toEqual({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "production",
      lastSeenAt: now.toISOString(),
      release: "worker-sha",
      revision: "worker-public-revision",
      schedulerDriver: "temporal",
      schedulerMode: "cutover",
      schemaComparison: "ok",
    });
    await expect(getWorkerLivenessDetails(new Date("2026-07-16T08:10:00.000Z"))).resolves.toEqual({
      appliedMigration: "20260724220000_instance_settings",
      bundledMigration: "20260724220000_instance_settings",
      environment: "production",
      heartbeatAgeMs: 600_000,
      heartbeatState: "fresh",
      lastSeenAt: now.toISOString(),
      release: "worker-sha",
      revision: "worker-public-revision",
      schedulerDriver: "temporal",
      schedulerMode: "cutover",
      schemaComparison: "ok",
      status: "ok",
    });
  });

  it("parses older structured records without migration fields", async () => {
    mocks.get.mockResolvedValue(
      JSON.stringify({
        environment: "worker-production",
        lastSeenAt: "2026-07-16T08:00:00.000Z",
        release: "worker-image-sha",
      }),
    );

    await expect(getWorkerLivenessDetails(new Date("2026-07-16T08:10:00.000Z"))).resolves.toEqual({
      appliedMigration: null,
      bundledMigration: null,
      environment: "worker-production",
      heartbeatAgeMs: 600_000,
      heartbeatState: "fresh",
      lastSeenAt: "2026-07-16T08:00:00.000Z",
      release: "worker-image-sha",
      revision: "unknown",
      schedulerDriver: "unknown",
      schedulerMode: "unknown",
      schemaComparison: "unknown",
      status: "ok",
    });
  });

  it("reports a worker seen 10 minutes ago as ok", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    mocks.get.mockResolvedValue("2026-07-16T11:50:00.000Z");

    await expect(getWorkerLiveness(now)).resolves.toBe("ok");
  });

  it("reports a worker seen 20 minutes ago as stale", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    mocks.get.mockResolvedValue("2026-07-16T11:40:00.000Z");

    await expect(getWorkerLiveness(now)).resolves.toBe("stale");
  });

  it("rejects a future-dated worker heartbeat", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    mocks.get.mockResolvedValue("2026-07-16T12:00:00.001Z");

    await expect(getWorkerLiveness(now)).resolves.toBe("unknown");
    await expect(getWorkerLivenessDetails(now)).resolves.toMatchObject({
      heartbeatAgeMs: -1,
      heartbeatState: "future",
      status: "unknown",
    });
  });

  it("distinguishes absent and invalid worker heartbeat evidence", async () => {
    mocks.get.mockResolvedValueOnce(null);
    await expect(getWorkerLivenessDetails()).resolves.toMatchObject({
      heartbeatState: "absent",
      status: "unknown",
    });

    mocks.get.mockResolvedValueOnce("not-a-timestamp");
    await expect(getWorkerLivenessDetails()).resolves.toMatchObject({
      heartbeatState: "invalid",
      status: "unknown",
    });
  });

  it("accepts exactly-now and exact freshness-boundary heartbeats", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    mocks.get.mockResolvedValueOnce(now.toISOString());
    await expect(getWorkerLiveness(now)).resolves.toBe("ok");

    mocks.get.mockResolvedValueOnce(new Date(now.getTime() - WORKER_STALE_AFTER_MS).toISOString());
    await expect(getWorkerLiveness(now)).resolves.toBe("ok");
  });

  it("keeps the stale threshold tied to three refresh intervals", () => {
    expect(WORKER_STALE_AFTER_MS).toBe(3 * WORKER_LIVENESS_REFRESH_MS);
  });

  it("returns unknown instead of failing health when Redis is unavailable", async () => {
    mocks.getRedisClient.mockRejectedValue(new Error("unavailable"));

    await expect(getWorkerLiveness()).resolves.toBe("unknown");
  });
});
