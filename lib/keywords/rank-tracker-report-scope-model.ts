import { dashboardLocalSelectionSchema } from "@/lib/dashboard-local/selection";
import { z } from "zod";
export const rankTrackerComparisonDays = [7, 28, 90] as const;
const asOfSchema = z.iso
  .datetime({ precision: 3 })
  .refine((value) => Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
export const defaultRankTrackerReportScope = {
  view: "general" as const,
  subject: null,
  comparisonDays: 7 as const,
  asOf: null,
};
export const rankTrackerReportScopeSchema = z
  .object({
    view: z.enum(["general", "local"]),
    subject: dashboardLocalSelectionSchema.nullable(),
    comparisonDays: z.union(rankTrackerComparisonDays.map((value) => z.literal(value))),
    asOf: asOfSchema.nullable(),
  })
  .strict();
export type RankTrackerReportScope = z.infer<typeof rankTrackerReportScopeSchema>;
