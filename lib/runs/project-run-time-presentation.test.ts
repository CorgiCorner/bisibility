import { timelineFixtureRuns } from "@/components/project-runs/project-runs-timeline.fixtures";
import { describe, expect, it } from "vitest";
import { pastScheduledDays, runTimelineSection } from "./project-run-time-presentation";

const clock = "2026-10-18T12:00:00.000Z";
const planned = timelineFixtureRuns[2];
const queued = timelineFixtureRuns[1];
const overdue = {
  ...planned,
  timestamps: { ...planned.timestamps, plannedFor: "2026-10-14T00:00:00.000Z" },
};
describe("run time presentation", () => {
  it("separates an unstarted Oct 14 occurrence from an Oct 21 plan on Oct 18", () => {
    expect(runTimelineSection(overdue, clock)).toBe("due");
    expect(pastScheduledDays(overdue, clock)).toBe(4);
    const future = {
      ...planned,
      timestamps: { ...planned.timestamps, plannedFor: "2026-10-21T00:00:00.000Z" },
    };
    expect(runTimelineSection(future, clock)).toBe("later");
    expect(pastScheduledDays(future, clock)).toBeNull();
  });
  it("does not call a launched queued retry an overdue unstarted schedule", () => {
    expect(runTimelineSection(queued, clock)).toBe("due");
    expect(pastScheduledDays(queued, clock)).toBeNull();
  });
  it.each([undefined, "invalid"])("makes no overdue claim without a valid read clock", (readAt) => {
    expect(pastScheduledDays(overdue, readAt)).toBeNull();
    expect(runTimelineSection(overdue, readAt)).toBe("waiting");
  });
  it("keeps due and later sections monotonic in either server date order", () => {
    const waiting = [
      queued,
      overdue,
      { ...planned, timestamps: { ...planned.timestamps, plannedFor: "2026-10-21T00:00:00.000Z" } },
    ];
    expect(waiting.map((run) => runTimelineSection(run, clock))).toEqual(["due", "due", "later"]);
    expect(waiting.reverse().map((run) => runTimelineSection(run, clock))).toEqual([
      "later",
      "due",
      "due",
    ]);
  });
});
