import { describe, expect, it } from "vitest";
import { runScheduleTiming, runStartFacts, startedRunItemWhere } from "./start-facts";

const queued = {
  _count: { items: 0 },
  checkSchedule: { frequency: "daily", jitterMinutes: 15, timeOfDay: null },
  items: [{ notBefore: new Date("2026-09-04T14:00:00.000Z"), status: "queued" }],
  status: "queued",
};

describe("run start facts shared by the tray and run pages", () => {
  it("keeps an unstarted distributed run at zero and serializes its first check time", () => {
    expect(JSON.parse(JSON.stringify(runStartFacts(queued)))).toEqual({
      firstNotBefore: "2026-09-04T14:00:00.000Z",
      hasRunningTargets: false,
      nextCheckAt: "2026-09-04T14:00:00.000Z",
      scheduleTiming: "spread across the day",
      startedTargets: 0,
    });
  });
  it("distinguishes a later gap from a first start", () => {
    expect(runStartFacts({ ...queued, _count: { items: 1 }, status: "running" })).toMatchObject({
      firstNotBefore: null,
      hasRunningTargets: false,
      nextCheckAt: "2026-09-04T14:00:00.000Z",
      startedTargets: 1,
    });
  });
  it("does not announce a future wait while another target is running", () => {
    expect(
      runStartFacts({
        ...queued,
        status: "running",
        items: [{ ...queued.items[0], status: "running" }],
      }),
    ).toMatchObject({
      firstNotBefore: null,
      hasRunningTargets: true,
      nextCheckAt: null,
    });
  });
  it("does not infer a start from a preallocated check cancelled or skipped before execution", () => {
    expect(startedRunItemWhere).toEqual({
      OR: [
        { startedAt: { not: null } },
        {
          rankCheckId: { not: null },
          status: { in: ["running", "completed", "failed", "deferred"] },
        },
      ],
    });
  });
  it("uses the actual configured jitter rather than promising a constant start window", () => {
    expect(
      runScheduleTiming({ ...queued.checkSchedule, jitterMinutes: 60, timeOfDay: "06:00" }),
    ).toBe("starts within 60 min of the scheduled time");
    expect(
      runScheduleTiming({ ...queued.checkSchedule, jitterMinutes: 0, timeOfDay: "06:00" }),
    ).toBe("starts at the scheduled time");
    expect(runScheduleTiming(null)).toBeNull();
  });
});
