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

function description(input: {
  missed?: number;
  next?: Date[];
  paused?: boolean;
  recent?: Date[];
  skipped?: number;
}) {
  return {
    state: { paused: input.paused ?? false },
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
  it("ignores paused advertised times without dropping lifetime counters or recent history", async () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const { client } = scheduleClient({
      paused: description({
        missed: 2,
        next: [new Date("2026-07-29T12:00:00.000Z")],
        paused: true,
        recent: [new Date("2026-09-09T11:00:00.000Z")],
        skipped: 3,
      }),
      active: description({ next: [new Date("2026-09-09T12:01:00.000Z")] }),
    });
    await expect(collectTemporalHeartbeat(now, client)).resolves.toMatchObject({
      missedCatchupTotal: 2,
      nextActionAt: "2026-09-09T12:01:00.000Z",
      recentActions: 1,
      schedules: 2,
      skippedOverlapTotal: 3,
    });
  });

  it.each([
    { next: [new Date("2026-09-09T11:00:00.000Z")] },
    { next: [new Date("2026-09-09T12:00:00.000Z")] },
    { next: [new Date("2026-09-09T13:00:00.000Z")], paused: true },
    { next: [] },
    { next: [new Date("invalid")] },
  ])("returns no next action without a valid unpaused future time: %o", async (input) => {
    const { client } = scheduleClient({ schedule: description(input) });
    await expect(
      collectTemporalHeartbeat(new Date("2026-09-09T12:00:00.000Z"), client),
    ).resolves.toMatchObject({ inspectionErrors: 0, nextActionAt: null });
  });

  it("selects the earliest valid future time from mixed active schedule times", async () => {
    const { client } = scheduleClient({
      schedule: description({
        next: [
          new Date("invalid"),
          new Date("2026-09-09T11:00:00.000Z"),
          new Date("2026-09-09T13:00:00.000Z"),
          new Date("2026-09-09T12:01:00.000Z"),
        ],
      }),
    });
    await expect(
      collectTemporalHeartbeat(new Date("2026-09-09T12:00:00.000Z"), client),
    ).resolves.toMatchObject({ nextActionAt: "2026-09-09T12:01:00.000Z" });
  });

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
