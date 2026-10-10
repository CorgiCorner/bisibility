import { describe, expect, it } from "vitest";
import { notRankedLabel, rankObservationState } from "./rank-depth";

describe("rank observation formatting", () => {
  it("keeps pending, completed no-position, sentinel, and ranked states distinct", () => {
    expect(rankObservationState({ completedChecks: 0, position: null })).toEqual({
      kind: "pending",
      label: "No data",
      position: null,
    });
    expect(rankObservationState({ completedChecks: 1, position: null })).toEqual({
      kind: "not_ranked",
      label: "Not in top 100",
      position: null,
    });
    expect(rankObservationState({ completedChecks: 1, position: 101 })).toMatchObject({
      kind: "not_ranked",
      position: null,
    });
    expect(rankObservationState({ completedChecks: 1, position: 4 })).toEqual({
      kind: "ranked",
      label: "#4",
      position: 4,
    });
  });

  it("formats the configured tracked depth from one shared helper", () => {
    expect(notRankedLabel(50)).toBe("Not in top 50");
  });
});

it("does not infer absence within depth from unknown coverage", () => {
  expect(
    rankObservationState({ completedChecks: 1, position: null, completeness: "unknown" }),
  ).toEqual({ kind: "unknown", label: "Coverage unknown", position: null });
  expect(
    rankObservationState({ completedChecks: 1, position: 4, completeness: "unknown" }),
  ).toMatchObject({ kind: "ranked", position: 4 });
});

it("treats truncated absence as unknown but keeps positive observations valid", () => {
  expect(
    rankObservationState({
      completedChecks: 1,
      position: 101,
      completeness: "truncated_by_stop_on_match",
    }),
  ).toMatchObject({ kind: "unknown", label: "Coverage unknown" });
  expect(
    rankObservationState({
      completedChecks: 1,
      position: 4,
      completeness: "truncated_by_stop_on_match",
    }),
  ).toMatchObject({ kind: "ranked", position: 4 });
});
