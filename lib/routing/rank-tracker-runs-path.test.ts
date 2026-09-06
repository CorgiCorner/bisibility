import { describe, expect, it } from "vitest";
import { rankTrackerRunsPath } from "./rank-tracker-runs-path";

describe("rankTrackerRunsPath", () => {
  it("builds list and object paths without extending the rank-tracker tab contract", () => {
    expect(rankTrackerRunsPath("prj_1")).toBe("/app/prj_1/rank-tracker/runs");
    expect(rankTrackerRunsPath("prj_1", "rcr_1")).toBe("/app/prj_1/rank-tracker/runs/rcr_1");
  });
});
