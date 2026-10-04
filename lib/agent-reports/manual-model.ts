import { z } from "zod";

export const manualReportSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    analysis: z.string().trim().min(1).max(12000),
  })
  .strict();

export type ManualReportInput = z.infer<typeof manualReportSchema>;
