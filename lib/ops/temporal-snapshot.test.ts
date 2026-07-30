import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getRedisClient: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/redis/redis", () => ({ getRedisClient: mocks.getRedisClient }));

import type { TemporalHeartbeat } from "./heartbeat-temporal";
import { WORKER_STALE_AFTER_MS } from "./liveness";
import {
  getTemporalSnapshot,
  publishTemporalSnapshot,
  TEMPORAL_SNAPSHOT_KEY,
} from "./temporal-snapshot";

const now = new Date("2026-07-17T12:00:00.000Z");
const heartbeat: TemporalHeartbeat = {
  inspectionErrors: 0,
  issueSchedules: ["rank-check-kw_123: catchup 1, overlap 0"],
  missedCatchupTotal: 1,
  nextActionAt: "2026-07-17T12:30:00.000Z",
  recentActions: 3,
  scheduleIssues: [
    {
      gapAt: "2026-07-17T11:50:00.000Z",
      missedCatchup: 1,
      recoveredAt: "2026-07-17T11:55:00.000Z",
      scheduleId: "rank-check-kw_123",
      skippedOverlap: 0,
    },
  ],
  schedules: 8,
  skippedOverlapTotal: 0,
};

describe("Temporal snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRedisClient.mockResolvedValue({ get: mocks.get, set: mocks.set });
  });

  it("writes and reads the count-only heartbeat payload", async () => {
    const inspect = vi.fn().mockResolvedValue({ ...heartbeat, privatePayload: "must-not-persist" });
    await expect(publishTemporalSnapshot(now, inspect)).resolves.toBe(true);

    expect(mocks.set).toHaveBeenCalledOnce();
    const [key, raw] = mocks.set.mock.calls[0] as [string, string];
    expect(key).toBe(TEMPORAL_SNAPSHOT_KEY);
    expect(JSON.parse(raw)).toEqual({ collectedAt: now.toISOString(), heartbeat });

    mocks.get.mockResolvedValue(raw);
    await expect(getTemporalSnapshot(now)).resolves.toEqual({
      collectedAt: now.toISOString(),
      heartbeat,
      status: "ok",
    });
  });

  it("marks a snapshot stale after three refresh intervals", async () => {
    mocks.get.mockResolvedValue(
      JSON.stringify({
        collectedAt: new Date(now.getTime() - WORKER_STALE_AFTER_MS - 1).toISOString(),
        heartbeat,
      }),
    );

    await expect(getTemporalSnapshot(now)).resolves.toMatchObject({ status: "stale" });
  });

  it("returns null for absent or invalid snapshot state", async () => {
    mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce("not-json");

    await expect(getTemporalSnapshot(now)).resolves.toBeNull();
    await expect(getTemporalSnapshot(now)).resolves.toBeNull();
  });

  it("preserves the previous snapshot when inspection fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const inspect = vi.fn().mockRejectedValue(new Error("Temporal unavailable"));

    await expect(publishTemporalSnapshot(now, inspect)).resolves.toBe(false);
    expect(mocks.set).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith("[ops] Temporal snapshot refresh failed");
    consoleError.mockRestore();
  });
});
