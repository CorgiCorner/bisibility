import { z } from "zod";

export const setPrimaryConversionSourceSchema = z.object({
  projectId: z.string().trim().min(1),
  source: z.enum(["ga4", "plausible"]),
});

export const syncConversionSourceSchema = setPrimaryConversionSourceSchema;

export const updateConversionGoalSchema = z
  .object({
    countsRevenue: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
    goalId: z.string().trim().min(1),
    projectId: z.string().trim().min(1),
  })
  .refine(
    (value) =>
      value.countsRevenue !== undefined ||
      value.displayName !== undefined ||
      value.enabled !== undefined,
  );
