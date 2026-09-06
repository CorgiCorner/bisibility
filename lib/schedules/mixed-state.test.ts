import { describe, expect, it } from "vitest";
import {
  resolveSelectedTarget,
  type ScheduleTarget,
  scheduleModalCounts,
  scheduleRowLabel,
  type TargetSelection,
} from "./mixed-state";

const daily = { name: "Daily 06:00", publicId: "sch_daily" };
const weekly = { name: "Weekly Monday", publicId: "sch_weekly" };
const targets = [
  { id: "kw_us_desktop", schedule: daily },
  { id: "kw_us_mobile", schedule: daily },
  { id: "kw_es_desktop", schedule: weekly },
] satisfies ScheduleTarget[];

describe("schedule mixed state", () => {
  it("uses the single schedule name for targets on one schedule", () => {
    expect(scheduleRowLabel(targets.slice(0, 2))).toBe("Daily 06:00");
  });

  it("labels distinct schedules as Mixed - N", () => {
    expect(scheduleRowLabel(targets)).toBe("Mixed - 2");
  });

  it("counts modal selection by distinct target IDs", () => {
    const selection = {
      targetIds: ["kw_us_desktop", "kw_us_mobile", "kw_us_mobile"],
    } satisfies TargetSelection;

    expect(scheduleModalCounts(targets, selection)).toEqual({
      selectedTargetCount: 2,
      totalTargetCount: 3,
    });
  });

  it("resolves the selected target instead of aggregating the term", () => {
    expect(resolveSelectedTarget(targets, "kw_es_desktop")).toBe(targets[2]);
    expect(resolveSelectedTarget(targets, "kw_missing")).toBeNull();
  });
});
