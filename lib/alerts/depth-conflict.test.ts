import { describe, expect, it } from "vitest";
import {
  alertDepthConflict,
  alertDepthConflictWarning,
  alertPositionThreshold,
  minimumTargetedDepth,
} from "./depth-conflict";

describe("alert depth conflicts", () => {
  it.each([
    ["threshold", { conditionType: "threshold", thresholdPosition: 50 }, 50],
    ["enters_top_n", { conditionType: "enters_top_n", topN: 20 }, 20],
    ["exits_top_n", { conditionType: "exits_top_n", topN: 10 }, 10],
    ["change_pct", { conditionType: "change_pct" }, null],
  ])("resolves the %s position boundary", (_label, rule, expected) => {
    expect(alertPositionThreshold(rule)).toBe(expected);
  });

  it("builds the badge model only when the threshold exceeds tracked depth", () => {
    expect(alertDepthConflict({ conditionType: "threshold", thresholdPosition: 50 }, 20)).toEqual({
      threshold: 50,
      trackedDepth: 20,
    });
    expect(
      alertDepthConflict({ conditionType: "threshold", thresholdPosition: 20 }, 20),
    ).toBeNull();
    expect(alertDepthConflict({ conditionType: "exits_top_n", topN: 100 }, null)).toBeNull();
  });

  it("finds the minimum effective depth for keyword and tag targets", () => {
    const keywords = [
      { id: "kw_1", projectDepth: 100, scheduleDepth: 10, tagIds: ["tag_1"] },
      { id: "kw_2", projectDepth: 50, scheduleDepth: null, tagIds: ["tag_2"] },
    ];
    expect(minimumTargetedDepth({ targetIds: ["kw_2"], targetType: "keyword" }, keywords)).toBe(50);
    expect(minimumTargetedDepth({ targetIds: ["tag_1"], targetType: "tag" }, keywords)).toBe(10);
    expect(minimumTargetedDepth({ targetIds: [], targetType: "all" }, keywords)).toBe(10);
  });

  it("formats a non-blocking save warning", () => {
    expect(alertDepthConflictWarning({ threshold: 50, trackedDepth: 10 })).toContain(
      "won't fire for deeper positions",
    );
  });
});
