import { describe, expect, it } from "vitest";
import * as constants from "./constants";

describe("SERP neutral constants", () => {
  it("preserves all defaults and device options", () => {
    expect(constants.SERP_ENGINE).toEqual({ id: "google", label: "Google" });
    expect(constants.serpDepthValues).toEqual([10, 20, 50, 100]);
    expect(constants.serpDeviceValues).toEqual(["desktop", "mobile"]);
    expect(constants.serpDeviceOptions).toEqual([
      { label: "Desktop", value: "desktop" },
      { label: "Mobile", value: "mobile" },
    ]);
    expect(constants.DEFAULT_SERP_DEPTH).toBe(100);
    expect(constants.DEFAULT_SERP_DEVICE).toBe("desktop");
    expect(constants.DEFAULT_SERP_STOP_ON_MATCH).toBe(true);
  });

  it("follows updated project defaults for an assigned schedule while preserving an explicit run depth", () => {
    for (const projectDepth of constants.serpDepthValues) {
      expect(
        constants.resolveEffectiveSerpDepth({
          checkScheduleDepth: null,
          projectDepth,
          scheduleDepth: 10,
        }),
      ).toBe(projectDepth);
    }
    expect(
      constants.resolveEffectiveSerpDepth({
        checkScheduleDepth: 50,
        projectDepth: 20,
        scheduleDepth: 10,
      }),
    ).toBe(50);
    expect(
      constants.resolveEffectiveSerpDepth({
        checkScheduleDepth: 50,
        projectDepth: 20,
        requestedDepth: 100,
      }),
    ).toBe(100);
  });

  it("resolves depth and stop-on-match with the established precedence", () => {
    expect(constants.resolveSerpDepth(undefined)).toBe(100);
    expect(constants.resolveSerpDepth(10)).toBe(10);
    expect(() => constants.resolveSerpDepth(30)).toThrow("Unsupported SERP depth: 30");
    expect(
      constants.resolveEffectiveSerpDepth({
        projectDepth: 10,
        requestedDepth: 50,
        scheduleDepth: 20,
      }),
    ).toBe(50);
    expect(
      constants.resolveEffectiveSerpDepth({
        projectDepth: 10,
        requestedDepth: null,
        scheduleDepth: 20,
      }),
    ).toBe(20);
    expect(constants.resolveEffectiveSerpDepth({ projectDepth: null, scheduleDepth: null })).toBe(
      100,
    );
    expect(constants.resolveSerpStopOnMatch(undefined)).toBe(true);
    expect(constants.resolveSerpStopOnMatch(null)).toBe(true);
    expect(constants.resolveSerpStopOnMatch(false)).toBe(false);
  });

  it("does not export location catalog values", () => {
    for (const name of ["DEFAULT_SERP_MARKET", "serpMarketNames", "serpMarkets"]) {
      expect(constants).not.toHaveProperty(name);
    }
  });
});
