import { afterEach, describe, expect, it, vi } from "vitest";
import {
  automaticProviderExecutionAllowed,
  dispatcherClaimsAllowed,
  dispatcherStateHealingAllowed,
  legacySchedulingAllowed,
  manualRankChecksAllowed,
  parseRankCheckSchedulerMode,
  rankCheckSchedulerMode,
} from "./scheduler-mode";

describe("rank-check scheduler mode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [{}, "legacy"],
    [{ RANK_CHECK_SCHEDULER_MODE: "" }, "legacy"],
    [{ RANK_CHECK_SCHEDULER_MODE: "legacy" }, "legacy"],
    [{ RANK_CHECK_SCHEDULER_MODE: "cutover" }, "cutover"],
    [{ RANK_CHECK_SCHEDULER_MODE: "dispatcher" }, "dispatcher"],
  ] as const)("parses the explicit mode matrix", (env, expected) => {
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

  it.each([
    [{}, "legacy"],
    [{ RANK_CHECK_DISPATCHER_ENABLED: "0" }, "legacy"],
    [{ RANK_CHECK_RECONCILER_ENABLED: "true" }, "legacy"],
    [{ RANK_CHECK_DISPATCHER_ENABLED: "false", RANK_CHECK_RECONCILER_ENABLED: "false" }, "cutover"],
    [
      { RANK_CHECK_DISPATCHER_ENABLED: "true", RANK_CHECK_RECONCILER_ENABLED: "false" },
      "dispatcher",
    ],
  ] as const)("maps the deprecated boolean fallback", (env, expected) => {
    expect(parseRankCheckSchedulerMode(env)).toBe(expected);
  });

  it("rejects both deprecated schedulers active", () => {
    expect(() =>
      parseRankCheckSchedulerMode({
        RANK_CHECK_DISPATCHER_ENABLED: "1",
        RANK_CHECK_RECONCILER_ENABLED: "1",
      }),
    ).toThrow("unsafe");
  });

  it.each([
    ["RANK_CHECK_DISPATCHER_ENABLED", "enabled"],
    ["RANK_CHECK_RECONCILER_ENABLED", "disabled"],
  ])("rejects malformed deprecated boolean %s", (key, value) => {
    expect(() => parseRankCheckSchedulerMode({ [key]: value })).toThrow(key);
  });

  it("uses an explicitly present new mode as the sole source of truth", () => {
    expect(
      parseRankCheckSchedulerMode({
        RANK_CHECK_DISPATCHER_ENABLED: "1",
        RANK_CHECK_RECONCILER_ENABLED: "1",
        RANK_CHECK_SCHEDULER_MODE: "cutover",
      }),
    ).toBe("cutover");
  });

  it("exposes non-overlapping named predicates", () => {
    expect(legacySchedulingAllowed("legacy")).toBe(true);
    expect(dispatcherClaimsAllowed("legacy")).toBe(false);
    expect(dispatcherStateHealingAllowed("legacy")).toBe(false);
    expect(automaticProviderExecutionAllowed("legacy", "legacy")).toBe(true);
    expect(automaticProviderExecutionAllowed("legacy", "dispatcher")).toBe(false);

    expect(legacySchedulingAllowed("cutover")).toBe(false);
    expect(dispatcherClaimsAllowed("cutover")).toBe(false);
    expect(dispatcherStateHealingAllowed("cutover")).toBe(true);
    expect(automaticProviderExecutionAllowed("cutover", "legacy")).toBe(false);
    expect(automaticProviderExecutionAllowed("cutover", "dispatcher")).toBe(false);

    expect(legacySchedulingAllowed("dispatcher")).toBe(false);
    expect(dispatcherClaimsAllowed("dispatcher")).toBe(true);
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
