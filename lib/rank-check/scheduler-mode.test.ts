import { afterEach, describe, expect, it, vi } from "vitest";
import {
  automaticProviderExecutionAllowed,
  dispatcherClaimsAllowed,
  dispatcherStateHealingAllowed,
  manualRankChecksAllowed,
  parseRankCheckSchedulerMode,
  plannerOwnsAutomaticChecks,
  rankCheckSchedulerMode,
  warnRetiredRankSchedulerConfiguration,
} from "./scheduler-mode";

describe("rank-check scheduler mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [{}, "dispatcher"],
    [{ RANK_CHECK_SCHEDULER_MODE: "" }, "dispatcher"],
    [{ RANK_CHECK_SCHEDULER_MODE: "cutover" }, "cutover"],
    [{ RANK_CHECK_SCHEDULER_MODE: "dispatcher" }, "dispatcher"],
  ] as const)("parses the D2 mode matrix", (env, expected) => {
    expect(parseRankCheckSchedulerMode(env)).toBe(expected);
  });

  it.each(["Legacy", " dispatcher ", "on", "false", "unknown"])(
    "rejects a malformed explicit value: %s",
    (value) => {
      expect(() => parseRankCheckSchedulerMode({ RANK_CHECK_SCHEDULER_MODE: value })).toThrow(
        "RANK_CHECK_SCHEDULER_MODE",
      );
    },
  );

  it("normalizes the removed legacy engine without blocking app startup", () => {
    expect(parseRankCheckSchedulerMode({ RANK_CHECK_SCHEDULER_MODE: "legacy" })).toBe("dispatcher");
  });

  it.each(["RANK_CHECK_DISPATCHER_ENABLED", "RANK_CHECK_RECONCILER_ENABLED"])(
    "ignores retired ownership switches and preserves an explicit cutover: %s",
    (key) => {
      expect(parseRankCheckSchedulerMode({ [key]: "false" })).toBe("dispatcher");
      expect(
        parseRankCheckSchedulerMode({ [key]: "true", RANK_CHECK_SCHEDULER_MODE: "cutover" }),
      ).toBe("cutover");
    },
  );

  it("warns about obsolete configuration without printing arbitrary environment values", () => {
    const warn = vi.fn();
    warnRetiredRankSchedulerConfiguration(
      { RANK_CHECK_SCHEDULER_MODE: "legacy", RANK_CHECK_RECONCILER_ENABLED: "false" },
      warn,
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("automatically"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("SCHEDULED_MAINTENANCE_ENABLED=0"));
    warn.mockClear();
    warnRetiredRankSchedulerConfiguration({}, warn);
    expect(warn).not.toHaveBeenCalled();
  });

  it("exposes non-overlapping named predicates", () => {
    expect(dispatcherClaimsAllowed("legacy")).toBe(false);
    expect(plannerOwnsAutomaticChecks("legacy")).toBe(false);
    expect(dispatcherStateHealingAllowed("legacy")).toBe(false);
    expect(automaticProviderExecutionAllowed("legacy", "legacy")).toBe(false);
    expect(automaticProviderExecutionAllowed("legacy", "dispatcher")).toBe(false);

    expect(dispatcherClaimsAllowed("cutover")).toBe(false);
    expect(plannerOwnsAutomaticChecks("cutover")).toBe(false);
    expect(dispatcherStateHealingAllowed("cutover")).toBe(true);
    expect(automaticProviderExecutionAllowed("cutover", "legacy")).toBe(false);
    expect(automaticProviderExecutionAllowed("cutover", "dispatcher")).toBe(false);

    expect(dispatcherClaimsAllowed("dispatcher")).toBe(true);
    expect(plannerOwnsAutomaticChecks("dispatcher")).toBe(true);
    expect(dispatcherStateHealingAllowed("dispatcher")).toBe(true);
    expect(automaticProviderExecutionAllowed("dispatcher", "legacy")).toBe(false);
    expect(automaticProviderExecutionAllowed("dispatcher", "dispatcher")).toBe(true);
    expect(manualRankChecksAllowed("legacy")).toBe(true);
    expect(manualRankChecksAllowed("cutover")).toBe(true);
    expect(manualRankChecksAllowed("dispatcher")).toBe(true);
  });

  it("reads the effective process mode through the strict parser", () => {
    vi.stubEnv("RANK_CHECK_SCHEDULER_MODE", "dispatcher");
    expect(rankCheckSchedulerMode()).toBe("dispatcher");
  });
});
