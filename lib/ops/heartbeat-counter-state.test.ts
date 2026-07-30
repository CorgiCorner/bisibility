import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  getRedisClient: vi.fn(),
  set: vi.fn(),
}));

vi.mock("@/lib/redis/redis", () => ({ getRedisClient: mocks.getRedisClient }));

import {
  readTemporalDigestCounters,
  TEMPORAL_DIGEST_COUNTER_KEY,
  writeTemporalDigestCounters,
} from "./heartbeat-counter-state";
import type { TemporalHeartbeat } from "./heartbeat-temporal";

const heartbeat = {
  inspectionErrors: 0,
  issueSchedules: [],
  missedCatchupTotal: 3,
  nextActionAt: null,
  recentActions: 0,
  scheduleIssues: [],
  schedules: 1,
  skippedOverlapTotal: 2,
} satisfies TemporalHeartbeat;

describe("Temporal digest counter state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getRedisClient.mockResolvedValue({ get: mocks.get, set: mocks.set });
  });

  it("persists totals plus a per-schedule snapshot and restores both", async () => {
    await expect(writeTemporalDigestCounters(heartbeat)).resolves.toBe(true);
    expect(mocks.set).toHaveBeenCalledWith(
      TEMPORAL_DIGEST_COUNTER_KEY,
      JSON.stringify({ missedCatchup: 3, skippedOverlap: 2, perSchedule: {} }),
    );

    mocks.get.mockResolvedValue(
      JSON.stringify({
        missedCatchup: 3,
        skippedOverlap: 2,
        perSchedule: { "rank-check-1": { missedCatchup: 3, skippedOverlap: 2 } },
      }),
    );
    await expect(readTemporalDigestCounters()).resolves.toEqual({
      status: "available",
      perSchedule: { "rank-check-1": { missedCatchup: 3, skippedOverlap: 2 } },
      totals: { missedCatchup: 3, skippedOverlap: 2 },
    });
  });

  it("captures per-schedule counters from the heartbeat schedule issues", async () => {
    await writeTemporalDigestCounters({
      ...heartbeat,
      scheduleIssues: [
        {
          gapAt: null,
          missedCatchup: 276,
          recoveredAt: null,
          scheduleId: "rank-check-reconciler",
          skippedOverlap: 0,
        },
        {
          gapAt: null,
          missedCatchup: 91,
          recoveredAt: null,
          scheduleId: "maintenance-stale-checks",
          skippedOverlap: 4,
        },
      ],
    });
    expect(mocks.set).toHaveBeenCalledWith(
      TEMPORAL_DIGEST_COUNTER_KEY,
      JSON.stringify({
        missedCatchup: 3,
        skippedOverlap: 2,
        perSchedule: {
          "rank-check-reconciler": { missedCatchup: 276, skippedOverlap: 0 },
          "maintenance-stale-checks": { missedCatchup: 91, skippedOverlap: 4 },
        },
      }),
    );
  });

  it("reads legacy totals-only state as available without a per-schedule snapshot", async () => {
    mocks.get.mockResolvedValue(JSON.stringify({ missedCatchup: 5, skippedOverlap: 1 }));
    await expect(readTemporalDigestCounters()).resolves.toEqual({
      status: "available",
      totals: { missedCatchup: 5, skippedOverlap: 1 },
    });
  });

  it("distinguishes a missing baseline from an unavailable counter store", async () => {
    mocks.get.mockResolvedValueOnce(null).mockResolvedValueOnce("not-json");
    await expect(readTemporalDigestCounters()).resolves.toEqual({ status: "missing" });
    await expect(readTemporalDigestCounters()).resolves.toEqual({ status: "unavailable" });

    mocks.getRedisClient.mockRejectedValueOnce(new Error("unavailable"));
    await expect(readTemporalDigestCounters()).resolves.toEqual({ status: "unavailable" });
  });
});
