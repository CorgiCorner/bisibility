import { describe, expect, it, vi } from "vitest";
import { reconcilePlannedRunsForSchedule } from "./reconcile-schedule";

describe("planned schedule reconciliation", () => {
  it("deletes only planned runs whose cadence anchor changed", async () => {
    const database = {
      checkSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          cronExpression: null,
          enabled: true,
          frequency: "daily",
          jitterMinutes: 0,
          project: { defaults: { timezone: "UTC" } },
          publicId: "sch_a00000000000000000000000",
          timeOfDay: "06:00",
          timezone: null,
        }),
      },
      rankCheckRun: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "current",
            items: [],
            plannedFor: new Date("2026-09-03T06:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-03" },
            status: "planned",
          },
          {
            id: "membership_changed",
            items: [],
            plannedFor: new Date("2026-09-03T06:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-03" },
            status: "planned",
          },
          {
            id: "anchor_stale",
            items: [],
            plannedFor: new Date("2026-09-03T07:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-03" },
            status: "planned",
          },
        ]),
      },
    };

    await expect(reconcilePlannedRunsForSchedule("schedule_1", database as never)).resolves.toEqual(
      { deleted: 1 },
    );

    expect(database.rankCheckRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { checkScheduleId: "schedule_1", status: { in: ["blocked", "planned"] } },
      }),
    );
    expect(database.rankCheckRun.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["anchor_stale"] }, status: { in: ["blocked", "planned"] } },
    });
  });

  it("removes all remaining planned occurrences when a cadence is disabled", async () => {
    const database = {
      checkSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          cronExpression: null,
          enabled: false,
          frequency: "daily",
          jitterMinutes: 0,
          project: { defaults: { timezone: "UTC" } },
          publicId: "sch_a00000000000000000000000",
          timeOfDay: null,
          timezone: null,
        }),
      },
      rankCheckRun: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "planned_1",
            items: [],
            plannedFor: new Date("2026-09-03T00:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-03" },
            status: "planned",
          },
        ]),
      },
    };

    await reconcilePlannedRunsForSchedule("schedule_1", database as never);

    expect(database.rankCheckRun.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["planned_1"] }, status: { in: ["blocked", "planned"] } },
    });
  });

  it("removes all planned occurrences before deleting a schedule", async () => {
    const database = {
      checkSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          cronExpression: null,
          enabled: true,
          frequency: "daily",
          jitterMinutes: 0,
          project: { defaults: { timezone: "UTC" } },
          publicId: "sch_a00000000000000000000000",
          timeOfDay: null,
          timezone: null,
        }),
      },
      rankCheckRun: {
        deleteMany: vi.fn().mockResolvedValue({ count: 3 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "planned_1",
            items: [],
            plannedFor: new Date("2026-09-03T00:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-03" },
            status: "planned",
          },
          {
            id: "planned_2",
            items: [],
            plannedFor: new Date("2026-09-04T00:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-04" },
            status: "planned",
          },
          {
            id: "blocked_empty",
            items: [],
            plannedFor: new Date("2026-09-04T00:00:00.000Z"),
            selectionSpec: { occurrenceKey: "2026-09-04" },
            status: "blocked",
          },
        ]),
      },
    };

    await expect(
      reconcilePlannedRunsForSchedule("schedule_1", database as never, { deleting: true }),
    ).resolves.toEqual({ deleted: 3 });

    expect(database.rankCheckRun.deleteMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["planned_1", "planned_2", "blocked_empty"] },
        status: { in: ["blocked", "planned"] },
      },
    });
  });

  it("cleans an unmaterialized blocked run but preserves a blocked run with items", async () => {
    const database = {
      checkSchedule: {
        findUnique: vi.fn().mockResolvedValue({
          cronExpression: null,
          enabled: false,
          frequency: "daily",
          jitterMinutes: 0,
          project: { defaults: { timezone: "UTC" } },
          publicId: "sch_a00000000000000000000000",
          timeOfDay: "06:00",
          timezone: null,
        }),
      },
      rankCheckRun: {
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([
          {
            id: "blocked_empty",
            items: [],
            plannedFor: new Date(),
            selectionSpec: {},
            status: "blocked",
          },
          {
            id: "blocked_active",
            items: [{ id: "item_1" }],
            plannedFor: new Date(),
            selectionSpec: {},
            status: "blocked",
          },
        ]),
      },
    };

    await reconcilePlannedRunsForSchedule("schedule_1", database as never);

    expect(database.rankCheckRun.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ["blocked_empty"] }, status: { in: ["blocked", "planned"] } },
    });
  });
});
