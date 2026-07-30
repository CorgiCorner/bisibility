import { z } from "zod";

export const importWizardSchema = z.object({
  csv: z.string().default(""),
  duplicateMode: z.literal("skip"),
  projectId: z.string().optional(),
  refresh: z.literal("deferred"),
});

export type ImportWizardForm = z.infer<typeof importWizardSchema>;
