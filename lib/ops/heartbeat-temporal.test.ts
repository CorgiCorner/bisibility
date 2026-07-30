import { describe, expect, it, vi } from "vitest";
import { collectTemporalHeartbeat, type OpsScheduleClient } from "./heartbeat-temporal";

function scheduleClient(descriptions: Record<string, unknown | Error>) {
  const describe = vi.fn(async (scheduleId: string) => {
    const value = descriptions[scheduleId];
    if (value instanceof Error) throw value;
    return value;
  });
  return {
    client: {
      getHandle: vi.fn((scheduleId: string) => ({
        describe: () => describe(scheduleId),
      })),
      list: () =>
        (async function* () {
          for (const scheduleId of Object.keys(descriptions)) yield { scheduleId };
        })(),
    } as unknown as OpsScheduleClient,
    describe,
  };
}

function description(input: { missed?: number; next?: Date[]; recent?: Date[]; skipped?: number }) {
  return {
    info: {
      nextActionTimes: input.next ?? [],
      numActionsMissedCatchupWindow: input.missed ?? 0,
      numActionsSkippedOverlap: input.skipped ?? 0,
      recentActions: (input.recent ?? []).map((takenAt) => ({
        scheduledAt: new Date(takenAt.getTime() - 5 * 60_000),
        takenAt,
      })),
    },
  };
}

describe("Temporal heartbeat collection", () => {
  it("inspects every schedule and reports direct SDK counters", async () => {
    const now = new Date("2026-07-16T12:00:00.000Z");
    const { client, describe: describeMock } = scheduleClient({
      "rank-check-1": description({
        missed: 2,
        next: [new Date("2026-07-16T13:00:00.000Z")],
        recent: [new Date("2026-07-16T11:00:00.000Z"), new Date("2026-07-14T11:00:00.000Z")],
      }),
      "rank-check-2": description({
        next: [new Date("2026-07-16T12:30:00.000Z")],
        recent: [new Date("2026-07-16T10:00:00.000Z")],
        skipped: 3,
      }),
    });

    await expect(collectTemporalHeartbeat(now, client)).resolves.toMatchObject({
      inspectionErrors: 0,
      missedCatchupTotal: 2,
      nextActionAt: "2026-07-16T12:30:00.000Z",
      recentActions: 2,
      scheduleIssues: [
        {
          gapAt: "2026-07-16T10:55:00.000Z",
          missedCatchup: 2,
          recoveredAt: "2026-07-16T11:00:00.000Z",
          scheduleId: "rank-check-1",
          skippedOverlap: 0,
        },
        {
          gapAt: "2026-07-16T09:55:00.000Z",
          missedCatchup: 0,
          recoveredAt: "2026-07-16T10:00:00.000Z",
          scheduleId: "rank-check-2",
          skippedOverlap: 3,
        },
      ],
      schedules: 2,
      skippedOverlapTotal: 3,
    });
    expect(describeMock).toHaveBeenCalledTimes(2);
  });

  it("keeps scanning after an individual describe failure", async () => {
    const { client } = scheduleClient({
      broken: new Error("unavailable"),
      healthy: description({}),
    });

    await expect(collectTemporalHeartbeat(new Date(), client)).resolves.toMatchObject({
      inspectionErrors: 1,
      issueSchedules: ["broken: inspection failed"],
      schedules: 2,
    });
  });
});
