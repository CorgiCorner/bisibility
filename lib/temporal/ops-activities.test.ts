import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildHeartbeatEvent: vi.fn(() => ({
    fields: {},
    kind: "heartbeat",
    severity: "info",
    title: "worker alive",
  })),
  collectDatabaseHeartbeat: vi.fn(),
  collectTemporalHeartbeat: vi.fn(),
  config: vi.fn(),
  drain: vi.fn(),
  notify: vi.fn(),
  readCounters: vi.fn(),
  prune: vi.fn(),
  refresh: vi.fn(),
  sweep: vi.fn(),
  writeCounters: vi.fn(),
}));

vi.mock("@/lib/ops/config", () => ({ getOpsConfig: mocks.config }));
vi.mock("@/lib/ops/heartbeat-counter-state", () => ({
  readTemporalDigestCounters: mocks.readCounters,
  writeTemporalDigestCounters: mocks.writeCounters,
}));
vi.mock("@/lib/ops/heartbeat-data", () => ({
  collectDatabaseHeartbeat: mocks.collectDatabaseHeartbeat,
  pruneOperationalObservability: mocks.prune,
}));
vi.mock("@/lib/ops/heartbeat-format", () => ({
  buildHeartbeatEvent: mocks.buildHeartbeatEvent,
}));
vi.mock("@/lib/ops/heartbeat-temporal", () => ({
  collectTemporalHeartbeat: mocks.collectTemporalHeartbeat,
}));
vi.mock("@/lib/ops/liveness", () => ({ refreshWorkerLiveness: mocks.refresh }));
vi.mock("@/lib/ops/notify", () => ({
  drainOpsThrottleCounters: mocks.drain,
  notifyOps: mocks.notify,
}));
vi.mock("@/lib/ops/slack", () => ({ redactOpsText: String }));
vi.mock("@/lib/ops/sweep", () => ({ sweepUndeliveredOpsEvents: mocks.sweep }));

import { opsHeartbeatActivity } from "./ops-activities";

describe("ops heartbeat activity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.config.mockReturnValue({ enabled: true });
    mocks.refresh.mockResolvedValue(undefined);
    mocks.sweep.mockResolvedValue({ attempted: 2, delivered: 1 });
    mocks.collectDatabaseHeartbeat.mockResolvedValue({ rank: {}, traffic: [] });
    mocks.collectTemporalHeartbeat.mockResolvedValue({ schedules: 2 });
    mocks.drain.mockResolvedValue({ "rank:one": 3 });
    mocks.notify.mockResolvedValue(undefined);
    mocks.readCounters.mockResolvedValue({
      status: "available",
      totals: { missedCatchup: 4, skippedOverlap: 2 },
    });
    mocks.prune.mockResolvedValue({ events: 4, runs: 5 });
    mocks.writeCounters.mockResolvedValue(true);
  });

  it("is silent and zero-cost while operator events are disabled", async () => {
    mocks.config.mockReturnValue({ enabled: false });

    await expect(opsHeartbeatActivity()).resolves.toMatchObject({ status: "disabled" });
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(mocks.sweep).not.toHaveBeenCalled();
    expect(mocks.notify).not.toHaveBeenCalled();
  });

  it("sweeps first, collects the digest, posts it, and prunes retention", async () => {
    await expect(opsHeartbeatActivity()).resolves.toEqual({
      prunedEvents: 4,
      prunedRuns: 5,
      status: "completed",
      sweepAttempted: 2,
      sweepDelivered: 1,
    });
    expect(mocks.sweep.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.collectDatabaseHeartbeat.mock.invocationCallOrder[0],
    );
    expect(mocks.buildHeartbeatEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        schedulesEnabled: { "maintenance-traffic-sync": false },
        suppressed: { "rank:one": 3 },
        sweep: { attempted: 2, delivered: 1 },
        temporalCounterState: {
          status: "available",
          totals: { missedCatchup: 4, skippedOverlap: 2 },
        },
        workerStartedAt: expect.any(Date),
      }),
    );
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ kind: "heartbeat" }));
    expect(mocks.writeCounters).toHaveBeenCalledWith({ schedules: 2 });
  });

  it("still posts a degraded digest when collectors fail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.collectDatabaseHeartbeat.mockRejectedValue(new Error("database unavailable"));
    mocks.collectTemporalHeartbeat.mockRejectedValue(new Error("Temporal unavailable"));
    mocks.drain.mockRejectedValue(new Error("Redis unavailable"));

    await expect(opsHeartbeatActivity()).resolves.toMatchObject({ status: "completed" });
    expect(mocks.buildHeartbeatEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        database: expect.objectContaining({
          bootstrapErrors: ["Database heartbeat collection failed."],
        }),
        temporal: expect.objectContaining({ inspectionErrors: 1 }),
      }),
    );
    expect(mocks.notify).toHaveBeenCalledOnce();
    expect(mocks.writeCounters).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
