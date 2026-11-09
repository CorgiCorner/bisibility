import { describe, expect, it } from "vitest";
import { projectSchedulesPath } from "./project-schedules-path";

describe("projectSchedulesPath", () => {
  it("builds list and object paths without extending the rank-tracker tab contract", () => {
    expect(projectSchedulesPath("prj_1")).toBe("/app/prj_1/schedules");
    expect(projectSchedulesPath("prj_1", "sch_1")).toBe("/app/prj_1/schedules/sch_1");
  });
});
