import { describe, expect, it } from "vitest";
import { rankCheckDispatcherMaxKeywordsPerProject } from "./dispatcher-config";

describe("rankCheckDispatcherMaxKeywordsPerProject", () => {
  it("defaults to the hosted initial cap", () => {
    expect(rankCheckDispatcherMaxKeywordsPerProject({})).toBe(25);
  });

  it.each(["1", "25", "100"])("accepts the bounded integer %s", (value) => {
    expect(
      rankCheckDispatcherMaxKeywordsPerProject({
        RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS: value,
      }),
    ).toBe(Number(value));
  });

  it.each(["", " ", "0", "-1", "1.5", "101", "NaN", "unsafe", "9007199254740992"])(
    "fails closed for %s",
    (value) => {
      expect(() =>
        rankCheckDispatcherMaxKeywordsPerProject({
          RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS: value,
        }),
      ).toThrow("RANK_CHECK_DISPATCHER_MAX_KEYWORDS_PER_PROJECT_PER_PASS");
    },
  );
});
