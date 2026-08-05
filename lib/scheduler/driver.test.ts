import { describe, expect, it } from "vitest";
import {
  assertTemporalSchedulerEnabled,
  resolveSchedulerDriver,
  SchedulerDisabledError,
  schedulerDriver,
} from "./driver";

describe("schedulerDriver", () => {
  it.each([
    [{}, "legacy-auto"],
    [{ SCHEDULER_DRIVER: "" }, "legacy-auto"],
    [{ SCHEDULER_DRIVER: "temporal" }, "temporal"],
    [{ SCHEDULER_DRIVER: "none" }, "none"],
  ] as const)("resolves %o to %s", (env, expected) => {
    expect(schedulerDriver(env)).toBe(expected);
  });

  it("recognizes the reserved external-cron driver without enabling it", () => {
    expect(() => schedulerDriver({ SCHEDULER_DRIVER: "external-cron" })).toThrow(
      "SCHEDULER_DRIVER=external-cron is recognized but not supported yet",
    );
  });

  it("rejects unknown drivers", () => {
    expect(() => schedulerDriver({ SCHEDULER_DRIVER: "worker" })).toThrow(
      "SCHEDULER_DRIVER must be exactly one of temporal, none",
    );
  });

  it("reports invalid configuration without throwing from diagnostic surfaces", () => {
    expect(resolveSchedulerDriver({ SCHEDULER_DRIVER: "worker" })).toEqual({
      driver: "invalid",
    });
  });
});

describe("assertTemporalSchedulerEnabled", () => {
  it("accepts temporal and legacy compatibility mode", () => {
    expect(assertTemporalSchedulerEnabled({ SCHEDULER_DRIVER: "temporal" })).toBe("temporal");
    expect(assertTemporalSchedulerEnabled({})).toBe("legacy-auto");
  });

  it("returns a stable disabled error for core-only deployments", () => {
    expect(() => assertTemporalSchedulerEnabled({ SCHEDULER_DRIVER: "none" })).toThrow(
      SchedulerDisabledError,
    );
    expect(() => assertTemporalSchedulerEnabled({ SCHEDULER_DRIVER: "none" })).toThrow(
      "Scheduled execution is disabled for this deployment",
    );
  });
});
