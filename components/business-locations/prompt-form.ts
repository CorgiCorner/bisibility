import { z } from "zod";

export const reasonFormSchema = z
  .object({ reason: z.string().trim().min(1, "validation.reason").max(500, "validation.reason") })
  .strict();
export const confirmedPromptSchema = z
  .object({ confirmed: z.boolean().refine((value) => value, "validation.confirmed") })
  .strict();
export const candidatePromptSchema = reasonFormSchema
  .extend({
    action: z.enum(["confirm", "reject"]),
    confirmed: z.boolean().refine((value) => value, "validation.confirmed"),
  })
  .strict();
