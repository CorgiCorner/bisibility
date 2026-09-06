import { describe, expect, it } from "vitest";
import { rankTrackerSchedulesPath } from "./rank-tracker-schedules-path";

describe("rankTrackerSchedulesPath", () => {
  it("builds list and object paths without extending the rank-tracker tab contract", () => {
    expect(rankTrackerSchedulesPath("prj_1")).toBe("/app/prj_1/rank-tracker/schedules");
    expect(rankTrackerSchedulesPath("prj_1", "sch_1")).toBe(
      "/app/prj_1/rank-tracker/schedules/sch_1",
    );
  });
});
