import { visibilityCoverageCopy } from "@/lib/visibility/definition";
import { describe, expect, it } from "vitest";
import {
  summarizeVisibility,
  VISIBILITY_HORIZON,
  VISIBILITY_POSITION_WEIGHTS_V1,
  visibilitySnapshotFor,
} from "./visibility";

type TestCheck = {
  normalizationVersion: string | null;
  position: number | null;
  requestedDepth: number | null;
  status: string;
};

function check(
  position: number | null,
  requestedDepth: number | null,
  overrides: Partial<TestCheck> = {},
): TestCheck {
  return {
    normalizationVersion: "v1",
    position,
    requestedDepth,
    status: "completed",
    ...overrides,
  };
}

function snapshot(checks: TestCheck[], volume: number | null = 1) {
  return visibilitySnapshotFor({ rankChecks: checks }, volume);
}

describe("Visibility v1.1 selector", () => {
  it("keeps the frozen Top-20 definition explicit", () => {
    expect(VISIBILITY_HORIZON).toBe(20);
    expect(VISIBILITY_POSITION_WEIGHTS_V1).toHaveLength(VISIBILITY_HORIZON);
  });

  it("names the bounded overview population when more keywords exist", () => {
    expect(visibilityCoverageCopy({ limited: true, measured: 1_800, total: 2_000 })).toBe(
      "1800 of 2000 newest keywords measured",
    );
  });

  it("excludes a completed depth-10 not-found check from score and denominator", () => {
    const result = summarizeVisibility([
      snapshot([check(null, 10)], 100),
      snapshot([check(1, 100)], 10),
    ]);

    expect(result).toMatchObject({ measuredKeywordCount: 1, value: 100 });
  });

  it("matches the three-keyword worked example with one shallow scan", () => {
    const result = summarizeVisibility([
      snapshot([check(1, 100)], 100),
      snapshot([check(10, 20)], 50),
      snapshot([check(null, 10)], 100),
    ]);

    expect(result.measuredKeywordCount).toBe(2);
    expect(result.value).toBeCloseTo(70.3333, 4);
  });

  it("uses the newest eligible completed check and skips shallower attempts", () => {
    const selected = snapshot([
      check(null, 10),
      check(3, 100),
      check(null, 20, { status: "failed" }),
      check(8, 50),
    ]);

    expect(selected.current?.position).toBe(3);
    expect(selected.previous?.position).toBe(8);
  });

  it("keeps a completed eligible not-found check as a valid zero observation", () => {
    const result = summarizeVisibility([snapshot([check(null, 20), check(1, 100)], 100)]);

    expect(result).toMatchObject({ delta: -100, measuredKeywordCount: 1, value: 0 });
  });

  it("skips a depth-10 check between two depth-100 checks for the delta", () => {
    const result = summarizeVisibility([
      snapshot([check(1, 100), check(null, 10), check(20, 100)], 100),
    ]);

    expect(result.comparableKeywordCount).toBe(1);
    expect(result.delta).toBeCloseTo(96.6667, 4);
  });

  it("keeps scores invariant across eligible depths 100, 50, and 20", () => {
    const values = [100, 50, 20].map(
      (depth) => summarizeVisibility([snapshot([check(7, depth)], 100)]).value,
    );

    expect(new Set(values).size).toBe(1);
  });

  it("excludes a never-measured keyword from score but retains coverage", () => {
    const result = summarizeVisibility([snapshot([], 1_000), snapshot([check(1, 20)], 10)]);

    expect(result).toMatchObject({ measuredKeywordCount: 1, value: 100 });
  });

  it("returns no Visibility value when all keywords are unmeasured", () => {
    const result = summarizeVisibility([snapshot([]), snapshot([check(null, 10)])]);

    expect(result).toMatchObject({
      comparableKeywordCount: 0,
      delta: null,
      measuredKeywordCount: 0,
      value: null,
    });
  });

  it("treats null requested depth as unknown and Visibility-ineligible", () => {
    const result = summarizeVisibility([
      snapshot([check(1, null)], 1_000),
      snapshot([check(20, 20)], 10),
    ]);

    expect(result.measuredKeywordCount).toBe(1);
    expect(result.value).toBeCloseTo(3.3333, 4);
  });

  it("keeps headline and delta populations intentionally independent", () => {
    const result = summarizeVisibility([
      snapshot([check(1, 20)], 100),
      snapshot([check(10, 20), check(20, 50)], 100),
    ]);

    expect(result.measuredKeywordCount).toBe(2);
    expect(result.comparableKeywordCount).toBe(1);
  });

  it("does not compare across an eligible normalization boundary", () => {
    const selected = snapshot([
      check(1, 100, { normalizationVersion: "v2" }),
      check(20, 100, { normalizationVersion: "v1" }),
    ]);

    expect(selected.current?.position).toBe(1);
    expect(selected.previous).toBeNull();
  });
});
