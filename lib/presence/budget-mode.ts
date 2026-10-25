import { z } from "zod";

export const inspectionBudgetModeSchema = z.enum(["off", "fixed", "available_quota"]);
export type InspectionBudgetMode = z.infer<typeof inspectionBudgetModeSchema>;

export function availableInspectionModes(selfHost: boolean): InspectionBudgetMode[] {
  return selfHost ? ["off", "fixed", "available_quota"] : ["off", "fixed"];
}

export function effectiveInspectionMode(mode: InspectionBudgetMode | undefined, selfHost: boolean) {
  return mode === "available_quota" && !selfHost ? "fixed" : (mode ?? "fixed");
}

export function validateInspectionMode(mode: InspectionBudgetMode | undefined, selfHost: boolean) {
  if (mode === "available_quota" && !selfHost) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["budget_mode"],
        message: "available_quota is available only on self-host deployments. Use off or fixed.",
      },
    ]);
  }
}
