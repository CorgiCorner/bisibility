import { describe, expect, it } from "vitest";
import {
  compareTrackingPeriods,
  heuristicAliasMatch,
  type TrendObservation,
  trackingDenominator,
} from "./trends";

const observation = (
  measurement: TrendObservation["measurement"],
  overrides: Partial<TrendObservation> = {},
): TrendObservation => ({
  identity: "revision/source/locale/model/brand",
  measurement,
  mentioned: false,
  recordedSource: "fresh",
  ...overrides,
});
describe("tracking denominators", () => {
  it("separates absent AIO, partial, failures, unknowns and missing from eligible answers", () => {
    expect(
      trackingDenominator(
        [
          observation("answer_present", { mentioned: true }),
          observation("aio_not_present"),
          observation("partial"),
          observation("failed"),
          observation("unknown"),
        ],
        6,
      ),
    ).toEqual({
      expected: 6,
      observed: 5,
      eligible: 1,
      mentioned: 1,
      absentAio: 1,
      partial: 1,
      failed: 1,
      unknown: 1,
      missing: 1,
      coverage: 2 / 6,
      mentionRate: 1,
    });
  });
  it("excludes cached observations and never turns unknown into zero mention rate", () => {
    expect(
      trackingDenominator(
        [observation("answer_present", { recordedSource: "cache", mentioned: true })],
        1,
      ),
    ).toMatchObject({ eligible: 0, missing: 1, coverage: 0, mentionRate: null });
  });
  it("requires >=90% coverage and identical configuration", () => {
    const complete = Array.from({ length: 9 }, () => observation("answer_present"));
    expect(compareTrackingPeriods(complete, complete, 10, 10).comparable).toBe(true);
    expect(compareTrackingPeriods(complete, complete.slice(1), 10, 10).delta).toBeNull();
    expect(
      compareTrackingPeriods(
        complete,
        complete.map((item) => ({ ...item, identity: "new revision" })),
        10,
        10,
      ).reason,
    ).toBe("Configuration changed");
  });
  it("matches exact aliases with unicode word boundaries and retains a snippet", () => {
    expect(heuristicAliasMatch("Acmeology is different", ["Acme"])).toBeNull();
    expect(heuristicAliasMatch("Try Acme for reporting.", ["Acme"])).toEqual({
      method: "alias_heuristic",
      alias: "Acme",
      snippet: "Try Acme for reporting.",
    });
  });
  it("retains alias priority, Unicode casing and the original snippet positions", () => {
    const answer = `İ${" ".repeat(90)}ACME ${" ".repeat(90)}BETA+ is useful`;
    const match = heuristicAliasMatch(answer, ["Beta+", "Acme"]);
    expect(match).toEqual({
      method: "alias_heuristic",
      alias: "Beta+",
      snippet: answer.slice(106),
    });
    expect(heuristicAliasMatch("Try ſERVICE or ςervice", ["Service"])?.alias).toBe("Service");
    expect(heuristicAliasMatch("aab is different", ["a+b"])).toBeNull();
  });
});
