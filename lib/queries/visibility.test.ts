import { visibilityCoverageCopy } from "@/lib/visibility/definition";
import { describe, expect, it } from "vitest";
import {
  summarizeVisibility,
  VISIBILITY_HORIZON,
  VISIBILITY_POSITION_WEIGHTS_V1,
  visibilitySnapshotFor,
} from "./visibility";

type TestCheck = import("@/lib/rank-measurements/recorded-check").RecordedMeasurementCheck & {
  status: string;
};
let fixtureId = 0;
let checkId = 0;

function check(
  position: number | null,
  requestedDepth: number | null,
  overrides: Partial<TestCheck> = {},
): TestCheck {
  const at = new Date(Date.parse("2026-01-01T00:00:00Z") - checkId++ * 1000);
  return {
    id: `check-${checkId}`,
    normalizationVersion: "v1",
    position,
    requestedDepth,
    status: "completed",
    checkedAt: at,
    provider: "synthetic",
    observationRun: {
      projectId: "project-a",
      createdAt: at,
      completeness: "complete",
      provider: "synthetic",
      engine: "google",
      surface: "web_serp",
      configuredScope: { location: "City A", language: "en", device: "desktop" },
      effectiveScope: { location: "City A", language: "en", device: "desktop" },
      requestPolicy: {
        evidence: {
          version: 1,
          targetRevision: "fixture-v1",
          policyRevision: "fixture-policy-v1",
          observedAt: at.toISOString(),
          completeThrough: { organic_result: requestedDepth },
        },
      },
    },
    ...overrides,
  };
}

function snapshot(checks: TestCheck[], volume: number | null = 1) {
  return visibilitySnapshotFor(
    { id: `fixture-${fixtureId++}`, projectId: "project-a", rankChecks: checks },
    volume,
    { asOf: new Date("2026-02-01T00:00:00.000Z") },
  );
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

  it("does not hide the latest unqualified attempt behind older depth", () => {
    const selected = snapshot([
      check(null, 10),
      check(3, 100),
      check(null, 20, { status: "failed" }),
      check(8, 50),
    ]);

    expect(selected.current?.evidence).toBe("unknown");
    expect(selected.previous).toBeNull();
  });

  it("keeps a completed eligible not-found check as a valid zero observation", () => {
    const result = summarizeVisibility([snapshot([check(null, 20), check(1, 100)], 100)]);

    expect(result).toMatchObject({ delta: -100, measuredKeywordCount: 1, value: 0 });
  });

  it("keeps an intervening unqualified depth as an explicit boundary", () => {
    const result = summarizeVisibility([
      snapshot([check(1, 100), check(null, 10), check(20, 100)], 100),
    ]);

    expect(result.comparableKeywordCount).toBe(0);
    expect(result.delta).toBeNull();
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
