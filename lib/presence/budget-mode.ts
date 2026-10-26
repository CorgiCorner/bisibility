import { z } from "zod";

export const inspectionBudgetModeSchema = z.enum(["off", "fixed", "available_quota"]);
export type InspectionBudgetMode = z.infer<typeof inspectionBudgetModeSchema>;

export function availableInspectionModes(): InspectionBudgetMode[] {
  return ["off", "fixed", "available_quota"];
}

export function effectiveInspectionMode(mode: InspectionBudgetMode | undefined) {
  return mode ?? "fixed";
}

export function validateInspectionMode(mode: InspectionBudgetMode | undefined) {
  inspectionBudgetModeSchema.optional().parse(mode);
}
