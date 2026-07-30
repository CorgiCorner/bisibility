import { describe, expect, it } from "vitest";
import type {
  TemporalCounterReadState,
  TemporalPerScheduleCounters,
} from "./heartbeat-counter-state";
import { scheduleBreakdownText, scheduleDeltas } from "./heartbeat-schedule-breakdown";
import type { TemporalScheduleIssue } from "./heartbeat-temporal";

function issue(
  scheduleId: string,
  missedCatchup: number,
  skippedOverlap = 0,
): TemporalScheduleIssue {
  return { gapAt: null, missedCatchup, recoveredAt: null, scheduleId, skippedOverlap };
}

function available(perSchedule?: TemporalPerScheduleCounters): TemporalCounterReadState {
  return { status: "available", perSchedule, totals: { missedCatchup: 0, skippedOverlap: 0 } };
}

describe("scheduleDeltas", () => {
  it("treats an unknown previous schedule as a zero baseline", () => {
    const { deltas, lifetime } = scheduleDeltas([issue("new-schedule", 12)], available({}));
    expect(lifetime).toBe(false);
    expect(deltas).toEqual([{ newMissed: 12, newSkipped: 0, scheduleId: "new-schedule" }]);
  });

  it("clamps a recreated schedule with a lower lifetime counter to zero, not negative", () => {
    const state = available({ "reused-id": { missedCatchup: 100, skippedOverlap: 0 } });
    const { deltas } = scheduleDeltas([issue("reused-id", 3)], state);
    expect(deltas).toEqual([]);
  });

  it("falls back to lifetime numbers when no per-schedule baseline exists", () => {
    const { deltas, lifetime } = scheduleDeltas([issue("s", 7)], available(undefined));
    expect(lifetime).toBe(true);
    expect(deltas[0]?.newMissed).toBe(7);
  });

  it("returns no deltas when counters are unavailable", () => {
    const { deltas, lifetime } = scheduleDeltas([issue("s", 7)], { status: "unavailable" });
    expect(lifetime).toBe(true);
    expect(deltas[0]?.newMissed).toBe(7);
  });
});

describe("scheduleBreakdownText", () => {
  it("is empty when nothing grew", () => {
    const state = available({ s: { missedCatchup: 5, skippedOverlap: 0 } });
    expect(scheduleBreakdownText([issue("s", 5)], state)).toBe("");
  });

  it("sorts by new missed and includes skipped only when nonzero", () => {
    const text = scheduleBreakdownText([issue("low", 2), issue("high", 40, 3)], available({}));
    expect(text).toBe("high +40 (+3 skipped), low +2");
  });
});
