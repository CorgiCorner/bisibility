import { canonicalKeySchema } from "@/lib/schemas/keyword";
import { z } from "zod";

export const importWizardSchema = z.object({
  defaultMarketKey: canonicalKeySchema.nullable().default(null),
  csv: z.string().default(""),
  duplicateMode: z.literal("skip"),
  projectId: z.string().optional(),
  refresh: z.literal("deferred"),
});

export type ImportWizardForm = z.infer<typeof importWizardSchema>;
