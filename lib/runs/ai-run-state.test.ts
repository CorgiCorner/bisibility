import { describe, expect, it } from "vitest";
import { aiRunState } from "./ai-run-state";

describe("shared AI run read policy", () => {
  it.each(["partial", "failed", "skipped"])(
    "keeps terminal %s in History and Needs attention",
    (state) => {
      expect(aiRunState(state, null)).toMatchObject({ group: 2, attention: expect.any(Object) });
    },
  );
  it("surfaces future cost-limit skips without treating them as running", () => {
    expect(aiRunState("skipped", null, "cost_limit_exceeded")).toMatchObject({
      key: "cost_limit_exceeded",
      group: 2,
      attention: { kind: "cost_limit_exceeded" },
    });
  });
  it("keeps cancellation in History without requiring attention", () => {
    expect(aiRunState("cancelled", null)).toMatchObject({ group: 2, attention: null });
  });
  it("distinguishes waiting blockers from finished blocked occurrences", () => {
    expect(aiRunState("blocked", null).group).toBe(1);
    expect(aiRunState("blocked", new Date()).group).toBe(2);
  });
});
