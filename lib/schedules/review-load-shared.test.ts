import { describe, expect, it, vi } from "vitest";
import { nearTermCostIncreased, reviewOccurrences } from "./review-cost";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

const { asCadence } = await import("./review-load-shared");

const now = new Date("2026-11-17T12:00:00.000Z");
const row = {
  archivedAt: null,
  cronExpression: null as string | null,
  enabled: true,
  jitterMinutes: 60,
  publicId: "sch_a00000000000000000000000",
  serpDepth: 20,
  timeOfDay: null,
  timezone: "UTC",
};

describe("asCadence prices what the planner runs", () => {
  it.each(["weekly", "monthly"] as const)(
    "prices a %s schedule with a stored cron by that cron",
    (frequency) => {
      expect(asCadence({ ...row, frequency, cronExpression: "0 6 * * 1" }, "UTC")).toMatchObject({
        cronExpression: "0 6 * * 1",
        frequency: "custom_cron",
      });
    },
  );

  it("prices a weekly schedule without a cron as weekly and drops a stale daily cron", () => {
    expect(asCadence({ ...row, frequency: "weekly" }, "UTC")).toMatchObject({
      cronExpression: null,
      frequency: "weekly",
    });
    expect(
      asCadence({ ...row, frequency: "daily", cronExpression: "0 6 * * 1" }, "UTC"),
    ).toMatchObject({ cronExpression: null, frequency: "daily" });
  });

  it("keeps the stored cron when a weekly update supplies none, as the schedule store does", () => {
    expect(
      asCadence({ ...row, frequency: "monthly", cronExpression: "0 6 * * *" }, "UTC", {
        frequency: "weekly",
      }),
    ).toMatchObject({ cronExpression: "0 6 * * *", frequency: "custom_cron" });
  });

  it("prices a weekly schedule with a daily cron as daily, so the increase needs review", () => {
    const before = asCadence({ ...row, frequency: "weekly" }, "UTC");
    const after = asCadence({ ...row, frequency: "weekly", cronExpression: "0 6 * * *" }, "UTC");
    expect(reviewOccurrences(after, now)).toBeCloseTo(30, 0);
    expect(reviewOccurrences(before, now)).toBeCloseTo(30 / 7, 5);
    expect(
      nearTermCostIncreased(
        { cadence: before, perRunCents: 1 },
        { cadence: after, perRunCents: 1 },
        now,
      ),
    ).toBe(true);
  });
});
