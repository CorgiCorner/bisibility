import { describe, expect, it } from "vitest";
import {
  assertTemporalSchedulerEnabled,
  EngineOwnedByWorkerError,
  resolveSchedulerDriver,
  SCHEDULER_DRIVERS,
  SchedulerDisabledError,
  schedulerDriver,
} from "./driver";

describe("schedulerDriver", () => {
  it.each([
    [{}, "legacy-auto"],
    [{ SCHEDULER_DRIVER: "" }, "legacy-auto"],
    [{ SCHEDULER_DRIVER: "temporal" }, "temporal"],
    [{ SCHEDULER_DRIVER: "worker" }, "worker"],
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
    expect(() => schedulerDriver({ SCHEDULER_DRIVER: "sidecar" })).toThrow(
      "SCHEDULER_DRIVER must be exactly one of temporal, worker, none",
    );
  });

  it("reports invalid configuration without throwing from diagnostic surfaces", () => {
    expect(resolveSchedulerDriver({ SCHEDULER_DRIVER: "sidecar" })).toEqual({
      driver: "invalid",
    });
  });

  it("exposes exactly the supported drivers", () => {
    expect(SCHEDULER_DRIVERS).toEqual(["temporal", "worker", "none"]);
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

  it("distinguishes worker ownership from disabled scheduling", () => {
    expect(() => assertTemporalSchedulerEnabled({ SCHEDULER_DRIVER: "worker" })).toThrow(
      EngineOwnedByWorkerError,
    );
    expect(() => assertTemporalSchedulerEnabled({ SCHEDULER_DRIVER: "worker" })).toThrow(
      "Route scheduled work through the worker process for this deployment",
    );
  });
});
