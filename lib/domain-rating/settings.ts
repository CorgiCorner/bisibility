import { z } from "zod";

export const domainRatingSettingsSchema = z.object({
  projectId: z.string().min(1).max(120),
  enabled: z.boolean(),
});
