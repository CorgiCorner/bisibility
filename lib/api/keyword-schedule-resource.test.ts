import { keywordMembershipSchedule } from "@/lib/keywords/schedule-membership";
import { expect, it } from "vitest";
import { keywordScheduleResource } from "./keyword-schedule-resource";

const now = new Date("2026-10-08T00:00:00Z");
const membership = {
  publicId: "sch_a00000000000000000000000",
  enabled: true,
  archivedAt: null as Date | null,
  frequency: "daily" as const,
  timezone: "UTC",
};

it.each([
  [null, null],
  [membership, "active"],
  [{ ...membership, enabled: false }, "paused"],
  [{ ...membership, frequency: "manual" as const }, "paused"],
  [{ ...membership, frequency: "paused" as const }, "paused"],
  [{ ...membership, archivedAt: now }, "archived"],
])("adds nullable public membership and state without changing cadence", (row, state) => {
  const schedule = keywordMembershipSchedule(row, "keyword", "UTC", now);
  expect(keywordScheduleResource(schedule, row, null)).toMatchObject({
    schedule_id: row?.publicId ?? null,
    schedule_state: state,
    frequency: schedule.frequency,
    next_check_at: schedule.nextCheckAt?.toISOString() ?? null,
  });
});
it("refuses internal keyword membership identifiers", () => {
  expect(() =>
    keywordScheduleResource(
      keywordMembershipSchedule(null, "keyword"),
      { ...membership, publicId: "internal_id" },
      null,
    ),
  ).toThrow("Expected a v3 public resource ID.");
});
