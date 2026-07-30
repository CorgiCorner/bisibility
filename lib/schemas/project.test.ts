import { describe, expect, it } from "vitest";
import { projectInspectionBudgetSchema } from "./project";

describe("projectInspectionBudgetSchema", () => {
  it.each([0, 50, 1000])("accepts the inspection budget boundary %s", (inspectionDailyLimit) => {
    expect(
      projectInspectionBudgetSchema.parse({ inspectionDailyLimit, projectId: "prj_1" }),
    ).toMatchObject({ inspectionDailyLimit });
  });

  it.each([-1, 1.5, 1001])("rejects the inspection budget value %s", (inspectionDailyLimit) => {
    expect(() =>
      projectInspectionBudgetSchema.parse({ inspectionDailyLimit, projectId: "prj_1" }),
    ).toThrow();
  });
});
