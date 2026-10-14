import { describe, expect, it } from "vitest";
import { recurringMonitorsEnabled } from "./config";

describe("recurring deployment activation", () => {
  it("is explicitly off by default and never selects inline none execution", () => {
    expect(recurringMonitorsEnabled({})).toBe(false);
    expect(
      recurringMonitorsEnabled({
        LOCAL_MONITOR_RECURRING_ENABLED: "true",
        SCHEDULER_DRIVER: "none",
      }),
    ).toBe(false);
  });
  it("accepts only an explicit supported worker flag", () => {
    expect(
      recurringMonitorsEnabled({
        LOCAL_MONITOR_RECURRING_ENABLED: "true",
        SCHEDULER_DRIVER: "temporal",
      }),
    ).toBe(true);
    expect(
      recurringMonitorsEnabled({
        LOCAL_MONITOR_RECURRING_ENABLED: "1",
        SCHEDULER_DRIVER: "worker",
      }),
    ).toBe(true);
    expect(() => recurringMonitorsEnabled({ LOCAL_MONITOR_RECURRING_ENABLED: "yes" })).toThrow();
  });
});
